import { exactDateStory, sanitizeExactDateEdition } from './exact-date.js';
import { insert, remove, select, upsert } from './supabase.js';

function safeArray(v){ return Array.isArray(v)?v:[]; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function normalizeStory(raw={}){
  if(!raw||typeof raw!=='object') return null;
  const title=String(raw.title||raw.headline||'').trim();
  const sourceUrl=String(raw.sourceUrl||raw.source_url||raw.url||'').trim();
  if(!title||!sourceUrl) return null;
  return {
    ...raw,title,sourceUrl,
    eventKey:raw.eventKey||raw.event_key||'',
    eraKey:raw.eraKey||raw.era_key||'',
    eraYear:raw.eraYear??raw.era_year??null,
    sourceDesk:raw.sourceDesk||raw.source_desk||'',
    publication:raw.publication||'',city:raw.city||'',
    issueDate:raw.issueDate||raw.issue_date||null,
    page:raw.page||'',archive:raw.archive||'',community:raw.community||'',
    language:raw.language||'',articleType:raw.articleType||raw.article_type||'news',
    summary:raw.summary||raw.evidenceNotes||raw.evidence_notes||raw.verificationNotes||raw.verification_notes||'',
    evidenceNotes:raw.evidenceNotes||raw.evidence_notes||'',
    verificationNotes:raw.verificationNotes||raw.verification_notes||'',
    nationalImportance:raw.nationalImportance??raw.national_importance??0,
    confidence:num(raw.confidence),
  };
}
function keyOfStory(s={}){return String(s.sourceUrl||`${s.eraKey||''}|${s.publication||''}|${s.title||''}`);}
function storyRow(editionId,s,position){
  return {edition_id:editionId,era_key:s.eraKey||'',era_year:s.eraYear||null,event_key:s.eventKey||'',role:s.sourceDesk==='black_press'?'black_press':s.sourceDesk||'story',community:s.community||'',title:s.title||'',summary:s.summary||'',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',source_url:s.sourceUrl||'',language:s.language||'',article_type:s.articleType||'',confidence:num(s.confidence),verification_notes:s.verificationNotes||s.evidenceNotes||'',position};
}
function flattenEdition(payload={}){
  const s=payload.stories||{},y100=s.y100||{};
  const all=[s.y200,y100.major,y100.black,...safeArray(y100.secondary),s.y75,...safeArray(payload.communityTiles)].map(normalizeStory).filter(Boolean);
  const dedupe=new Map();for(const story of all)dedupe.set(keyOfStory(story),story);return [...dedupe.values()];
}

export async function publishEditionSlots(run,{slots={},basePayload=null,policy='single_publisher',checkpointKeys=[]}={}){
  if(!run) return {published:false,reason:'no_run'};
  const existing=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;
  const seed=basePayload??existing?.payload??{editionDate:run.edition_date,years:run.years||{},stories:{y100:{}}};
  const sanitizedSeed=sanitizeExactDateEdition(seed,run.edition_date).payload;
  sanitizedSeed.stories=sanitizedSeed.stories||{};
  sanitizedSeed.stories.y100=sanitizedSeed.stories.y100||{};

  const accepted={};
  for(const eraKey of ['y200','y100','y75']){
    const story=normalizeStory(slots[eraKey]);
    if(!story) continue;
    if(!exactDateStory(story,eraKey,run.edition_date)) continue;
    accepted[eraKey]=story;
  }

  if(accepted.y200) sanitizedSeed.stories.y200=accepted.y200;
  if(accepted.y75) sanitizedSeed.stories.y75=accepted.y75;
  if(accepted.y100){
    const oldLead=normalizeStory(sanitizedSeed.stories.y100.major)||null;
    sanitizedSeed.stories.y100.major=accepted.y100;
    sanitizedSeed.leadHeadline=accepted.y100.title;
    sanitizedSeed.leadEventKey=accepted.y100.eventKey||'';
    if(oldLead&&keyOfStory(oldLead)!==keyOfStory(accepted.y100)&&sanitizedSeed.stories.y100.black?.eventKey!==sanitizedSeed.leadEventKey){
      sanitizedSeed.stories.y100.black={};
    }
  }

  const final=sanitizeExactDateEdition(sanitizedSeed,run.edition_date);
  if(!final.publishable) return {published:false,reason:'no_exact_date_slots',accepted:Object.keys(accepted),missingCore:final.missingCore};
  const payload=final.payload;
  payload.publisherPolicy=policy;
  payload.publicationStatus=final.complete?'published':'published_partial';
  payload.checkpointPreservedAgents=checkpointKeys;
  payload.publishedCore=final.core;
  payload.missingCoreEras=final.missingCore;

  const now=new Date().toISOString();
  const [edition]=await upsert('otd_editions',{
    run_id:run.id,
    edition_date:run.edition_date,
    status:'published',
    lead_headline:payload.leadHeadline||'',
    years:run.years||payload.years||{},
    payload,
    published_at:existing?.published_at||now,
    updated_at:now,
  },'edition_date').catch(()=>[]);
  if(!edition) return {published:false,reason:'edition_write_failed'};

  for(const story of Object.values(accepted)){
    await upsert('otd_sources',{
      run_id:run.id,edition_date:run.edition_date,source_url:story.sourceUrl,event_key:story.eventKey||'',era_key:story.eraKey,era_year:story.eraYear,source_desk:story.sourceDesk||'major_press',publication:story.publication||'',city:story.city||'',issue_date:story.issueDate||null,page:story.page||'',archive:story.archive||'',community:story.community||'',language:story.language||'',article_type:story.articleType||'news',title:story.title,evidence_notes:story.verificationNotes||story.evidenceNotes||'',confidence:num(story.confidence),verified:true,
    },'run_id,source_url',{returning:false}).catch(()=>{});
  }

  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});
  const rows=flattenEdition(payload).map((story,i)=>storyRow(edition.id,story,i+1));
  if(rows.length) await insert('otd_stories',rows,{returning:false}).catch(()=>{});
  return {published:true,editionId:edition.id,complete:final.complete,core:final.core,missingCore:final.missingCore,accepted:Object.keys(accepted),storyCount:rows.length,payload};
}
