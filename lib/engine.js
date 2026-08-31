import crypto from 'node:crypto';
import { AGENTS, computeEditionDate } from './agents.js';
import { environmentStatus, assertCoreEnvironment, SITE_TIME_ZONE } from './config.js';
import { runModel } from './openai.js';
import { dispatchPosts } from './social.js';
import { insert, select, update, upsert, remove, rpc } from './supabase.js';
import {
  editorOpeningPrompt, researchPrompt, majorPressEraPrompt, contextPrompt, translationPrompt,
  verificationPrompt, visualArchivePrompt, rightsPrompt, discrepancyPrompt,
  editorPrompt, thenNowPrompt, archiveRecipePrompt, socialPrompt, trendsPrompt,
} from './prompts.js';

const MAX_ATTEMPTS = 3;
const MAJOR_SUB_MAX_ATTEMPTS = 4;
const MAJOR_SUBDESKS = ['y100','y200','y75'];
const STALE_MS = 4 * 60 * 1000;
const TERMINAL = new Set(['complete','skipped']);
const CRITICAL = new Set(['major_press','source_verification','discrepancy_exception','editor_producer']);

export const STAGES = [
  'opening','major_research','supporting_research','context','verification',
  'visuals','rights','exceptions','publish','features','social_create','trends','distribution','complete'
];

export function siteDate(now = new Date(), timeZone = SITE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function nowIso() { return new Date().toISOString(); }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function num(value) { const n=Number(value); return Number.isFinite(n) ? n : 0; }
function encoded(value) { return encodeURIComponent(String(value ?? '')); }
function keyOfStory(s={}) { return String(s.sourceUrl || s.eventKey || `${s.eraKey}|${s.publication}|${s.title}`); }
function visualIdentity(v={}) { return String(v.sourcePageUrl || v.sourceUrl || v.assetUrl || v.downloadUrl || v.thumbnailUrl || ''); }

async function latestJob(runId, agentKey) {
  const rows = await select('otd_agent_jobs', `select=*&run_id=eq.${runId}&agent_key=eq.${agentKey}&order=attempt.desc,started_at.desc&limit=1`).catch(()=>[]);
  return rows[0] || null;
}
async function completeOutput(runId, agentKey) {
  const rows = await select('otd_agent_jobs', `select=output&run_id=eq.${runId}&agent_key=eq.${agentKey}&status=eq.complete&order=finished_at.desc&limit=1`).catch(()=>[]);
  return rows[0]?.output || null;
}
async function allOutputs(runId, keys) {
  const out={};
  for (const key of keys) out[key]=await completeOutput(runId,key);
  return out;
}

function modelFor(agentKey) {
  const env=environmentStatus();
  if (['source_verification','discrepancy_exception'].includes(agentKey)) return env.models.verify;
  if (['editor_opening','editor_producer'].includes(agentKey)) return env.models.editor;
  return env.models.research;
}

function promptFor(agentKey, context, deps={}) {
  switch(agentKey) {
    case 'editor_opening': return { ...editorOpeningPrompt(context), webSearch:false, reasoning:'medium' };
    case 'major_press': return { ...researchPrompt('major_press',context,deps.agenda||{},[]), webSearch:true, reasoning:'medium' };
    case 'black_press':
    case 'regional_local':
    case 'community_press': return { ...researchPrompt(agentKey,context,deps.agenda||{},deps.anchorCandidates||[]), webSearch:true, reasoning:'medium' };
    case 'historical_context': return { ...contextPrompt(context,deps.research||[]), webSearch:false, reasoning:'medium' };
    case 'translation': return { ...translationPrompt(context,deps.research||[]), webSearch:false, reasoning:'low' };
    case 'source_verification': return { ...verificationPrompt(context,deps.research||[],deps.contextual||{}), webSearch:true, reasoning:'high' };
    case 'visual_archive': return { ...visualArchivePrompt(context,deps.verified||{},deps.agenda||{}), webSearch:true, reasoning:'medium' };
    case 'rights_review': return { ...rightsPrompt(context,deps.verified||{},deps.visuals||{}), webSearch:true, reasoning:'medium' };
    case 'discrepancy_exception': return { ...discrepancyPrompt(context,deps.components||{}), webSearch:false, reasoning:'high' };
    case 'editor_producer': return { ...editorPrompt(context,deps.verified||{},deps.contextual||{},deps.rights||{},deps.visuals||{},deps.discrepancy||{},deps.agenda||{}), webSearch:false, reasoning:'high' };
    case 'then_now': return { ...thenNowPrompt(context,deps.edition||{}), webSearch:true, reasoning:'medium' };
    case 'archive_recipe': return { ...archiveRecipePrompt(context), webSearch:true, reasoning:'medium' };
    case 'social_editor': return { ...socialPrompt('social_editor',context,deps.edition||{}), webSearch:false, reasoning:'low' };
    case 'short_form_video': return { ...socialPrompt('short_form_video',context,deps.edition||{}), webSearch:false, reasoning:'low' };
    case 'engagement_trends': return { ...trendsPrompt(context,deps.edition||{},deps.priorMetrics||[]), webSearch:false, reasoning:'low' };
    case 'illustrator': return {
      instructions:`Return valid JSON only. You are the Illustrator / Visual Placement Agent for On This Day TV. You DO NOT generate images and you DO NOT use a storage bucket. Choose only rights-cleared archival visual candidates already supplied. The locked masthead and 100-year center comparison must remain untouched. Prefer one y200 and one y75 side-era visual. For placement.url use only a real assetUrl, downloadUrl, or thumbnailUrl from an allowed candidate; never use an ordinary archive HTML page as an image. For placement.sourceUrl use that candidate's sourcePageUrl for attribution. Return {"agent":"illustrator","status":"complete","placements":{"y200":{"url":"","label":"","sourceUrl":""},"y75":{"url":"","label":"","sourceUrl":""}},"confidence":0,"discrepancies":[]}. Leave a placement empty when no safe asset exists.`,
      input:JSON.stringify({context,visuals:deps.visuals||{},rights:deps.rights||{}}), webSearch:false, reasoning:'low'
    };
    default: throw new Error(`No prompt configured for ${agentKey}`);
  }
}

async function failStale(job) {
  if (!job || job.status !== 'running') return job;
  const age=Date.now()-new Date(job.started_at||0).getTime();
  if (Number.isFinite(age) && age < STALE_MS) return job;
  const rows=await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'failed',error:'Stale job automatically released by consolidated newsroom.',finished_at:nowIso()}).catch(()=>[]);
  return rows[0] || {...job,status:'failed'};
}

