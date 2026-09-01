import { environmentStatus } from './config.js';
import { runModel } from './openai.js';
import { exactDateStory, expectedIssueDate, sanitizeExactDateEdition } from './exact-date.js';
import { insert, remove, select, update, upsert } from './supabase.js';

const ERAS=['y100','y200','y75'];
const MAX_ATTEMPTS=6;
const STALE_MS=4*60*1000;
const RESEARCH_PREFIX='checkpoint3_research_';
const VERIFY_PREFIX='checkpoint3_verify_';

function safeArray(v){return Array.isArray(v)?v:[];}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function nowIso(){return new Date().toISOString();}
function normalizeCommunity(v=''){return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function normalizeStory(raw={}){
  if(!raw||typeof raw!=='object')return null;
  const title=String(raw.title||raw.headline||'').trim();
  const sourceUrl=String(raw.sourceUrl||raw.source_url||raw.url||'').trim();
  if(!title||!sourceUrl)return null;
  const circulationEvidence=raw.circulationEvidence&&typeof raw.circulationEvidence==='object'?{...raw.circulationEvidence}:{};
  if(!circulationEvidence.issueSourceUrl) circulationEvidence.issueSourceUrl=sourceUrl;
  if(!circulationEvidence.basis){
    if(circulationEvidence.circulationFigure) circulationEvidence.basis='documented_circulation';
    else if(circulationEvidence.circulationSourceUrl||circulationEvidence.rankOrReach||circulationEvidence.notes) circulationEvidence.basis='documented_reach_influence';
  }
  return {...raw,title,sourceUrl,circulationEvidence,eventKey:raw.eventKey||raw.event_key||'',eraKey:raw.eraKey||raw.era_key||'',eraYear:raw.eraYear??raw.era_year??null,sourceDesk:raw.sourceDesk||raw.source_desk||'major_press',publication:raw.publication||'',city:raw.city||'',issueDate:raw.issueDate||raw.issue_date||null,page:raw.page||'',archive:raw.archive||'',community:raw.community||'',language:raw.language||'English',articleType:raw.articleType||raw.article_type||'news',summary:raw.summary||raw.evidenceNotes||raw.evidence_notes||raw.verificationNotes||raw.verification_notes||'',evidenceNotes:raw.evidenceNotes||raw.evidence_notes||'',verificationNotes:raw.verificationNotes||raw.verification_notes||'',nationalImportance:raw.nationalImportance??raw.national_importance??0,confidence:num(raw.confidence)};
}
function hasReachEvidence(s){const e=s?.circulationEvidence||{};return Boolean(e.basis&&(e.circulationSourceUrl||e.rankOrReach||e.circulationFigure||e.notes));}
function storyId(s={}){return String(s.sourceUrl||`${s.eraKey||''}|${s.publication||''}|${s.title||''}`);}
function score(s={}){return num(s.confidence)*10+num(s.nationalImportance);}

async function latestJob(runId,key){const rows=await select('otd_agent_jobs',`select=*&run_id=eq.${runId}&agent_key=eq.${key}&order=attempt.desc,started_at.desc&limit=1`).catch(()=>[]);return rows[0]||null;}
async function prepareJob(run,key){
  let prior=await latestJob(run.id,key);
  if(prior?.status==='complete')return {state:'complete',output:prior.output,job:prior};
  if(prior?.status==='running'){
    const age=Date.now()-new Date(prior.started_at||0).getTime();
    if(Number.isFinite(age)&&age<STALE_MS)return {state:'running',job:prior};
    await update('otd_agent_jobs',`id=eq.${prior.id}`,{status:'failed',error:'Stale per-era checkpoint repair released automatically.',finished_at:nowIso()}).catch(()=>{});
    prior={...prior,status:'failed'};
  }
  const attempt=Math.max(0,Number(prior?.attempt||0))+1;
  if(attempt>MAX_ATTEMPTS)return {state:'terminal_failed',error:prior?.error||'Per-era repair attempts exhausted'};
  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:key,status:'running',attempt,started_at:nowIso()});
  return {state:'start',job,attempt};
}

