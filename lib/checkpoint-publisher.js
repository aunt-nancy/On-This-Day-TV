import { AGENTS } from './agents.js';
import { editionQuality } from './edition-quality.js';
import { insert, remove, select, update, upsert } from './supabase.js';

function safeArray(v){ return Array.isArray(v)?v:[]; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function latestByKey(jobs=[]){
  const map=new Map();
  for(const job of jobs){
    const prior=map.get(job.agent_key);
    const pa=Number(prior?.attempt||0), ja=Number(job?.attempt||0);
    const pt=new Date(prior?.finished_at||prior?.started_at||0).getTime();
    const jt=new Date(job?.finished_at||job?.started_at||0).getTime();
    if(!prior||ja>pa||(ja===pa&&jt>=pt)) map.set(job.agent_key,job);
  }
  return map;
}

export async function agentCheckpoint(run){
  if(!run) return {locked:false,complete:0,expected:AGENTS.length,jobs:[]};
  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);
  const latest=latestByKey(jobs);
  const completeKeys=AGENTS.filter(a=>latest.get(a.key)?.status==='complete').map(a=>a.key);
  return {locked:completeKeys.length===AGENTS.length,complete:completeKeys.length,expected:AGENTS.length,completeKeys,jobs,latest};
}

function normalizeStory(raw={}){
  if(!raw||typeof raw!=='object') return null;
  const title=String(raw.title||raw.headline||'').trim();
  const sourceUrl=String(raw.sourceUrl||raw.source_url||raw.url||'').trim();
  if(!title||!sourceUrl) return null;
  return {
    ...raw,
    title,
    sourceUrl,
    eventKey:raw.eventKey||raw.event_key||'',
    eraKey:raw.eraKey||raw.era_key||'',
    eraYear:raw.eraYear??raw.era_year??null,
    sourceDesk:raw.sourceDesk||raw.source_desk||'',
    issueDate:raw.issueDate||raw.issue_date||null,
    publication:raw.publication||'',
    city:raw.city||'',
    page:raw.page||'',
    archive:raw.archive||'',
    community:raw.community||'',
    language:raw.language||'',
    articleType:raw.articleType||raw.article_type||'news',
    summary:raw.summary||raw.evidenceNotes||raw.evidence_notes||raw.verificationNotes||raw.verification_notes||'',
    evidenceNotes:raw.evidenceNotes||raw.evidence_notes||raw.verificationNotes||raw.verification_notes||'',
    verificationNotes:raw.verificationNotes||raw.verification_notes||raw.evidenceNotes||raw.evidence_notes||'',
    nationalImportance:raw.nationalImportance??raw.national_importance??0,
    confidence:num(raw.confidence),
  };
}
function storyId(s={}){ return String(s.sourceUrl||`${s.eraKey||''}|${s.publication||''}|${s.title||''}`); }
function score(s={}){ return num(s.nationalImportance)*100+num(s.confidence); }
function best(rows,era,predicate=()=>true){
  return rows.filter(s=>s?.eraKey===era&&predicate(s)).sort((a,b)=>score(b)-score(a))[0]||null;
}
function normalizeCommunity(v=''){return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}

function normalizeEdition(raw={},verifiedUrls=new Set()){
  const s=raw?.stories||{}; const y100=s?.y100||{};
  const keep=story=>{const n=normalizeStory(story);return n&&verifiedUrls.has(n.sourceUrl)?n:null;};
  const major=keep(y100.major);
  const leadEventKey=major?.eventKey||raw.leadEventKey||'';
  let black=keep(y100.black); if(black&&leadEventKey&&black.eventKey!==leadEventKey) black=null;
  const secondary=safeArray(y100.secondary).map(keep).filter(Boolean);
  const communityTiles=safeArray(raw.communityTiles).map(keep).filter(Boolean).map(story=>({
    ...story,
    comparisonType:leadEventKey&&story.eventKey===leadEventKey?'same_event':'community_lead',
  }));
  return {
    ...raw,
    stories:{y200:keep(s.y200)||{},y100:{major:major||{},black:black||{},secondary},y75:keep(s.y75)||{}},
    leadHeadline:major?.title||raw.leadHeadline||'',
    leadEventKey,
    communityTiles,
  };
}

