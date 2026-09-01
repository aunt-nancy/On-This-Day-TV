import { environmentStatus } from './config.js';
import { editionQuality } from './edition-quality.js';
import { exactDateEdition, exactDateStory, expectedIssueDate } from './exact-date.js';
import { runModel } from './openai.js';
import { insert, remove, select, update, upsert } from './supabase.js';

const ERAS=['y100','y200','y75'];
const MAX_ATTEMPTS=3;
const STALE_MS=4*60*1000;

function safeArray(v){return Array.isArray(v)?v:[];}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function nowIso(){return new Date().toISOString();}
function normalizeCommunity(v=''){return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function parts(run){const d=new Date(`${run.edition_date}T12:00:00Z`);return {month:d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),day:d.getUTCDate()};}
function normalizeStory(raw={}){
  const title=String(raw.title||raw.headline||'').trim();
  const sourceUrl=String(raw.sourceUrl||raw.source_url||raw.url||'').trim();
  if(!title||!sourceUrl)return null;
  return {...raw,title,sourceUrl,eventKey:raw.eventKey||raw.event_key||'',eraKey:raw.eraKey||raw.era_key||'',eraYear:raw.eraYear??raw.era_year??null,sourceDesk:raw.sourceDesk||raw.source_desk||'',publication:raw.publication||'',issueDate:raw.issueDate||raw.issue_date||null,page:raw.page||'',archive:raw.archive||'',community:raw.community||'',language:raw.language||'',articleType:raw.articleType||raw.article_type||'news',summary:raw.summary||raw.evidenceNotes||raw.evidence_notes||raw.verificationNotes||raw.verification_notes||'',evidenceNotes:raw.evidenceNotes||raw.evidence_notes||'',verificationNotes:raw.verificationNotes||raw.verification_notes||'',nationalImportance:raw.nationalImportance??raw.national_importance??0,confidence:num(raw.confidence)};
}
function storyId(s={}){return String(s.sourceUrl||`${s.eraKey||''}|${s.publication||''}|${s.title||''}`);}
function score(s={}){return num(s.confidence)*10+num(s.nationalImportance);}

async function latestJob(runId,key){const rows=await select('otd_agent_jobs',`select=*&run_id=eq.${runId}&agent_key=eq.${key}&order=attempt.desc,started_at.desc&limit=1`).catch(()=>[]);return rows[0]||null;}
async function prepareJob(run,key){
  let prior=await latestJob(run.id,key);
  if(prior?.status==='complete')return {state:'complete',job:prior,output:prior.output};
  if(prior?.status==='running'){
    const age=Date.now()-new Date(prior.started_at||0).getTime();
    if(Number.isFinite(age)&&age<STALE_MS)return {state:'running',job:prior};
    await update('otd_agent_jobs',`id=eq.${prior.id}`,{status:'failed',error:'Stale checkpoint repair job released automatically.',finished_at:nowIso()}).catch(()=>{});
    prior={...prior,status:'failed'};
  }
  const attempt=Math.max(0,Number(prior?.attempt||0))+1;
  if(attempt>MAX_ATTEMPTS)return {state:'terminal_failed',error:prior?.error||'Checkpoint repair attempts exhausted'};
  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:key,status:'running',attempt,started_at:nowIso()});
  return {state:'start',job,attempt};
}

