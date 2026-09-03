import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';
import { sanitizeExactDateEdition } from '../exact-date.js';

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

  const exact=sanitizeExactDateEdition(payload,today);
  if(!exact.publishable) return null;
  return {
    edition:{
      ...(stored||{}),
      run_id:run.id,
      edition_date:today,
      status:'published',
      payload:exact.payload,
    },
    exact,
  };
}

export default async function handler(req,res){
  try{
    const today=siteDate();
    const rows=await select('otd_editions',`select=*&edition_date=eq.${today}&limit=1`).catch(()=>[]);
    const stored=rows[0]||null;
    const storedExact=stored?sanitizeExactDateEdition(stored.payload||{},today):null;

    let edition=stored&&stored.status==='published'&&storedExact?.publishable
      ? {...stored,payload:storedExact.payload}
      : null;
    let exactDate=edition?storedExact:null;
    let servingVerifiedRecovery=false;

    if(!edition){
      const recovery=await verifiedRecovery(today,stored);
      if(recovery){
        edition=recovery.edition;
        exactDate=recovery.exact;
        servingVerifiedRecovery=true;
      }
    }

    return json(res,200,{
      ok:true,
      requestedDate:today,
      edition,
      servingFallback:false,
      servingVerifiedRecovery,
      status:edition?'published':'preparing',
      exactDate:exactDate?{
        complete:exactDate.complete,
        validCoreCount:exactDate.validCoreCount,
        core:exactDate.core,
        missingCore:exactDate.missingCore,
        invalid:exactDate.invalid,
      }:null,
      partial:Boolean(edition&&exactDate&&!exactDate.complete),
      message:edition
        ? (exactDate?.complete?null:`Publishing verified exact-date stories now; still preparing: ${(exactDate?.missingCore||[]).join(', ')}.`)
        :`The ${today} edition is still being prepared with exact-date historical newspaper issues.`
    });
  }catch(error){
    return json(res,200,{ok:false,edition:null,error:error.message});
  }
}