function assemble(run,rows,verifiedMeta={}){
  const requested=verifiedMeta?.recommendedLeadByEra||{};
  const y200=best(rows,'y200',s=>s.sourceDesk==='major_press'&&(!requested.y200||s.eventKey===requested.y200))||best(rows,'y200',s=>s.sourceDesk==='major_press')||best(rows,'y200');
  const y75=best(rows,'y75',s=>s.sourceDesk==='major_press'&&(!requested.y75||s.eventKey===requested.y75))||best(rows,'y75',s=>s.sourceDesk==='major_press')||best(rows,'y75');
  const y100Major=best(rows,'y100',s=>s.sourceDesk==='major_press'&&(!requested.y100||s.eventKey===requested.y100))||best(rows,'y100',s=>s.sourceDesk==='major_press')||best(rows,'y100');
  const leadEventKey=y100Major?.eventKey||requested.y100||verifiedMeta?.recommendedLeadEventKey||'';
  const y100Black=best(rows,'y100',s=>s.sourceDesk==='black_press'&&(!leadEventKey||s.eventKey===leadEventKey));
  const used=new Set([y200,y75,y100Major,y100Black].filter(Boolean).map(storyId));
  const secondary=rows.filter(s=>s.eraKey==='y100'&&!used.has(storyId(s))).sort((a,b)=>score(b)-score(a)).slice(0,6);
  const communities=new Map();
  for(const story of rows.filter(s=>s.eraKey==='y100')){
    const key=normalizeCommunity(story.community); if(!key) continue;
    const prior=communities.get(key); const same=Boolean(leadEventKey&&story.eventKey===leadEventKey); const priorSame=Boolean(prior&&leadEventKey&&prior.eventKey===leadEventKey);
    if(!prior||(same&&!priorSame)||(same===priorSame&&score(story)>score(prior))) communities.set(key,story);
  }
  return {
    editionDate:run.edition_date,
    years:run.years||{},
    leadHeadline:y100Major?.title||'',
    leadEventKey,
    stories:{y200:y200||{},y100:{major:y100Major||{},black:y100Black||{},secondary},y75:y75||{}},
    communityTiles:[...communities.values()].slice(0,12).map(s=>({...s,comparisonType:leadEventKey&&s.eventKey===leadEventKey?'same_event':'community_lead'})),
    sourceSummary:rows.map(s=>({publication:s.publication,sourceUrl:s.sourceUrl,eraKey:s.eraKey,eventKey:s.eventKey})),
    publicationStatus:'published',
    checkpointRecovery:true,
  };
}