async function runAgent(run, agentKey, context, deps={}) {
  let previous=await failStale(await latestJob(run.id,agentKey));
  if (previous?.status === 'complete') return {state:'complete',output:previous.output};
  if (previous?.status === 'running') return {state:'running',output:null};
  const attempt=Math.max(0,Number(previous?.attempt||0))+1;
  if (attempt > MAX_ATTEMPTS) return {state:'terminal_failed',output:null,error:previous?.error||'Maximum attempts exceeded'};

  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:agentKey,status:'running',attempt,started_at:nowIso()});
  try {
    const p=promptFor(agentKey,context,deps);
    const result=await runModel({instructions:p.instructions,input:p.input,model:modelFor(agentKey),webSearch:p.webSearch,reasoning:p.reasoning});
    const output=result.json;
    await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'complete',output,confidence:num(output?.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  } catch(error) {
    await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
    if (attempt >= MAX_ATTEMPTS && CRITICAL.has(agentKey)) throw new Error(`${agentKey} failed after ${attempt} attempts: ${error.message}`);
    return {state:attempt>=MAX_ATTEMPTS?'terminal_failed':'failed',output:null,error:error.message};
  }
}


async function runMajorSubdesk(run, eraKey, context, agenda={}) {
  const agentKey=`major_press_${eraKey}`;
  let previous=await failStale(await latestJob(run.id,agentKey));
  if(previous?.status==='complete') return {state:'complete',output:previous.output};
  if(previous?.status==='running') return {state:'running',output:null};
  const attempt=Math.max(0,Number(previous?.attempt||0))+1;
  if(attempt>MAJOR_SUB_MAX_ATTEMPTS) return {state:'terminal_failed',output:null,error:previous?.error||'Maximum split-era attempts exceeded'};

  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:agentKey,status:'running',attempt,started_at:nowIso()});
  try {
    const p=majorPressEraPrompt(context,agenda,eraKey);
    const result=await runModel({
      instructions:p.instructions,
      input:p.input,
      model:modelFor('major_press'),
      webSearch:true,
      reasoning:'low',
      maxOutputTokens:eraKey==='y100'?2400:1800,
      timeoutMs:60000,
    });
    const output=result.json||{};
    output.candidates=safeArray(output.candidates).filter(c=>c&&c.eraKey===eraKey).map(c=>({...c,sourceDesk:'major_press',eraYear:context.years[eraKey]}));
    if(!output.candidates.length) throw new Error(`Major Press ${eraKey} returned no usable candidates`);
    await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'complete',output,confidence:num(output?.confidence),error:null,finished_at:nowIso()});
    return {state:'complete',output};
  } catch(error) {
    await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
    return {state:attempt>=MAJOR_SUB_MAX_ATTEMPTS?'terminal_failed':'failed',output:null,error:error.message};
  }
}

