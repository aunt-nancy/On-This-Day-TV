import { environmentStatus } from './config.js';
import { editionQuality } from './edition-quality.js';
import { exactDateEdition, exactDateStory, expectedIssueDate } from './exact-date.js';
import { runModel } from './openai.js';
import { insert, remove, select, update, upsert } from './supabase.js';

const ERAS=['y100','y200','y75'];
const MAX_ATTEMPTS=6;
const STALE_MS=4*60*1000;
const JOB_PREFIX='checkpoint2_lead_';
const VERIFY_KEY='checkpoint2_lead_verification';

function safeArray(v){return Array.isArray(v)?v:[];}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function nowIso(){return new Date().toISOString();}
function normalizeCommunity(v=''){return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function parts(run){const d=new Date(`${run.edition_date}T12:00:00Z`);return {month:d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),day:d.getUTCDate()};}

function normalizeStory(raw={}){
  if(!raw||typeof raw!=='object')return null;
  const title=String(raw.title||raw.headline||'').trim();
  const sourceUrl=String(raw.sourceUrl||raw.source_url||raw.url||'').trim();
  if(!title||!sourceUrl)return null;
  const circulationEvidence=raw.circulationEvidence&&typeof raw.circulationEvidence==='object'
    ? {...raw.circulationEvidence}
    : {};
  // sourceUrl already IS the exact newspaper-issue/article source. Do not reject
  // otherwise-valid evidence just because the model omitted the redundant copy.
  if(!circulationEvidence.issueSourceUrl) circulationEvidence.issueSourceUrl=sourceUrl;
  if(!circulationEvidence.basis){
    if(circulationEvidence.circulationFigure) circulationEvidence.basis='documented_circulation';
    else if(circulationEvidence.circulationSourceUrl||circulationEvidence.rankOrReach||circulationEvidence.notes) circulationEvidence.basis='documented_reach_influence';
  }
  return {
    ...raw,title,sourceUrl,circulationEvidence,
    eventKey:raw.eventKey||raw.event_key||'',
    eraKey:raw.eraKey||raw.era_key||'',
    eraYear:raw.eraYear??raw.era_year??null,
    sourceDesk:raw.sourceDesk||raw.source_desk||'major_press',
    publication:raw.publication||'',
    issueDate:raw.issueDate||raw.issue_date||null,
    page:raw.page||'',archive:raw.archive||'',community:raw.community||'',
    language:raw.language||'English',articleType:raw.articleType||raw.article_type||'news',
    summary:raw.summary||raw.evidenceNotes||raw.evidence_notes||raw.verificationNotes||raw.verification_notes||'',
    evidenceNotes:raw.evidenceNotes||raw.evidence_notes||'',
    verificationNotes:raw.verificationNotes||raw.verification_notes||'',
    nationalImportance:raw.nationalImportance??raw.national_importance??0,
    confidence:num(raw.confidence),
  };
}
function storyId(s={}){return String(s.sourceUrl||`${s.eraKey||''}|${s.publication||''}|${s.title||''}`);}
function score(s={}){return num(s.confidence)*10+num(s.nationalImportance);}
function hasReachEvidence(story){
  const e=story?.circulationEvidence||{};
  return Boolean(e.basis&&(e.circulationSourceUrl||e.rankOrReach||e.circulationFigure||e.notes));
}

async function latestJob(runId,key){
  const rows=await select('otd_agent_jobs',`select=*&run_id=eq.${runId}&agent_key=eq.${key}&order=attempt.desc,started_at.desc&limit=1`).catch(()=>[]);
  return rows[0]||null;
}
async function prepareJob(run,key){
  let prior=await latestJob(run.id,key);
  if(prior?.status==='complete')return {state:'complete',job:prior,output:prior.output};
  if(prior?.status==='running'){
    const age=Date.now()-new Date(prior.started_at||0).getTime();
    if(Number.isFinite(age)&&age<STALE_MS)return {state:'running',job:prior};
    await update('otd_agent_jobs',`id=eq.${prior.id}`,{status:'failed',error:'Stale checkpoint lead-repair job released automatically.',finished_at:nowIso()}).catch(()=>{});
    prior={...prior,status:'failed'};
  }
  const attempt=Math.max(0,Number(prior?.attempt||0))+1;
  if(attempt>MAX_ATTEMPTS)return {state:'terminal_failed',error:prior?.error||'Checkpoint lead-repair attempts exhausted'};
  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:key,status:'running',attempt,started_at:nowIso()});
  return {state:'start',job,attempt};
}