function researchInstructions(run,eraKey){
  const p=parts(run), year=run.years?.[eraKey], exactDate=expectedIssueDate(run.edition_date,eraKey);
  const historicalNote=eraKey==='y200'?'A prior editorial review identified the Georgia–Creek land conflict as the expected September 1, 1826 national lead candidate. Independently verify it against exact-issue and circulation/reach evidence; do not accept it merely because it was suggested.':'';
  return `Return valid JSON only. You are a focused Major American Press checkpoint-repair subdesk for On This Day TV. Research ONLY ${p.month} ${p.day}, ${year} (${eraKey}). The newspaper issue date MUST be exactly ${exactDate}.

LOCKED CIRCULATION-FIRST RULE:
1. First identify U.S. newspapers with the largest documented circulation/subscriber reach for ${year}. If exact figures are unavailable for this era, use the strongest contemporaneous documentation of national reach/influence and say that exact figures are unavailable.
2. Inspect the exact ${exactDate} issue of the best-supported high-circulation/widest-reach newspaper(s).
3. Select the story that actually led or was most prominently displayed in those papers. If several top-reach papers emphasize the same event, prefer that shared event.
4. Use the ACTUAL printed headline when the scan/text supports it. Do not rewrite it into a modern headline.
5. Do not select a small local paper merely because its archive is easy to access.
6. Every choice must have an exact-date issue source URL plus a separate circulation/reach evidence URL when possible.
7. Never invent circulation figures, rankings, headlines, page placement, or URLs.
${historicalNote}

Return exactly:
{"agent":"checkpoint_lead_repair","eraKey":"${eraKey}","status":"complete","candidate":{"eraKey":"${eraKey}","eraYear":${year},"eventKey":"stable_event_slug","sourceDesk":"major_press","coverageScope":"national|multi_state|regional","nationalImportance":0,"title":"","summary":"","publication":"","city":"","issueDate":"${exactDate}","page":"","archive":"","sourceUrl":"","language":"English","articleType":"news|editorial|other","confidence":0,"circulationEvidence":{"basis":"documented_circulation|documented_reach_influence","rankOrReach":"","circulationFigure":"","circulationSourceUrl":"","issueSourceUrl":"","frontPageLead":true,"frontPageEvidence":"","notes":""}},"discrepancies":[]}.
If no candidate can be supported to this standard, set candidate=null and explain why in discrepancies.`;
}