async function majorSubdeskDone(runId,eraKey) {
  const job=await latestJob(runId,`major_press_${eraKey}`);
  return Boolean(job && job.status==='complete');
}

async function finalizeMajorPress(run) {
  const existing=await completeOutput(run.id,'major_press');
  if(existing) return existing;
  const outputs={};
  for(const eraKey of MAJOR_SUBDESKS) outputs[eraKey]=await completeOutput(run.id,`major_press_${eraKey}`);
  if(MAJOR_SUBDESKS.some(k=>!outputs[k])) return null;
  const candidates=MAJOR_SUBDESKS.flatMap(k=>safeArray(outputs[k].candidates));
  const confidence=MAJOR_SUBDESKS.reduce((sum,k)=>sum+num(outputs[k]?.confidence),0)/MAJOR_SUBDESKS.length;
  const merged={
    agent:'major_press',status:'complete',strategy:'split_era_v1',confidence,
    candidates,
    discrepancies:MAJOR_SUBDESKS.flatMap(k=>safeArray(outputs[k]?.discrepancies)),
    searchNotes:MAJOR_SUBDESKS.flatMap(k=>safeArray(outputs[k]?.searchNotes)),
    subdesks:Object.fromEntries(MAJOR_SUBDESKS.map(k=>[k,{status:'complete',candidateCount:safeArray(outputs[k]?.candidates).length}]))
  };
  const previous=await latestJob(run.id,'major_press');
  const attempt=Math.max(0,Number(previous?.attempt||0))+1;
  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:'major_press',status:'running',attempt,started_at:nowIso()});
  await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'complete',output:merged,confidence,finished_at:nowIso(),error:null});
  return merged;
}

async function runMajorPress(run,context,deps={}) {
  const existing=await completeOutput(run.id,'major_press');
  if(existing) return {state:'complete',output:existing};
  const agenda=deps.agenda||{};

  // The center 100-year lead is the dependency for the community comparison desks,
  // so finish it first. Side eras run together on the next scheduler tick.
  if(!(await majorSubdeskDone(run.id,'y100'))) {
    const result=await runMajorSubdesk(run,'y100',context,agenda);
    if(result.state==='terminal_failed') throw new Error(`major_press y100 failed after ${MAJOR_SUB_MAX_ATTEMPTS} split-era attempts: ${result.error}`);
    return result;
  }

  const sideEras=['y200','y75'];
  const pending=[];
  for(const eraKey of sideEras) if(!(await majorSubdeskDone(run.id,eraKey))) pending.push(eraKey);
  if(pending.length) {
    const results=await Promise.all(pending.map(k=>runMajorSubdesk(run,k,context,agenda)));
    const terminal=results.find(r=>r.state==='terminal_failed');
    if(terminal) throw new Error(`major_press side-era split failed after ${MAJOR_SUB_MAX_ATTEMPTS} attempts: ${terminal.error}`);
  }

  const merged=await finalizeMajorPress(run);
  return merged?{state:'complete',output:merged}:{state:'running',output:null};
}

async function agentDone(runId,key) {
  const job=await latestJob(runId,key);
  return Boolean(job && (TERMINAL.has(job.status) || (job.status==='failed' && Number(job.attempt||0)>=MAX_ATTEMPTS)));
}
async function allDone(runId,keys) { return (await Promise.all(keys.map(k=>agentDone(runId,k)))).every(Boolean); }

async function researchBundle(runId) {
  const keys=['major_press','black_press','regional_local','community_press'];
  const outputs=await allOutputs(runId,keys);
  return keys.flatMap(k=>safeArray(outputs[k]?.candidates));
}