function flattenEdition(payload={}){
  const s=payload.stories||{}, y100=s.y100||{};
  const all=[s.y200,y100.major,y100.black,...safeArray(y100.secondary),s.y75,...safeArray(payload.communityTiles)].map(normalizeStory).filter(Boolean);
  const map=new Map(); for(const story of all) map.set(storyId(story),story); return [...map.values()];
}
function storyRow(editionId,s,position){return {edition_id:editionId,era_key:s.eraKey||'',era_year:s.eraYear||null,event_key:s.eventKey||'',role:s.sourceDesk==='black_press'?'black_press':s.sourceDesk||'story',community:s.community||'',title:s.title,summary:s.summary||'',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',source_url:s.sourceUrl,language:s.language||'',article_type:s.articleType||'',confidence:num(s.confidence),verification_notes:s.verificationNotes||s.evidenceNotes||'',position};}

export async function publishFromAgentCheckpoint(run){
  const checkpoint=await agentCheckpoint(run);
  if(!checkpoint.locked) return {...checkpoint,published:false,reason:'checkpoint_not_complete'};

  const existing=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;
  if(existing?.status==='published'&&editionQuality(existing.payload||{}).publishable){
    return {...checkpoint,published:false,reason:'already_publishable',editionId:existing.id,quality:editionQuality(existing.payload||{})};
  }

  const approvals=await select('otd_approvals',`select=*&run_id=eq.${run.id}&order=created_at.asc`).catch(()=>[]);
  const editionBlocker=approvals.some(a=>a.scope==='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved');
  if(editionBlocker) return {...checkpoint,published:false,reason:'edition_approval_blocker'};
  const blockedUrls=new Set(approvals.filter(a=>a.scope!=='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved').map(a=>a.source_url).filter(Boolean));
  const blockedEvents=new Set(approvals.filter(a=>a.scope!=='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved'&&!a.source_url).map(a=>a.event_key).filter(Boolean));

  const verifyJob=checkpoint.latest.get('source_verification');
  const verifiedMeta=verifyJob?.output||{};
  const fromJob=safeArray(verifiedMeta.verifiedStories).map(normalizeStory).filter(Boolean);
  const sourceRows=await select('otd_sources',`select=*&run_id=eq.${run.id}&verified=eq.true&order=confidence.desc`).catch(()=>[]);
  const fromSources=sourceRows.map(normalizeStory).filter(Boolean);
  const combined=new Map();
  for(const s of fromSources) combined.set(storyId(s),s);
  for(const s of fromJob) combined.set(storyId(s),{...combined.get(storyId(s)),...s});
  const verified=[...combined.values()].filter(s=>!blockedUrls.has(s.sourceUrl)&&!(s.eventKey&&blockedEvents.has(s.eventKey)));
  const verifiedUrls=new Set(verified.map(s=>s.sourceUrl));
  if(!verified.length) return {...checkpoint,published:false,reason:'no_verified_checkpoint_stories'};

  let payload=null, method='';
  const editor=checkpoint.latest.get('editor_producer')?.output?.edition;
  if(editor){
    const candidate=normalizeEdition(editor,verifiedUrls);
    candidate.editionDate=run.edition_date; candidate.years=run.years||candidate.years||{}; candidate.publicationStatus='published'; candidate.checkpointRecovery=true;
    if(editionQuality(candidate).publishable){payload=candidate;method='closing_desk_checkpoint';}
  }
  if(!payload){
    const candidate=assemble(run,verified,verifiedMeta);
    if(editionQuality(candidate).publishable){payload=candidate;method='verified_source_checkpoint';}
  }
  if(!payload){
    const quality=editionQuality(assemble(run,verified,verifiedMeta));
    if(existing?.status==='published') await update('otd_editions',`id=eq.${existing.id}`,{status:'preparing',published_at:null,updated_at:new Date().toISOString()}).catch(()=>{});
    return {...checkpoint,published:false,reason:'checkpoint_missing_core_story',quality};
  }

  const thenNow=checkpoint.latest.get('then_now')?.output||null;
  const recipe=checkpoint.latest.get('archive_recipe')?.output?.recipe||null;
  const illustrations=checkpoint.latest.get('illustrator')?.output?.placements||null;
  if(thenNow) payload.thenNow=thenNow;
  if(recipe) payload.archiveRecipe=recipe;
  if(illustrations) payload.illustrations=illustrations;
  payload.checkpointMethod=method;

  const quality=editionQuality(payload);
  const now=new Date().toISOString();
  const [edition]=await upsert('otd_editions',{run_id:run.id,edition_date:run.edition_date,status:'published',lead_headline:payload.leadHeadline||'',years:run.years||payload.years||{},payload,published_at:existing?.published_at||now,updated_at:now},'edition_date').catch(()=>[]);
  if(!edition) return {...checkpoint,published:false,reason:'checkpoint_edition_write_failed',quality};

  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});
  const rows=flattenEdition(payload).map((s,i)=>storyRow(edition.id,s,i+1));
  if(rows.length) await insert('otd_stories',rows,{returning:false}).catch(()=>{});
  await update('otd_runs',`id=eq.${run.id}`,{status:'complete',stage:'complete',completed_at:run.completed_at||now,error:null,updated_at:now}).catch(()=>{});
  return {...checkpoint,published:true,reason:'checkpoint_published',method,editionId:edition.id,quality,storyCount:rows.length};
}