async function runResearch(run,eraKey){
  const key=`checkpoint_lead_${eraKey}`;const prep=await prepareJob(run,key);if(prep.state!=='start')return prep;
  try{
    const env=environmentStatus();
    const result=await runModel({instructions:researchInstructions(run,eraKey),input:JSON.stringify({editionDate:run.edition_date,years:run.years,eraKey,expectedIssueDate:expectedIssueDate(run.edition_date,eraKey)}),model:env.models.research,webSearch:true,reasoning:'medium',maxOutputTokens:2600,timeoutMs:150000});
    const output=result.json||{};const candidate=normalizeStory(output.candidate||{});
    if(!candidate||candidate.eraKey!==eraKey||!exactDateStory(candidate,eraKey,run.edition_date)||!candidate.circulationEvidence?.issueSourceUrl||!candidate.circulationEvidence?.basis)throw new Error(`Checkpoint lead ${eraKey} lacks exact-date circulation/issue evidence`);
    output.candidate=candidate;
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'complete',output,confidence:num(candidate.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  }catch(error){await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});return {state:prep.attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',error:error.message};}
}

function verificationInstructions(run,candidates){
  return `Return valid JSON only. You are the Source Verification checkpoint-repair desk. Independently verify the proposed national leads for ${run.edition_date}.
For EACH candidate verify: exact historical issue date; printed headline/title; underlying event; circulation/reach evidence; and front-page/lead prominence when claimed. Reject convenient local-paper results. Never invent missing evidence.
Return {"agent":"checkpoint_lead_verification","status":"complete","verifiedCandidates":[],"rejectedCandidates":[],"discrepancies":[],"confidence":0}. Exactly one verified candidate is required for y200, y100, y75, and every verified candidate must preserve circulationEvidence. CANDIDATES:${JSON.stringify(candidates)}`;
}
async function runVerification(run,candidates){
  const key='checkpoint_lead_verification';const prep=await prepareJob(run,key);if(prep.state!=='start')return prep;
  try{
    const env=environmentStatus();
    const result=await runModel({instructions:verificationInstructions(run,candidates),input:JSON.stringify({editionDate:run.edition_date,candidates}),model:env.models.verify,webSearch:true,reasoning:'medium',maxOutputTokens:3200,timeoutMs:150000});
    const output=result.json||{};output.verifiedCandidates=safeArray(output.verifiedCandidates).map(normalizeStory).filter(Boolean);
    for(const eraKey of ERAS){const s=output.verifiedCandidates.find(x=>x.eraKey===eraKey);if(!s||!exactDateStory(s,eraKey,run.edition_date)||!s.circulationEvidence?.basis)throw new Error(`Circulation-first verification did not produce exact-date ${eraKey}`);}
    await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'complete',output,confidence:num(output.confidence),error:null,finished_at:nowIso()});return {state:'complete',output};
  }catch(error){await update('otd_agent_jobs',`id=eq.${prep.job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});return {state:prep.attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',error:error.message};}
}

function sourceToStory(row){return normalizeStory(row);}
function chooseCommunity(rows,leadEventKey,run){
  const map=new Map();
  for(const story of rows.filter(s=>s.eraKey==='y100'&&s.community&&exactDateStory(s,'y100',run.edition_date))){const key=normalizeCommunity(story.community);if(!key)continue;const prior=map.get(key);const same=Boolean(leadEventKey&&story.eventKey===leadEventKey);const priorSame=Boolean(prior&&leadEventKey&&prior.eventKey===leadEventKey);if(!prior||(same&&!priorSame)||(same===priorSame&&score(story)>score(prior)))map.set(key,story);}
  return [...map.values()].slice(0,12).map(s=>({...s,comparisonType:leadEventKey&&s.eventKey===leadEventKey?'same_event':'community_lead'}));
}
function storyRow(editionId,s,position){return {edition_id:editionId,era_key:s.eraKey||'',era_year:s.eraYear||null,event_key:s.eventKey||'',role:s.sourceDesk==='black_press'?'black_press':s.sourceDesk||'story',community:s.community||'',title:s.title,summary:s.summary||'',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',source_url:s.sourceUrl,language:s.language||'',article_type:s.articleType||'',confidence:num(s.confidence),verification_notes:s.verificationNotes||s.evidenceNotes||'',position};}

async function publishCorrected(run,checkpoint,verifiedLeads){
  const approvals=await select('otd_approvals',`select=*&run_id=eq.${run.id}&order=created_at.asc`).catch(()=>[]);
  if(approvals.some(a=>a.scope==='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved'))return {published:false,reason:'edition_approval_blocker'};
  const blockedUrls=new Set(approvals.filter(a=>a.scope!=='edition'&&['editorial','translation'].includes(a.category)&&a.status!=='approved').map(a=>a.source_url).filter(Boolean));
  const sourceRows=await select('otd_sources',`select=*&run_id=eq.${run.id}&verified=eq.true&order=confidence.desc`).catch(()=>[]);
  const existingStories=sourceRows.map(sourceToStory).filter(Boolean).filter(s=>!blockedUrls.has(s.sourceUrl));
  const byEra=Object.fromEntries(ERAS.map(k=>[k,verifiedLeads.find(s=>s.eraKey===k)]));
  const lead=byEra.y100,leadEventKey=lead.eventKey||'';
  const black=existingStories.filter(s=>s.eraKey==='y100'&&s.sourceDesk==='black_press'&&leadEventKey&&s.eventKey===leadEventKey&&exactDateStory(s,'y100',run.edition_date)).sort((a,b)=>score(b)-score(a))[0]||null;
  const used=new Set(verifiedLeads.map(storyId));if(black)used.add(storyId(black));
  const secondary=existingStories.filter(s=>s.eraKey==='y100'&&exactDateStory(s,'y100',run.edition_date)&&!used.has(storyId(s))).sort((a,b)=>score(b)-score(a)).slice(0,6);
  const communityTiles=chooseCommunity(existingStories,leadEventKey,run);
  const old=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;const oldPayload=old?.payload||{};
  const payload={...oldPayload,editionDate:run.edition_date,years:run.years||{},leadHeadline:lead.title,leadEventKey,stories:{y200:byEra.y200,y100:{major:lead,black:black||{},secondary},y75:byEra.y75},communityTiles,publicationStatus:'published',leadSelectionPolicy:'circulation_first_verified',circulationEvidence:{y200:byEra.y200.circulationEvidence,y100:lead.circulationEvidence,y75:byEra.y75.circulationEvidence},checkpointLeadRepair:true,checkpointPreservedAgents:checkpoint.completeKeys};
  const quality=editionQuality(payload),dateGate=exactDateEdition(payload,run.edition_date);if(!quality.publishable||!dateGate.publishable)return {published:false,reason:'corrected_payload_failed_quality',quality,dateGate};
  const now=nowIso();const [edition]=await upsert('otd_editions',{run_id:run.id,edition_date:run.edition_date,status:'published',lead_headline:payload.leadHeadline,years:run.years||{},payload,published_at:old?.published_at||now,updated_at:now},'edition_date').catch(()=>[]);if(!edition)return {published:false,reason:'corrected_edition_write_failed',quality,dateGate};
  for(const s of verifiedLeads){await upsert('otd_sources',{run_id:run.id,edition_date:run.edition_date,source_url:s.sourceUrl,event_key:s.eventKey||'',era_key:s.eraKey,era_year:s.eraYear,source_desk:'major_press',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',community:'',language:s.language||'English',article_type:s.articleType||'news',title:s.title,evidence_notes:`Circulation-first checkpoint repair. ${s.verificationNotes||s.evidenceNotes||''}`,confidence:num(s.confidence),verified:true},'run_id,source_url',{returning:false}).catch(()=>{});}
  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});const flat=[byEra.y200,lead,black,...secondary,byEra.y75,...communityTiles].filter(Boolean).map(normalizeStory).filter(Boolean);const dedupe=new Map();for(const s of flat)dedupe.set(storyId(s),s);const rows=[...dedupe.values()].map((s,i)=>storyRow(edition.id,s,i+1));if(rows.length)await insert('otd_stories',rows,{returning:false}).catch(()=>{});
  await update('otd_runs',`id=eq.${run.id}`,{status:'complete',stage:'complete',error:null,completed_at:run.completed_at||now,updated_at:now}).catch(()=>{});
  return {published:true,reason:'circulation_first_checkpoint_published',editionId:edition.id,quality,dateGate,storyCount:rows.length};
}

export async function repairCheckpointLeads(run,checkpoint){
  if(!run||!checkpoint?.locked)return {required:false,reason:'checkpoint_not_locked'};
  const existing=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null;
  if(existing?.status==='published'&&existing?.payload?.leadSelectionPolicy==='circulation_first_verified'&&editionQuality(existing.payload||{}).publishable&&exactDateEdition(existing.payload||{},run.edition_date).publishable)return {required:false,reason:'already_circulation_first',editionId:existing.id};

  const pending=[];for(const eraKey of ERAS){const job=await latestJob(run.id,`checkpoint_lead_${eraKey}`);if(job?.status!=='complete')pending.push(eraKey);}
  if(pending.length){const results=await Promise.all(pending.slice(0,2).map(k=>runResearch(run,k)));return {required:true,published:false,phase:'research',remaining:pending.length,results:results.map((r,i)=>({eraKey:pending[i],state:r.state,error:r.error||null}))};}
  const candidates=[];for(const eraKey of ERAS){const job=await latestJob(run.id,`checkpoint_lead_${eraKey}`);const c=normalizeStory(job?.output?.candidate||{});if(c)candidates.push(c);}if(candidates.length!==3)return {required:true,published:false,phase:'research',reason:'three_leads_not_available'};
  const verify=await runVerification(run,candidates);if(verify.state!=='complete')return {required:true,published:false,phase:'verification',state:verify.state,error:verify.error||null};
  const verified=safeArray(verify.output?.verifiedCandidates).map(normalizeStory).filter(Boolean);if(verified.length<3)return {required:true,published:false,phase:'verification',reason:'verified_leads_incomplete'};
  const published=await publishCorrected(run,checkpoint,verified);return {required:true,phase:'publish',...published};
}