async function depsFor(run,agentKey,context) {
  const agenda=(await completeOutput(run.id,'editor_opening'))?.agenda || {};
  const major=(await completeOutput(run.id,'major_press'))?.candidates || [];
  const research=await researchBundle(run.id);
  const contextual=await completeOutput(run.id,'historical_context') || {};
  const translation=await completeOutput(run.id,'translation') || {};
  const verified=await completeOutput(run.id,'source_verification') || {};
  const visuals=await completeOutput(run.id,'visual_archive') || {};
  const rights=await completeOutput(run.id,'rights_review') || {};
  const discrepancy=await completeOutput(run.id,'discrepancy_exception') || {};
  const edition=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]?.payload || {};
  return {agenda,anchorCandidates:major,research,contextual:{...contextual,translation},verified,visuals,rights,discrepancy,components:{verified,translation,rights,visuals},edition,priorMetrics:[]};
}

async function setStage(run,stage,patch={}) {
  const [next]=await update('otd_runs',`id=eq.${run.id}`,{stage,status:stage==='complete'?'complete':'running',updated_at:nowIso(),...patch});
  return next || {...run,stage,...patch};
}

async function runPair(run,keys,context) {
  const pending=[];
  for(const key of keys) if(!(await agentDone(run.id,key))) pending.push(key);
  const chosen=pending.slice(0,2);
  await Promise.all(chosen.map(async key=>runAgent(run,key,context,await depsFor(run,key,context))));
}

function approvalIdentity(item={}) { return `${item.category||'editorial'}|${item.event_key||''}|${item.source_url||''}|${item.reason||''}`.slice(0,700); }
async function ensureApproval(run,item) {
  const identity=approvalIdentity(item);
  const existing=await select('otd_approvals',`select=id&run_id=eq.${run.id}&identity=eq.${encoded(identity)}&limit=1`).catch(()=>[]);
  if(existing.length) return;
  await insert('otd_approvals',{run_id:run.id,edition_date:run.edition_date,identity,status:'pending',...item});
}

async function createApprovalQueue(run) {
  const verified=await completeOutput(run.id,'source_verification') || {};
  const discrepancy=await completeOutput(run.id,'discrepancy_exception') || {};
  const translation=await completeOutput(run.id,'translation') || {};
  const rights=await completeOutput(run.id,'rights_review') || {};
  const stories=safeArray(verified.verifiedStories);
  const findStory=(eventKey,sourceUrl)=>{ if(sourceUrl) return stories.find(s=>s.sourceUrl===sourceUrl)||null; if(eventKey) return stories.find(s=>s.eventKey===eventKey)||null; return null; };

  for(const raw of safeArray(discrepancy.blocking)) {
    const eventKey=raw?.eventKey||raw?.event_key||''; const sourceUrl=raw?.sourceUrl||raw?.source_url||'';
    await ensureApproval(run,{category:'editorial',scope:raw?.scope||'story',event_key:eventKey,source_url:sourceUrl,reason:raw?.description||'Unresolved editorial discrepancy',evidence:raw?.evidence||{},payload:findStory(eventKey,sourceUrl)});
  }
  for(const raw of safeArray(translation.needsHuman)) {
    const sourceUrl=raw?.sourceUrl||raw?.source_url||'';
    await ensureApproval(run,{category:'translation',scope:'story',event_key:raw?.eventKey||'',source_url:sourceUrl,reason:raw?.reason||'Historical translation requires human review',evidence:raw,payload:findStory(raw?.eventKey||'',sourceUrl)});
  }
  for(const raw of safeArray(rights.items)) {
    const status=String(raw?.rightsStatus||'').toLowerCase(); const mode=String(raw?.displayMode||'').toLowerCase();
    if(!['unknown','permission_required','fair_use_review'].includes(status)) continue;
    if(['text_only','link_only'].includes(mode)) continue;
    await ensureApproval(run,{category:'visual_rights',scope:'asset',event_key:raw?.eventKey||'',source_url:visualIdentity(raw),reason:`Visual reuse status requires approval: ${status}`,evidence:raw,payload:raw});
  }
}

async function pendingApprovals(runId) {
  return select('otd_approvals',`select=*&run_id=eq.${runId}&status=eq.pending&order=created_at.asc`).catch(()=>[]);
}
async function approvalStates(runId) {
  return select('otd_approvals',`select=*&run_id=eq.${runId}&order=created_at.asc`).catch(()=>[]);
}