function eraHints(eraKey){
  if(eraKey==='y200') return 'Start with Daily National Intelligencer / National Intelligencer, Daily National Journal, New-York Evening Post, Richmond Enquirer, Columbian Centinel and other documented high-reach early-Republic papers. Specifically test the Georgia–Creek land conflict as a candidate, but verify it independently.';
  if(eraKey==='y100') return 'Start by establishing 1926 circulation/reach leaders, including high-circulation New York and Chicago metropolitan dailies and other documented circulation leaders. Do not choose a small local paper because its archive is easy.';
  return 'Start by establishing 1951 circulation/reach leaders, including the highest-circulation metropolitan/national dailies of 1951. Compare front-page prominence across more than one leading paper when accessible.';
}
function researchInstructions(run,eraKey){
  const p=parts(run),year=run.years?.[eraKey],exactDate=expectedIssueDate(run.edition_date,eraKey);
  return `Return valid JSON only. You are the circulation-first national-lead repair desk for On This Day TV. Research ONLY ${p.month} ${p.day}, ${year}. The newspaper issue date MUST be exactly ${exactDate}.

EDITORIAL CONTRACT
1. Establish which U.S. newspapers had the largest documented circulation/subscriber reach or, where exact figures are not available, the strongest documented contemporary reach/influence for ${year}.
2. Inspect the exact ${exactDate} issue of those leading papers.
3. Choose the story that actually led or received the strongest front-page prominence. If several leading papers emphasize the same event, prefer that shared event.
4. Use the actual printed headline when the issue scan/text supports it. Never modernize or invent the headline.
5. sourceUrl must identify the exact-date issue/article evidence. circulationEvidence must separately explain why the publication qualifies as a circulation/reach leader; include a circulationSourceUrl whenever one is available.
6. A documented reach/influence basis is acceptable when exact circulation figures for the historical era cannot be responsibly established.
7. Never invent circulation figures, rankings, dates, headlines, page placement or URLs.

SEARCH HINTS: ${eraHints(eraKey)}

Return:
{"agent":"checkpoint_lead_repair_v2","eraKey":"${eraKey}","status":"complete","candidate":{"eraKey":"${eraKey}","eraYear":${year},"eventKey":"stable_event_slug","sourceDesk":"major_press","coverageScope":"national|multi_state|regional","nationalImportance":0,"title":"","summary":"","publication":"","city":"","issueDate":"${exactDate}","page":"","archive":"","sourceUrl":"","language":"English","articleType":"news|editorial|other","confidence":0,"circulationEvidence":{"basis":"documented_circulation|documented_reach_influence","rankOrReach":"","circulationFigure":"","circulationSourceUrl":"","issueSourceUrl":"","frontPageLead":true,"frontPageEvidence":"","notes":""}},"discrepancies":[]}.
If you cannot support a candidate to this standard, set candidate=null and explain the missing evidence in discrepancies.`;
}
async function runResearch(run,eraKey){
  const key=`${JOB_PREFIX}${eraKey}`;
  const prep=await prepareJob(run,key);if(prep.state!=='start')return prep;
  try{
    const env=environmentStatus();
    const result=await runModel({instructions:researchInstructions(run,eraKey),input:JSON.stringify({editionDate:run.edition_date,eraKey,year:run.years?.[eraKey],expectedIssueDate:expectedIssueDate(run.edition_date,eraKey)}),model:env.models.research,webSearch:true,reasoning:'medium',maxOutputTokens:2800,timeoutMs:150000});
    const output=result.json||{};const candidate=normalizeStory(output.candidate||{});
    if(!candidate||candidate.eraKey!==eraKey)throw new Error(`No usable ${eraKey} circulation-first candidate returned`);
    if(!exactDateStory(candidate,eraKey,run.edition_date))throw new Error(`${eraKey} candidate is not from exact issue date ${expectedIssueDate(run.edition_date,eraKey)}`);
    if(!hasReachEvidence(candidate))throw new Error(`${eraKey} candidate lacks documented circulation/reach evidence`);
    output.candidate=candidate;
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'complete',output,confidence:num(candidate.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  }catch(error){
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
    return {state:prep.attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',error:error.message};
  }
}

function verificationInstructions(run,candidates){
  return `Return valid JSON only. You are the independent Source Verification desk for the circulation-first checkpoint repair.
Independently verify EACH proposed lead for its exact historical issue date, printed headline/title, underlying event, circulation/reach evidence, and claimed lead/front-page prominence. Use institutional/original newspaper evidence whenever available. Reject a convenient local-paper candidate when its circulation/reach basis is not supported. Do not invent missing evidence.
Return {"agent":"checkpoint_lead_verification_v2","status":"complete","verifiedCandidates":[],"rejectedCandidates":[],"discrepancies":[],"confidence":0}. Exactly one verified candidate is required for y200, y100 and y75. Preserve circulationEvidence and exact sourceUrl. CANDIDATES:${JSON.stringify(candidates)}`;
}
async function runVerification(run,candidates){
  const prep=await prepareJob(run,VERIFY_KEY);if(prep.state!=='start')return prep;
  try{
    const env=environmentStatus();
    const result=await runModel({instructions:verificationInstructions(run,candidates),input:JSON.stringify({editionDate:run.edition_date,candidates}),model:env.models.verify,webSearch:true,reasoning:'medium',maxOutputTokens:3400,timeoutMs:150000});
    const output=result.json||{};
    output.verifiedCandidates=safeArray(output.verifiedCandidates).map(normalizeStory).filter(Boolean);
    for(const eraKey of ERAS){
      const story=output.verifiedCandidates.find(s=>s.eraKey===eraKey);
      if(!story)throw new Error(`Independent verification did not return ${eraKey}`);
      if(!exactDateStory(story,eraKey,run.edition_date))throw new Error(`Independent verification returned off-date ${eraKey}`);
      if(!hasReachEvidence(story))throw new Error(`Independent verification did not preserve circulation/reach evidence for ${eraKey}`);
    }
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'complete',output,confidence:num(output.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  }catch(error){
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
    return {state:prep.attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',error:error.message};
  }
}

function sourceToStory(row){return normalizeStory(row);}
function chooseCommunity(rows,leadEventKey,run){
  const map=new Map();
  for(const story of rows.filter(s=>s.eraKey==='y100'&&s.community&&exactDateStory(s,'y100',run.edition_date))){
    const key=normalizeCommunity(story.community);if(!key)continue;
    const prior=map.get(key);const same=Boolean(leadEventKey&&story.eventKey===leadEventKey);const priorSame=Boolean(prior&&leadEventKey&&prior.eventKey===leadEventKey);
    if(!prior||(same&&!priorSame)||(same===priorSame&&score(story)>score(prior)))map.set(key,story);
  }
  return [...map.values()].slice(0,12).map(s=>({...s,comparisonType:leadEventKey&&s.eventKey===leadEventKey?'same_event':'community_lead'}));
}
function storyRow(editionId,s,position){return {edition_id:editionId,era_key:s.eraKey||'',era_year:s.eraYear||null,event_key:s.eventKey||'',role:s.sourceDesk==='black_press'?'black_press':s.sourceDesk||'story',community:s.community||'',title:s.title,summary:s.summary||'',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',source_url:s.sourceUrl,language:s.language||'',article_type:s.articleType||'',confidence:num(s.confidence),verification_notes:s.verificationNotes||s.evidenceNotes||'',position};}

async function publishCorrected(run,checkpoint,verifiedLeads){
  const approvals=await select('otd_approvals',`select=*&run_id=eq.${run.id}&order=created_at.asc`).catch(()=>[]);
  // Only an unresolved CURRENT edition-wide review may pause the corrected edition.
  // Old rejected/discarded content must not block unrelated verified replacement leads.
  if(approvals.some(a=>a.scope==='edition'&&['editorial','translation'].includes(a.category)&&a.status==='pending'))return {published:false,reason:'edition_approval_pending'};
  const blockedUrls=new Set(approvals.filter(a=>a.scope!=='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved').map(a=>a.source_url).filter(Boolean));
  const blockedEvents=new Set(approvals.filter(a=>a.scope!=='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved'&&!a.source_url).map(a=>a.event_key).filter(Boolean));
  const sourceRows=await select('otd_sources',`select=*&run_id=eq.${run.id}&verified=eq.true&order=confidence.desc`).catch(()=>[]);
  const existingStories=sourceRows.map(sourceToStory).filter(Boolean).filter(s=>!blockedUrls.has(s.sourceUrl)&&!(s.eventKey&&blockedEvents.has(s.eventKey)));
  const byEra=Object.fromEntries(ERAS.map(k=>[k,verifiedLeads.find(s=>s.eraKey===k)]));
  if(ERAS.some(k=>!byEra[k]))return {published:false,reason:'verified_lead_missing'};
  const lead=byEra.y100,leadEventKey=lead.eventKey||'';
  const black=existingStories.filter(s=>s.eraKey==='y100'&&s.sourceDesk==='black_press'&&leadEventKey&&s.eventKey===leadEventKey&&exactDateStory(s,'y100',run.edition_date)).sort((a,b)=>score(b)-score(a))[0]||null;
  const used=new Set(verifiedLeads.map(storyId));if(black)used.add(storyId(black));
  const secondary=existingStories.filter(s=>s.eraKey==='y100'&&exactDateStory(s,'y100',run.edition_date)&&!used.has(storyId(s))).sort((a,b)=>score(b)-score(a)).slice(0,6);
  const communityTiles=chooseCommunity(existingStories,leadEventKey,run);
  const old=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;
  const oldPayload=old?.payload||{};
  const payload={
    ...oldPayload,editionDate:run.edition_date,years:run.years||{},leadHeadline:lead.title,leadEventKey,
    stories:{y200:byEra.y200,y100:{major:lead,black:black||{},secondary},y75:byEra.y75},
    communityTiles,publicationStatus:'published',leadSelectionPolicy:'circulation_first_verified_v2',
    circulationEvidence:{y200:byEra.y200.circulationEvidence,y100:lead.circulationEvidence,y75:byEra.y75.circulationEvidence},
    checkpointLeadRepair:true,checkpointPreservedAgents:checkpoint.completeKeys,
  };
  const quality=editionQuality(payload),dateGate=exactDateEdition(payload,run.edition_date);
  if(!quality.publishable||!dateGate.publishable)return {published:false,reason:'corrected_payload_failed_quality',quality,dateGate};
  const now=nowIso();
  const [edition]=await upsert('otd_editions',{run_id:run.id,edition_date:run.edition_date,status:'published',lead_headline:payload.leadHeadline,years:run.years||{},payload,published_at:old?.published_at||now,updated_at:now},'edition_date').catch(()=>[]);
  if(!edition)return {published:false,reason:'corrected_edition_write_failed',quality,dateGate};
  for(const s of verifiedLeads){
    await upsert('otd_sources',{run_id:run.id,edition_date:run.edition_date,source_url:s.sourceUrl,event_key:s.eventKey||'',era_key:s.eraKey,era_year:s.eraYear,source_desk:'major_press',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',community:'',language:s.language||'English',article_type:s.articleType||'news',title:s.title,evidence_notes:`Circulation-first checkpoint repair v2. ${s.verificationNotes||s.evidenceNotes||''}`,confidence:num(s.confidence),verified:true},'run_id,source_url',{returning:false}).catch(()=>{});
  }
  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});
  const flat=[byEra.y200,lead,black,...secondary,byEra.y75,...communityTiles].filter(Boolean).map(normalizeStory).filter(Boolean);
  const dedupe=new Map();for(const s of flat)dedupe.set(storyId(s),s);
  const rows=[...dedupe.values()].map((s,i)=>storyRow(edition.id,s,i+1));if(rows.length)await insert('otd_stories',rows,{returning:false}).catch(()=>{});
  await update('otd_runs',`id=eq.${run.id}`,{status:'complete',stage:'complete',error:null,completed_at:run.completed_at||now,updated_at:now}).catch(()=>{});
  return {published:true,reason:'circulation_first_checkpoint_published_v2',editionId:edition.id,quality,dateGate,storyCount:rows.length};
}

export async function repairCheckpointLeads(run,checkpoint){
  if(!run||!checkpoint?.locked)return {required:false,reason:'checkpoint_not_locked'};
  const existing=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;
  if(existing?.status==='published'&&existing?.payload?.leadSelectionPolicy==='circulation_first_verified_v2'&&editionQuality(existing.payload||{}).publishable&&exactDateEdition(existing.payload||{},run.edition_date).publishable){
    return {required:false,reason:'already_circulation_first_v2',published:true,editionId:existing.id};
  }

  const pending=[];
  for(const eraKey of ERAS){const job=await latestJob(run.id,`${JOB_PREFIX}${eraKey}`);if(job?.status!=='complete')pending.push(eraKey);}
  if(pending.length){
    const selected=pending.slice(0,2);
    const results=await Promise.all(selected.map(k=>runResearch(run,k)));
    return {required:true,published:false,phase:'research',remaining:pending.length,results:results.map((r,i)=>({eraKey:selected[i],state:r.state,error:r.error||null}))};
  }

  const candidates=[];
  for(const eraKey of ERAS){const job=await latestJob(run.id,`${JOB_PREFIX}${eraKey}`);const c=normalizeStory(job?.output?.candidate||{});if(c)candidates.push(c);}
  if(candidates.length!==3)return {required:true,published:false,phase:'research',reason:'three_exact_date_leads_not_available'};

  const verify=await runVerification(run,candidates);
  if(verify.state!=='complete')return {required:true,published:false,phase:'verification',state:verify.state,error:verify.error||null};
  const verified=safeArray(verify.output?.verifiedCandidates).map(normalizeStory).filter(Boolean);
  if(verified.length<3)return {required:true,published:false,phase:'verification',reason:'verified_exact_date_leads_incomplete'};
  const published=await publishCorrected(run,checkpoint,verified);
  return {required:true,phase:'publish',...published};
}
