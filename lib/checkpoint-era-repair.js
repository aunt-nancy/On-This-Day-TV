import { environmentStatus } from './config.js';
import { exactDateStory, expectedIssueDate } from './exact-date.js';
import { runModel } from './openai.js';
import { publishEditionSlots } from './publisher.js';
import { insert, select, update } from './supabase.js';

const ERAS=['y100','y200','y75'];
const MAX_ATTEMPTS=6;
const STALE_MS=4*60*1000;
const RESEARCH_PREFIX='singlepub_research_';
const VERIFY_PREFIX='singlepub_verify_';

function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function nowIso(){return new Date().toISOString();}
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
  return {
    ...raw,title,sourceUrl,circulationEvidence,
    eventKey:raw.eventKey||raw.event_key||'',
    eraKey:raw.eraKey||raw.era_key||'',
    eraYear:raw.eraYear??raw.era_year??null,
    sourceDesk:raw.sourceDesk||raw.source_desk||'major_press',
    publication:raw.publication||'',city:raw.city||'',
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
    await update('otd_agent_jobs',`id=eq.${prior.id}`,{status:'failed',error:'Stale single-publisher era job released automatically.',finished_at:nowIso()}).catch(()=>{});
    prior={...prior,status:'failed'};
  }
  const attempt=Math.max(0,Number(prior?.attempt||0))+1;
  if(attempt>MAX_ATTEMPTS)return {state:'terminal_failed',error:prior?.error||'Single-publisher era attempts exhausted'};
  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:key,status:'running',attempt,started_at:nowIso()});
  return {state:'start',job,attempt};
}

function hint(eraKey){
  if(eraKey==='y200')return 'Start with the National Intelligencer/Daily National Intelligencer, Daily National Journal, New-York Evening Post, Richmond Enquirer, Columbian Centinel and other documented high-reach early-Republic papers. Independently test the Georgia–Creek land conflict as the likely national lead.';
  if(eraKey==='y100')return 'Establish the highest-circulation or widest-reach U.S. newspapers of 1926 first and inspect their exact September 1 front pages. Explicitly reject the August 30 Valentino/Ranger Times item.';
  return 'Establish the highest-circulation or widest-reach U.S. newspapers of 1951 first and inspect their exact September 1 front pages.';
}
function researchPrompt(run,eraKey){
  const exactDate=expectedIssueDate(run.edition_date,eraKey);
  const year=run.years?.[eraKey];
  return `Return valid JSON only. Find ONE circulation-first national newspaper lead for On This Day TV for exactly ${exactDate}.
Rules: establish the highest-circulation or widest-documented-reach U.S. newspapers for ${year}; inspect the exact ${exactDate} issue; choose the actual lead/most prominent national story; prefer a shared event when several circulation leaders emphasize it; use the actual printed headline when verifiable; sourceUrl must point to exact-date issue/article evidence; circulationEvidence must explain the publication's circulation/reach standing and include a circulationSourceUrl when available; never invent dates, headlines, rankings, figures, placement or URLs.
Search hint: ${hint(eraKey)}
Return {"candidate":{"eraKey":"${eraKey}","eraYear":${year},"eventKey":"stable_event_slug","sourceDesk":"major_press","nationalImportance":0,"title":"","summary":"","publication":"","city":"","issueDate":"${exactDate}","page":"","archive":"","sourceUrl":"","language":"English","articleType":"news|editorial|other","confidence":0,"circulationEvidence":{"basis":"documented_circulation|documented_reach_influence","rankOrReach":"","circulationFigure":"","circulationSourceUrl":"","issueSourceUrl":"","frontPageLead":true,"frontPageEvidence":"","notes":""}},"discrepancies":[]}.
If no candidate meets the standard, candidate=null.`;
}
async function researchEra(run,eraKey){
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
  return `Return valid JSON only. Independently verify this ONE historical newspaper lead. Required issue date: ${expectedIssueDate(run.edition_date,eraKey)}. Verify the exact issue date, actual printed headline/title, event summary, publication identity, circulation/reach evidence, and lead/front-page prominence when claimed. Reject off-date reports, later retrospectives, or publications without supported circulation/reach standing. Never invent missing evidence. Return {"verified":true|false,"story":{},"reason":"","confidence":0}. If verified=true preserve sourceUrl, issueDate and circulationEvidence. Candidate:${JSON.stringify(candidate)}`;
}
async function verifyEra(run,eraKey,candidate){
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
async function verifiedSlots(run){
  const slots={};
  for(const eraKey of ERAS){
    const job=await latestJob(run.id,`${VERIFY_PREFIX}${eraKey}`);
    const story=normalizeStory(job?.status==='complete'?job.output?.story:null);
    if(story&&exactDateStory(story,eraKey,run.edition_date))slots[eraKey]=story;
  }
  return slots;
}
async function publishProgress(run,checkpoint){
  const slots=await verifiedSlots(run);
  return publishEditionSlots(run,{slots,policy:'single_authoritative_publisher_v1',checkpointKeys:checkpoint.completeKeys||[]});
}

export async function repairCheckpointEras(run,checkpoint){
  if(!run||!checkpoint?.locked)return {required:false,reason:'checkpoint_not_locked'};

  const before=await publishProgress(run,checkpoint);
  const tasks=[];const meta=[];
  for(const eraKey of ERAS){
    if(tasks.length>=2)break;
    const verified=await latestJob(run.id,`${VERIFY_PREFIX}${eraKey}`);
    if(verified?.status==='complete')continue;
    const research=await latestJob(run.id,`${RESEARCH_PREFIX}${eraKey}`);
    if(research?.status==='complete'){
      const candidate=normalizeStory(research.output?.candidate||{});
      if(candidate){tasks.push(()=>verifyEra(run,eraKey,candidate));meta.push({eraKey,phase:'verify'});continue;}
    }
    tasks.push(()=>researchEra(run,eraKey));meta.push({eraKey,phase:'research'});
  }

  const results=tasks.length?await Promise.all(tasks.map(fn=>fn())):[];
  const after=await publishProgress(run,checkpoint);
  const progress={};
  for(const eraKey of ERAS){
    const research=await latestJob(run.id,`${RESEARCH_PREFIX}${eraKey}`);
    const verify=await latestJob(run.id,`${VERIFY_PREFIX}${eraKey}`);
    progress[eraKey]={
      expectedIssueDate:expectedIssueDate(run.edition_date,eraKey),
      research:research?.status||'pending',researchAttempt:Number(research?.attempt||0),researchError:research?.error||null,
      verify:verify?.status||'pending',verifyAttempt:Number(verify?.attempt||0),verifyError:verify?.error||null,
      published:Boolean(after?.core?.[eraKey]),
    };
  }
  return {required:true,before,after,tasks:results.map((r,i)=>({...meta[i],state:r.state,error:r.error||null})),progress};
}