export function filterSafeVerified(verified={},approvals=[]) {
  const stories=safeArray(verified.verifiedStories);
  const blockers=approvals.filter(a=>a.status!=='approved' && ['editorial','translation'].includes(a.category));
  const editionBlocked=blockers.some(a=>a.scope==='edition');
  if(editionBlocked) return {...verified,verifiedStories:[]};

  // A story-level hold follows the specific source whenever possible. It must
  // not remove every other newsroom's coverage merely because those stories
  // correctly share the same eventKey. Event-level exclusion is a fallback
  // only when the approval item has no source identifier.
  const urls=new Set(blockers.filter(a=>a.scope!=='edition').map(a=>a.source_url).filter(Boolean));
  const fallbackEvents=new Set(blockers.filter(a=>a.scope!=='edition' && !a.source_url).map(a=>a.event_key).filter(Boolean));
  return {...verified,verifiedStories:stories.filter(s=>!(s.sourceUrl&&urls.has(s.sourceUrl))&&!(s.eventKey&&fallbackEvents.has(s.eventKey)))};
}

function rightsAllowedVisuals(visuals={},rights={},approvals=[]) {
  const denied=new Set(approvals.filter(a=>a.category==='visual_rights' && a.status!=='approved').map(a=>String(a.source_url||'')).filter(Boolean));
  const approved=new Set(approvals.filter(a=>a.category==='visual_rights' && a.status==='approved').map(a=>String(a.source_url||'')).filter(Boolean));
  const rightsMap=new Map(safeArray(rights.items).map(r=>[visualIdentity(r),r]).filter(([k])=>Boolean(k)));
  const candidates=safeArray(visuals.candidates).filter(v=>{
    const identity=visualIdentity(v);
    if(identity && denied.has(identity)) return false;
    if(identity && approved.has(identity)) return true;
    const r=rightsMap.get(identity)||{};
    const status=String(r.rightsStatus||v.rightsStatus||'').toLowerCase();
    const mode=String(r.displayMode||v.displayMode||'').toLowerCase();
    return ['public_domain','licensed'].includes(status) || ['thumbnail','link_only'].includes(mode);
  });
  return {...visuals,candidates};
}

function cleanStory(s) {
  if(!s || !s.sourceUrl || !s.title) return null;
  return {...s,confidence:num(s.confidence)};
}
export function validateEdition(raw={},verified={}) {
  const edition=structuredClone(raw||{}); edition.stories=edition.stories||{}; edition.stories.y100=edition.stories.y100||{};
  edition.stories.y200=cleanStory(edition.stories.y200)||{};
  edition.stories.y75=cleanStory(edition.stories.y75)||{};
  edition.stories.y100.major=cleanStory(edition.stories.y100.major)||{};
  const lead=edition.stories.y100.major;
  let black=cleanStory(edition.stories.y100.black);
  if(black && lead?.eventKey && black.eventKey!==lead.eventKey) black=null;
  edition.stories.y100.black=black||{};
  edition.leadEventKey=lead?.eventKey||edition.leadEventKey||'';
  edition.leadHeadline=lead?.title||edition.leadHeadline||'';
  edition.stories.y100.secondary=safeArray(edition.stories.y100.secondary).map(cleanStory).filter(Boolean);
  edition.communityTiles=safeArray(edition.communityTiles).map(cleanStory).filter(Boolean).map(s=>{
    if(s.comparisonType==='same_event' && edition.leadEventKey && s.eventKey!==edition.leadEventKey) return {...s,comparisonType:'community_lead'};
    return s;
  });
  const verifiedKeys=new Set(safeArray(verified.verifiedStories).map(keyOfStory));
  const enforce=s=>!s?.sourceUrl || verifiedKeys.has(keyOfStory(s));
  edition.stories.y200=enforce(edition.stories.y200)?edition.stories.y200:{};
  edition.stories.y75=enforce(edition.stories.y75)?edition.stories.y75:{};
  edition.stories.y100.major=enforce(edition.stories.y100.major)?edition.stories.y100.major:{};
  edition.stories.y100.black=enforce(edition.stories.y100.black)?edition.stories.y100.black:{};
  edition.stories.y100.secondary=edition.stories.y100.secondary.filter(enforce);
  edition.communityTiles=edition.communityTiles.filter(enforce);
  return edition;
}

function flattenEditionStories(edition={}) {
  const s=edition.stories||{}; const y100=s.y100||{};
  const all=[s.y200,y100.major,y100.black,...safeArray(y100.secondary),s.y75,...safeArray(edition.communityTiles)].filter(x=>x&&x.title&&x.sourceUrl);
  const map=new Map(); for(const story of all) map.set(keyOfStory(story),story); return [...map.values()];
}
function storyRow(editionId,story,position) {
  const role=story.sourceDesk==='black_press'?'black_press':story.sourceDesk||'story';
  return {edition_id:editionId,era_key:story.eraKey||'',era_year:story.eraYear||null,event_key:story.eventKey||'',role,community:story.community||'',title:story.title||'',summary:story.summary||'',publication:story.publication||'',city:story.city||'',issue_date:story.issueDate||null,page:story.page||'',archive:story.archive||'',source_url:story.sourceUrl||'',language:story.language||'',article_type:story.articleType||'',confidence:num(story.confidence),verification_notes:story.verificationNotes||'',position};
}