function eraHint(eraKey){
  if(eraKey==='y200')return 'Start with the Daily National Intelligencer/National Intelligencer, Daily National Journal, New-York Evening Post, Richmond Enquirer, Columbian Centinel and other documented high-reach early-Republic papers. Independently test the Georgia–Creek land conflict as a likely September 1, 1826 national lead.';
  if(eraKey==='y100')return 'Establish the highest-circulation/widest-reach U.S. papers of 1926 first. Compare their exact September 1 front pages. Do not use the August 30 Valentino/Ranger Times story or another convenient local-paper result.';
  return 'Establish the highest-circulation/widest-reach U.S. papers of 1951 first, then compare their exact September 1 front pages and lead placement.';
}
function researchPrompt(run,eraKey){
  const exactDate=expectedIssueDate(run.edition_date,eraKey);const year=run.years?.[eraKey];
  return `Return valid JSON only. Research ONE national newspaper lead for On This Day TV: ${exactDate} (${eraKey}, ${year}).

LOCKED RULES
- Identify the highest-circulation or widest-documented-reach U.S. newspapers for ${year} before choosing the story.
- Inspect the exact ${exactDate} issue.
- Choose the actual lead/most prominent national story; when several circulation leaders emphasize the same event, prefer that shared event.
- Use the actual printed headline when verifiable.
- sourceUrl must be an exact-date issue/article source.
- circulationEvidence must explain why this publication qualifies as a circulation/reach leader; include circulationSourceUrl when available.
- Never invent dates, headlines, circulation figures, rankings, placement or URLs.

SEARCH HINT: ${eraHint(eraKey)}

Return {"agent":"checkpoint3_research","status":"complete","candidate":{"eraKey":"${eraKey}","eraYear":${year},"eventKey":"stable_event_slug","sourceDesk":"major_press","nationalImportance":0,"title":"","summary":"","publication":"","city":"","issueDate":"${exactDate}","page":"","archive":"","sourceUrl":"","language":"English","articleType":"news|editorial|other","confidence":0,"circulationEvidence":{"basis":"documented_circulation|documented_reach_influence","rankOrReach":"","circulationFigure":"","circulationSourceUrl":"","issueSourceUrl":"","frontPageLead":true,"frontPageEvidence":"","notes":""}},"discrepancies":[]}.
If no candidate meets the standard, set candidate=null and explain why.`;
}
async function runResearch(run,eraKey){
  const prep=await prepareJob(run,`${RESEARCH_PREFIX}${eraKey}`);if(prep.state!=='start')return prep;
  try{
    const env=environmentStatus();
    const result=await runModel({instructions:researchPrompt(run,eraKey),input:JSON.stringify({editionDate:run.edition_date,eraKey,expectedIssueDate:expectedIssueDate(run.edition_date,eraKey)}),model:env.models.research,webSearch:true,reasoning:'medium',maxOutputTokens:2800,timeoutMs:150000});
    const output=result.json||{};const candidate=normalizeStory(output.candidate||{});
    if(!candidate)throw new Error(`${eraKey} research returned no usable candidate`);
    if(candidate.eraKey!==eraKey||!exactDateStory(candidate,eraKey,run.edition_date))throw new Error(`${eraKey} candidate is not from ${expectedIssueDate(run.edition_date,eraKey)}`);
    if(!hasReachEvidence(candidate))throw new Error(`${eraKey} candidate lacks circulation/reach evidence`);
    output.candidate=candidate;
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'complete',output,confidence:num(candidate.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  }catch(error){
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
    return {state:prep.attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',error:error.message};
  }
}
function verifyPrompt(run,eraKey,candidate){
  return `Return valid JSON only. Independently verify ONE circulation-first historical newspaper lead for On This Day TV.
Candidate era: ${eraKey}. Required issue date: ${expectedIssueDate(run.edition_date,eraKey)}.
Verify: exact issue date; actual printed headline/title; event summary; publication identity; circulation/reach basis; and lead/front-page prominence when claimed. Prefer institutional/original newspaper evidence. Reject it if the source is off-date, merely reports the event later, or the publication is not supported as a circulation/reach leader. Never invent missing evidence.
Return {"agent":"checkpoint3_verify","status":"complete","verified":true|false,"story":{},"reason":"","confidence":0}. If verified=true, story must preserve exact sourceUrl, issueDate and circulationEvidence.
CANDIDATE:${JSON.stringify(candidate)}`;
}
async function runVerify(run,eraKey,candidate){
  const prep=await prepareJob(run,`${VERIFY_PREFIX}${eraKey}`);if(prep.state!=='start')return prep;
  try{
    const env=environmentStatus();
    const result=await runModel({instructions:verifyPrompt(run,eraKey,candidate),input:JSON.stringify({editionDate:run.edition_date,eraKey,candidate}),model:env.models.verify,webSearch:true,reasoning:'medium',maxOutputTokens:2400,timeoutMs:150000});
    const output=result.json||{};const story=normalizeStory(output.story||candidate);
    if(output.verified!==true)throw new Error(output.reason||`${eraKey} independent verification rejected candidate`);
    if(!story||story.eraKey!==eraKey||!exactDateStory(story,eraKey,run.edition_date))throw new Error(`${eraKey} verification did not preserve exact date`);
    if(!hasReachEvidence(story))throw new Error(`${eraKey} verification lacks circulation/reach evidence`);
    output.story=story;output.verified=true;
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'complete',output,confidence:num(output.confidence||story.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  }catch(error){
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
    return {state:prep.attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',error:error.message};
  }
}

async function verifiedEraStories(run){
  const out={};
  for(const eraKey of ERAS){const job=await latestJob(run.id,`${VERIFY_PREFIX}${eraKey}`);const story=normalizeStory(job?.status==='complete'?job.output?.story:null);if(story&&exactDateStory(story,eraKey,run.edition_date))out[eraKey]=story;}
  return out;
}
function normalizeExistingSource(row){return normalizeStory(row);}
function chooseCommunity(rows,leadEventKey,run){
  const map=new Map();
  for(const story of rows.filter(s=>s?.eraKey==='y100'&&s.community&&exactDateStory(s,'y100',run.edition_date))){
    const key=normalizeCommunity(story.community);if(!key)continue;
    const prior=map.get(key);const same=Boolean(leadEventKey&&story.eventKey===leadEventKey);const priorSame=Boolean(prior&&leadEventKey&&prior.eventKey===leadEventKey);
    if(!prior||(same&&!priorSame)||(same===priorSame&&score(story)>score(prior)))map.set(key,story);
  }
  return [...map.values()].slice(0,12).map(s=>({...s,comparisonType:leadEventKey&&s.eventKey===leadEventKey?'same_event':'community_lead'}));
}
function storyRow(editionId,s,position){return {edition_id:editionId,era_key:s.eraKey||'',era_year:s.eraYear||null,event_key:s.eventKey||'',role:s.sourceDesk==='black_press'?'black_press':s.sourceDesk||'story',community:s.community||'',title:s.title,summary:s.summary||'',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',source_url:s.sourceUrl,language:s.language||'',article_type:s.articleType||'',confidence:num(s.confidence),verification_notes:s.verificationNotes||s.evidenceNotes||'',position};}

async function publishVerifiedProgress(run,checkpoint){
  const verified=await verifiedEraStories(run);
  const verifiedCount=Object.keys(verified).length;
  const existing=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;
  const base=sanitizeExactDateEdition(existing?.payload||{},run.edition_date).payload;
  if(!verifiedCount){
    if(existing?.status==='published'&&sanitizeExactDateEdition(existing.payload||{},run.edition_date).publishable)return {published:true,partial:true,reason:'existing_exact_date_partial_preserved'};
    return {published:false,reason:'no_verified_repair_era_yet'};
  }

  base.stories=base.stories||{};base.stories.y100=base.stories.y100||{};
  if(verified.y200)base.stories.y200=verified.y200;
  if(verified.y75)base.stories.y75=verified.y75;
  if(verified.y100){
    const oldLead=base.stories.y100.major||{};
    const changed=storyId(oldLead)!==storyId(verified.y100);
    base.stories.y100.major=verified.y100;
    base.leadHeadline=verified.y100.title;
    base.leadEventKey=verified.y100.eventKey||'';
    if(changed&&base.stories.y100.black?.eventKey!==base.leadEventKey)base.stories.y100.black={};
  }

  const approvals=await select('otd_approvals',`select=*&run_id=eq.${run.id}&order=created_at.asc`).catch(()=>[]);
  const blockedUrls=new Set(approvals.filter(a=>a.scope!=='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved').map(a=>a.source_url).filter(Boolean));
  const sourceRows=await select('otd_sources',`select=*&run_id=eq.${run.id}&verified=eq.true&order=confidence.desc`).catch(()=>[]);
  const existingStories=sourceRows.map(normalizeExistingSource).filter(Boolean).filter(s=>!blockedUrls.has(s.sourceUrl));
  if(verified.y100){
    const leadEventKey=base.leadEventKey||'';
    const black=existingStories.filter(s=>s.eraKey==='y100'&&s.sourceDesk==='black_press'&&exactDateStory(s,'y100',run.edition_date)&&leadEventKey&&s.eventKey===leadEventKey).sort((a,b)=>score(b)-score(a))[0]||null;
    base.stories.y100.black=black||{};
    const used=new Set([verified.y100,black].filter(Boolean).map(storyId));
    base.stories.y100.secondary=existingStories.filter(s=>s.eraKey==='y100'&&exactDateStory(s,'y100',run.edition_date)&&!used.has(storyId(s))).sort((a,b)=>score(b)-score(a)).slice(0,6);
    base.communityTiles=chooseCommunity(existingStories,leadEventKey,run);
  }

  const sanitized=sanitizeExactDateEdition(base,run.edition_date);
  if(!sanitized.publishable)return {published:false,reason:'sanitized_progress_empty'};
  const payload=sanitized.payload;
  payload.leadSelectionPolicy='circulation_first_per_era_v3';
  payload.checkpointPreservedAgents=checkpoint.completeKeys;
  payload.checkpointEraRepair=true;
  payload.circulationEvidence={
    ...(payload.circulationEvidence||{}),
    ...(verified.y200?{y200:verified.y200.circulationEvidence}:{}),
    ...(verified.y100?{y100:verified.y100.circulationEvidence}:{}),
    ...(verified.y75?{y75:verified.y75.circulationEvidence}:{}),
  };

  const now=nowIso();
  const [edition]=await upsert('otd_editions',{run_id:run.id,edition_date:run.edition_date,status:'published',lead_headline:payload.leadHeadline||'',years:run.years||payload.years||{},payload,published_at:existing?.published_at||now,updated_at:now},'edition_date').catch(()=>[]);
  if(!edition)return {published:false,reason:'partial_edition_write_failed'};

  for(const story of Object.values(verified)){
    await upsert('otd_sources',{run_id:run.id,edition_date:run.edition_date,source_url:story.sourceUrl,event_key:story.eventKey||'',era_key:story.eraKey,era_year:story.eraYear,source_desk:'major_press',publication:story.publication||'',city:story.city||'',issue_date:story.issueDate||null,page:story.page||'',archive:story.archive||'',community:'',language:story.language||'English',article_type:story.articleType||'news',title:story.title,evidence_notes:`Per-era circulation-first checkpoint repair. ${story.verificationNotes||story.evidenceNotes||''}`,confidence:num(story.confidence),verified:true},'run_id,source_url',{returning:false}).catch(()=>{});
  }

  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});
  const s=payload.stories||{},y100=s.y100||{};
  const flat=[s.y200,y100.major,y100.black,...safeArray(y100.secondary),s.y75,...safeArray(payload.communityTiles)].map(normalizeStory).filter(Boolean);
  const dedupe=new Map();for(const story of flat)dedupe.set(storyId(story),story);
  const rows=[...dedupe.values()].map((story,i)=>storyRow(edition.id,story,i+1));if(rows.length)await insert('otd_stories',rows,{returning:false}).catch(()=>{});
  return {published:true,partial:!sanitized.complete,reason:sanitized.complete?'all_three_eras_published':'verified_eras_published_independently',editionId:edition.id,validCoreCount:sanitized.validCoreCount,missingCore:sanitized.missingCore,storyCount:rows.length};
}

export async function repairCheckpointEras(run,checkpoint){
  if(!run||!checkpoint?.locked)return {required:false,reason:'checkpoint_not_locked'};

  const before=await publishVerifiedProgress(run,checkpoint);
  const tasks=[];
  const taskMeta=[];
  for(const eraKey of ERAS){
    if(tasks.length>=2)break;
    const verify=await latestJob(run.id,`${VERIFY_PREFIX}${eraKey}`);
    if(verify?.status==='complete')continue;
    const research=await latestJob(run.id,`${RESEARCH_PREFIX}${eraKey}`);
    if(research?.status==='complete'){
      const candidate=normalizeStory(research.output?.candidate||{});
      if(candidate){tasks.push(()=>runVerify(run,eraKey,candidate));taskMeta.push({eraKey,phase:'verify'});continue;}
    }
    tasks.push(()=>runResearch(run,eraKey));taskMeta.push({eraKey,phase:'research'});
  }

  const results=tasks.length?await Promise.all(tasks.map(fn=>fn())):[];
  const after=await publishVerifiedProgress(run,checkpoint);
  const progress={};
  for(const eraKey of ERAS){
    const r=await latestJob(run.id,`${RESEARCH_PREFIX}${eraKey}`);const v=await latestJob(run.id,`${VERIFY_PREFIX}${eraKey}`);
    progress[eraKey]={research:r?.status||'pending',researchError:r?.error||null,verify:v?.status||'pending',verifyError:v?.error||null};
  }
  return {required:true,before,after,tasks:results.map((r,i)=>({...taskMeta[i],state:r.state,error:r.error||null})),progress};
}
