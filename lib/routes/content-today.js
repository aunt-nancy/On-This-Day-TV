import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';
import { sanitizeExactDateEdition } from '../exact-date.js';
import { publishEditionSlots } from '../publisher.js';
import { applyEditorialSupplements } from '../editorial-supplements.js';

function safeArray(value){ return Array.isArray(value)?value:[]; }
function score(story={}){
  const importance=Number(story.nationalImportance||0);
  const confidence=Number(story.confidence||0);
  return (Number.isFinite(importance)?importance:0)*100+(Number.isFinite(confidence)?confidence:0);
}
function best(rows,eraKey,predicate=()=>true){
  return rows.filter(s=>s?.eraKey===eraKey&&s?.title&&s?.sourceUrl&&predicate(s)).sort((a,b)=>score(b)-score(a))[0]||null;
}
function sourceKey(story={}){ return String(story.sourceUrl||`${story.eraKey||''}|${story.publication||''}|${story.title||''}`); }

export function normalizePublishedEdition(row){
  if(!row||row.status!=='published') return null;
  const editionDate=String(row.edition_date||row.payload?.editionDate||'');
  if(!editionDate) return null;
  const exact=sanitizeExactDateEdition(applyEditorialSupplements(row.payload||{},editionDate),editionDate);
  if(!exact.complete) return null;
  return {edition:{...row,edition_date:editionDate,payload:exact.payload},exact};
}

async function latestPublishedBefore(today){
  const rows=await select('otd_editions',`select=*&status=eq.published&edition_date=lt.${today}&order=edition_date.desc&limit=60`).catch(()=>[]);
  for(const row of rows){
    const normalized=normalizePublishedEdition(row);
    if(normalized) return normalized;
  }
  return null;
}

async function verifiedRecovery(today,stored){
  const runs=await select('otd_runs',`select=*&edition_date=eq.${today}&run_kind=eq.daily&order=created_at.desc&limit=1`).catch(()=>[]);
  const run=runs[0]||null;
  if(!run) return null;

  const jobs=await select('otd_agent_jobs',`select=output&run_id=eq.${run.id}&agent_key=eq.source_verification&status=eq.complete&order=finished_at.desc&limit=1`).catch(()=>[]);
  const verified=jobs[0]?.output||null;
  const stories=safeArray(verified?.verifiedStories);
  if(!stories.length) return null;

  const y200=best(stories,'y200',s=>s.sourceDesk==='major_press')||best(stories,'y200');
  const y100=best(stories,'y100',s=>s.sourceDesk==='major_press')||best(stories,'y100');
  const y75=best(stories,'y75',s=>s.sourceDesk==='major_press')||best(stories,'y75');
  const used=new Set([y200,y100,y75].filter(Boolean).map(sourceKey));
  const secondary=stories
    .filter(s=>s?.eraKey==='y100'&&s?.title&&s?.sourceUrl&&!used.has(sourceKey(s)))
    .sort((a,b)=>score(b)-score(a)).slice(0,6);

  const base=structuredClone(stored?.payload||{});
  const payload={
    ...base,
    editionDate:today,
    years:run.years||base.years||{},
    leadHeadline:y100?.title||'',
    leadEventKey:y100?.eventKey||'',
    stories:{
      y200:y200||{},
      y100:{major:y100||{},black:{},secondary},
      y75:y75||{},
    },
    communityTiles:safeArray(base.communityTiles),
    publicationStatus:'published_partial',
    verifiedRecovery:true,
  };

  const exact=sanitizeExactDateEdition(applyEditorialSupplements(payload,today),today);
  if(!exact.complete) return null;
  const now=new Date().toISOString();
  const published=await publishEditionSlots(run,{
    slots:{y200,y100,y75},
    basePayload:exact.payload,
    policy:'single_verified_recovery_v1',
  }).catch(()=>null);
  const served=sanitizeExactDateEdition(applyEditorialSupplements(published?.payload||exact.payload,today),today);
  return {
    edition:{
      ...(stored||{}),
      ...(published?.editionId?{id:published.editionId}:{}),
      run_id:run.id,
      edition_date:today,
      status:'published',
      published_at:stored?.published_at||now,
      payload:served.payload,
    },
    exact:served,
  };
}

export default async function handler(req,res){
  try{
    const today=siteDate();
    // Resolve the current and rollover editions together. On a missing-date
    // request this keeps the public page from waiting through serial database
    // round trips before it can render the latest complete publication.
    const [rows,prior]=await Promise.all([
      select('otd_editions',`select=*&edition_date=eq.${today}&limit=1`).catch(()=>[]),
      latestPublishedBefore(today),
    ]);
    const stored=rows[0]||null;
    const current=normalizePublishedEdition(stored);

    let edition=current?.edition||null;
    let exactDate=current?.exact||null;
    let servingVerifiedRecovery=false;

    // A request-time verified recovery is useful only when the newsroom has
    // already created today's edition row. If there is no row yet, the cron
    // remains the publication owner and the public response stays read-only.
    if(!edition&&stored){
      const recovery=await verifiedRecovery(today,stored);
      if(recovery){
        edition=recovery.edition;
        exactDate=recovery.exact;
        servingVerifiedRecovery=true;
      }
    }

    if(!edition&&prior){
        edition=prior.edition;
        exactDate=prior.exact;
    }

    const servingFallback=Boolean(edition&&edition.edition_date!==today);

    return json(res,200,{
      ok:true,
      requestedDate:today,
      displayedDate:edition?.edition_date||null,
      edition,
      servingFallback,
      servingVerifiedRecovery,
      status:edition?'published':'unavailable',
      exactDate:exactDate?{
        complete:exactDate.complete,
        validCoreCount:exactDate.validCoreCount,
        core:exactDate.core,
        missingCore:exactDate.missingCore,
        invalid:exactDate.invalid,
      }:null,
      partial:Boolean(edition&&exactDate&&!exactDate.complete),
      message:null,
    });
  }catch(error){
    return json(res,200,{ok:false,status:'unavailable',edition:null,error:error.message});
  }
}