async function persistVerifiedSources(run,verified={}) {
  const rows=safeArray(verified.verifiedStories).filter(s=>s.sourceUrl).map(s=>({run_id:run.id,edition_date:run.edition_date,source_url:s.sourceUrl,event_key:s.eventKey||'',era_key:s.eraKey||'',era_year:s.eraYear||null,source_desk:s.sourceDesk||'',publication:s.publication||'',city:s.city||'',issue_date:s.issueDate||null,page:s.page||'',archive:s.archive||'',community:s.community||'',language:s.language||'',article_type:s.articleType||'',title:s.title||'',evidence_notes:s.verificationNotes||s.evidenceNotes||'',confidence:num(s.confidence),verified:true}));
  for(const row of rows) await upsert('otd_sources',row,'run_id,source_url',{returning:false});
}

async function publish(run,context) {
  const deps=await depsFor(run,'editor_producer',context);
  const states=await approvalStates(run.id);
  const approvals=states.filter(a=>a.status==='pending');
  const editionRejected=states.some(a=>a.scope==='edition' && a.status==='rejected' && ['editorial','translation'].includes(a.category));
  if(editionRejected) return {rejected:true,approvals:states};
  const editionBlocker=approvals.some(a=>a.scope==='edition' && ['editorial','translation'].includes(a.category));
  if(editionBlocker) return {blocked:true,approvals};
  const safeVerified=filterSafeVerified(deps.verified,states);
  await persistVerifiedSources(run,deps.verified);
  const safeVisuals=rightsAllowedVisuals(deps.visuals,deps.rights,states);
  const result=await runAgent(run,'editor_producer',context,{...deps,verified:safeVerified,visuals:safeVisuals,discrepancy:{...deps.discrepancy,blocking:[]}});
  if(result.state!=='complete') return null;
  const edition=validateEdition(result.output?.edition||{},safeVerified);
  edition.editionDate=run.edition_date; edition.years=context.years; edition.publicationStatus='published'; edition.heldForReview=approvals.map(a=>({id:a.id,category:a.category,reason:a.reason,eventKey:a.event_key,sourceUrl:a.source_url}));
  const [row]=await upsert('otd_editions',{run_id:run.id,edition_date:run.edition_date,status:'published',lead_headline:edition.leadHeadline||'',years:context.years,payload:edition,published_at:nowIso(),updated_at:nowIso()},'edition_date');
  await remove('otd_stories',`edition_id=eq.${row.id}`).catch(()=>{});
  const storyRows=flattenEditionStories(edition).map((s,i)=>storyRow(row.id,s,i+1));
  if(storyRows.length) await insert('otd_stories',storyRows,{returning:false});
  await update('otd_approvals',`run_id=eq.${run.id}&edition_id=is.null`,{edition_id:row.id}).catch(()=>{});
  return row;
}

async function patchEdition(run,patcher) {
  const rows=await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]); const row=rows[0]; if(!row) return;
  const payload=structuredClone(row.payload||{}); patcher(payload);
  await update('otd_editions',`id=eq.${row.id}`,{payload,updated_at:nowIso()});
}

async function distributionAgent(run,context) {
  const existing=await latestJob(run.id,'social_distribution'); if(existing?.status==='complete') return;
  const attempt=Math.max(0,Number(existing?.attempt||0))+1; if(attempt>MAX_ATTEMPTS) return;
  const [job]=await insert('otd_agent_jobs',{run_id:run.id,agent_key:'social_distribution',status:'running',attempt,started_at:nowIso()});
  try {
    const social=await completeOutput(run.id,'social_editor')||{}; const video=await completeOutput(run.id,'short_form_video')||{};
    const edition=(await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`))[0]?.payload||{};
    const posts=[...safeArray(social.posts),...safeArray(video.videos).map(v=>({platform:v.platform,format:'short_video',title:v.title,body:v.script,caption:v.caption,sourceUrl:v.sourceUrl,linkUrl:v.linkUrl,mediaInstructions:v.shots}))];
    const results=await dispatchPosts(posts,edition);
    for(const item of posts) await insert('otd_social_queue',{run_id:run.id,edition_date:run.edition_date,platform:item.platform||'',payload:item,status:'queued'},{returning:false}).catch(()=>{});
    const output={agent:'social_distribution',status:'complete',results,queued:posts.length,confidence:1};
    await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'complete',output,confidence:1,finished_at:nowIso()});
  } catch(error) {
    await update('otd_agent_jobs',`id=eq.${job.id}`,{status:'failed',error:error.message,finished_at:nowIso()}).catch(()=>{});
  }
}

export async function ensureDailyRun(date=siteDate()) {
  const rows=await select('otd_runs',`select=*&edition_date=eq.${date}&run_kind=eq.daily&order=created_at.desc&limit=1`).catch(()=>[]);
  if(rows[0]) return rows[0];
  const context=computeEditionDate(date);
  const inserted=await insert('otd_runs',{edition_date:date,run_kind:'daily',status:'queued',stage:'opening',run_attempt:1,years:context.years,created_at:nowIso(),updated_at:nowIso()});
  return inserted[0];
}

async function automaticRetryIfDue(run) {
  if(run.status!=='retry_wait') return run;
  // RC5 replaces the old monolithic Major Press call with split-era research.
  // Do not make an already-failed 80s legacy call wait through the old backoff.
  const legacyMajorTimeout=/major_press.*timed out|major_press failed after .*timed out/i.test(String(run.error||''));
  const due=legacyMajorTimeout || !run.next_retry_at || new Date(run.next_retry_at).getTime()<=Date.now();
  if(!due) return null;
  await remove('otd_agent_jobs',`run_id=eq.${run.id}&status=eq.failed`).catch(()=>{});
  const nextAttempt=Math.max(1,Number(run.run_attempt||1))+1;
  const [updated]=await update('otd_runs',`id=eq.${run.id}`,{status:'running',run_attempt:nextAttempt,error:null,next_retry_at:null,updated_at:nowIso()});
  return updated||{...run,status:'running',run_attempt:nextAttempt,error:null,next_retry_at:null};
}

export async function advanceRun(run) {
  if(run.status==='waiting_approval') return {ok:true,claimed:false,waitingForApproval:true,runId:run.id};
  const retryReady=await automaticRetryIfDue(run);
  if(run.status==='retry_wait' && !retryReady) return {ok:true,claimed:false,waitingForAutomaticRetry:true,runId:run.id,nextRetryAt:run.next_retry_at};
  run=retryReady||run;
  const token=crypto.randomUUID();
  const claimed=await rpc('otd_claim_run',{p_run_id:run.id,p_token:token,p_seconds:285});
  if(!(claimed===true || claimed?.claimed===true || claimed?.[0]?.otd_claim_run===true)) return {ok:true,claimed:false,runId:run.id};
  try {
    let current=(await select('otd_runs',`select=*&id=eq.${run.id}&limit=1`))[0]||run;
    if(['complete','complete_with_review','failed_terminal'].includes(current.status)) return {ok:true,claimed:true,run:current};
    if(current.status==='queued') current=(await setStage(current,current.stage||'opening',{started_at:current.started_at||nowIso()}));
    const context=computeEditionDate(current.edition_date);

    switch(current.stage) {
      case 'opening': {
        await runAgent(current,'editor_opening',context,{});
        if(await agentDone(current.id,'editor_opening')) current=await setStage(current,'major_research'); break;
      }
      case 'major_research': {
        await runMajorPress(current,context,await depsFor(current,'major_press',context));
        if(await agentDone(current.id,'major_press')) current=await setStage(current,'supporting_research'); break;
      }
      case 'supporting_research': {
        const keys=['black_press','regional_local','community_press']; await runPair(current,keys,context);
        if(await allDone(current.id,keys)) current=await setStage(current,'context'); break;
      }
      case 'context': {
        const keys=['historical_context','translation']; await runPair(current,keys,context);
        if(await allDone(current.id,keys)) current=await setStage(current,'verification'); break;
      }
      case 'verification': {
        await runAgent(current,'source_verification',context,await depsFor(current,'source_verification',context));
        if(await agentDone(current.id,'source_verification')) current=await setStage(current,'visuals'); break;
      }
      case 'visuals': {
        await runAgent(current,'visual_archive',context,await depsFor(current,'visual_archive',context));
        if(await agentDone(current.id,'visual_archive')) current=await setStage(current,'rights'); break;
      }
      case 'rights': {
        await runAgent(current,'rights_review',context,await depsFor(current,'rights_review',context));
        if(await agentDone(current.id,'rights_review')) current=await setStage(current,'exceptions'); break;
      }
      case 'exceptions': {
        await runAgent(current,'discrepancy_exception',context,await depsFor(current,'discrepancy_exception',context));
        if(await agentDone(current.id,'discrepancy_exception')) { await createApprovalQueue(current); current=await setStage(current,'publish'); } break;
      }
      case 'publish': {
        const row=await publish(current,context);
        if(row?.blocked){
          const [waiting]=await update('otd_runs',`id=eq.${current.id}`,{status:'waiting_approval',stage:'publish',updated_at:nowIso()});
          current=waiting||{...current,status:'waiting_approval'};
        } else if(row?.rejected){
          const [rejected]=await update('otd_runs',`id=eq.${current.id}`,{status:'failed_terminal',stage:'complete',error:'Edition-wide approval item was rejected by administrator.',completed_at:nowIso(),updated_at:nowIso()});
          current=rejected||{...current,status:'failed_terminal',stage:'complete'};
        } else if(row) current=await setStage(current,'features');
        break;
      }
      case 'features': {
        const keys=['then_now','archive_recipe','illustrator']; await runPair(current,keys,context);
        if(await allDone(current.id,keys)) {
          const thenNow=await completeOutput(current.id,'then_now'); const recipe=(await completeOutput(current.id,'archive_recipe'))?.recipe||null; const placements=(await completeOutput(current.id,'illustrator'))?.placements||{};
          await patchEdition(current,p=>{p.thenNow=thenNow||null;p.archiveRecipe=recipe;p.illustrations=placements;});
          current=await setStage(current,'social_create');
        } break;
      }
      case 'social_create': {
        const keys=['social_editor','short_form_video']; await runPair(current,keys,context);
        if(await allDone(current.id,keys)) current=await setStage(current,'trends'); break;
      }
      case 'trends': {
        await runAgent(current,'engagement_trends',context,await depsFor(current,'engagement_trends',context));
        if(await agentDone(current.id,'engagement_trends')) current=await setStage(current,'distribution'); break;
      }
      case 'distribution': {
        await distributionAgent(current,context);
        if(await agentDone(current.id,'social_distribution')) {
          const approvals=await pendingApprovals(current.id);
          current=await setStage(current,'complete',{status:approvals.length?'complete_with_review':'complete',completed_at:nowIso()});
        } break;
      }
      case 'complete': break;
      default: current=await setStage(current,'opening');
    }
    return {ok:true,claimed:true,run:current};
  } catch(error) {
    const attempt=Math.max(1,Number(run.run_attempt||1));
    const isTimeout=/timed out/i.test(String(error.message||''));
    const waitMinutes=isTimeout?1:Math.min(360,15*Math.pow(2,Math.min(attempt-1,5)));
    const nextRetryAt=new Date(Date.now()+waitMinutes*60*1000).toISOString();
    await update('otd_runs',`id=eq.${run.id}`,{status:'retry_wait',error:error.message,next_retry_at:nextRetryAt,updated_at:nowIso()}).catch(()=>{});
    return {ok:false,claimed:true,runId:run.id,error:error.message,automaticRetryAt:nextRetryAt};
  } finally {
    await rpc('otd_release_run',{p_run_id:run.id,p_token:token}).catch(()=>{});
  }
}

export async function tick() {
  assertCoreEnvironment();
  const run=await ensureDailyRun();
  return advanceRun(run);
}

export async function queueRepublishAfterApproval(runId) {
  const rows=await select('otd_runs',`select=*&id=eq.${runId}&limit=1`); const run=rows[0]; if(!run) return null;
  // Re-run publication and every downstream automatic output so the approval is carried
  // all the way through the public edition and social package without a manual resume.
  for (const key of ['editor_producer','then_now','archive_recipe','illustrator','social_editor','short_form_video','engagement_trends','social_distribution']) {
    await remove('otd_agent_jobs',`run_id=eq.${runId}&agent_key=eq.${key}`).catch(()=>{});
  }
  const [updated]=await update('otd_runs',`id=eq.${runId}`,{stage:'publish',status:'running',completed_at:null,error:null,updated_at:nowIso()});
  return updated;
}

export function rosterSummary() { return AGENTS.map(({key,name,group,priority})=>({key,name,group,priority})); }
