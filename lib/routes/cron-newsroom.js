import { json, requireCron, requireMethod } from '../http.js';
import { tick } from '../engine.js';
import { select, update, remove, upsert } from '../supabase.js';
import { editionQuality } from '../edition-quality.js';
import { publishFromAgentCheckpoint } from '../checkpoint-publisher.js';

const VERIFY_PREFIX='source_verification_';
const STUCK_MS=10*60*1000;
const LATE_STAGES=new Set(['publish','features','social_create','trends','distribution','complete']);

function ageMs(job){
  const stamp=job?.finished_at||job?.started_at||job?.created_at;
  const t=stamp?new Date(stamp).getTime():0;
  return t?Math.max(0,Date.now()-t):Infinity;
}
function safeArray(value){ return Array.isArray(value)?value:[]; }
function identity(story={}){ return String(story.sourceUrl||`${story.eraKey||''}|${story.publication||''}|${story.title||''}`); }
function score(story={}){
  const importance=Number(story.nationalImportance||0);
  const confidence=Number(story.confidence||0);
  return (Number.isFinite(importance)?importance:0)*100+(Number.isFinite(confidence)?confidence:0);
}
function best(rows,eraKey,predicate=()=>true){
  return [...rows].filter(s=>s?.eraKey===eraKey&&s?.title&&s?.sourceUrl&&predicate(s)).sort((a,b)=>score(b)-score(a))[0]||null;
}
function normalizeCommunity(value=''){
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function assembleFromVerified(run,verified,existingPayload={}){
  const rows=safeArray(verified?.verifiedStories);
  if(!rows.length) return null;

  const y200=best(rows,'y200',s=>s.sourceDesk==='major_press')||best(rows,'y200');
  const y75=best(rows,'y75',s=>s.sourceDesk==='major_press')||best(rows,'y75');
  const requestedLead=verified?.recommendedLeadByEra?.y100||verified?.recommendedLeadEventKey||'';
  const y100Major=
    best(rows,'y100',s=>s.sourceDesk==='major_press'&&(!requestedLead||s.eventKey===requestedLead))||
    best(rows,'y100',s=>s.sourceDesk==='major_press')||best(rows,'y100');
  const leadEventKey=y100Major?.eventKey||requestedLead||'';
  const y100Black=best(rows,'y100',s=>s.sourceDesk==='black_press'&&(!leadEventKey||s.eventKey===leadEventKey));
  const used=new Set([y200,y75,y100Major,y100Black].filter(Boolean).map(identity));
  const secondary=rows
    .filter(s=>s?.eraKey==='y100'&&s?.title&&s?.sourceUrl&&!used.has(identity(s)))
    .sort((a,b)=>score(b)-score(a)).slice(0,6);

  const byCommunity=new Map();
  for(const story of rows.filter(s=>s?.eraKey==='y100'&&s?.title&&s?.sourceUrl)){
    const key=normalizeCommunity(story.community||'');
    if(!key) continue;
    const prior=byCommunity.get(key);
    const same=leadEventKey&&story.eventKey===leadEventKey;
    const priorSame=prior&&leadEventKey&&prior.eventKey===leadEventKey;
    if(!prior || (same&&!priorSame) || (same===priorSame&&score(story)>score(prior))) byCommunity.set(key,story);
  }
  const communityTiles=[...byCommunity.values()].slice(0,12).map(s=>({
    ...s,comparisonType:leadEventKey&&s.eventKey===leadEventKey?'same_event':'community_lead'
  }));

  const payload={
    ...existingPayload,
    editionDate:run.edition_date,
    years:run.years||existingPayload.years||{},
    leadHeadline:y100Major?.title||'',
    leadEventKey,
    stories:{
      y200:y200||{},
      y100:{major:y100Major||{},black:y100Black||{},secondary},
      y75:y75||{},
    },
    communityTiles,
    publicationStatus:'published',
    deterministicFallback:true,
  };
  return payload;
}

async function latestDailyRun(){
  const runs=await select('otd_runs','select=*&run_kind=eq.daily&order=created_at.desc&limit=1').catch(()=>[]);
  return runs[0]||null;
}

async function repairEditionFromVerified(){
  const run=await latestDailyRun();
  if(!run) return {repaired:false,reason:'no_run'};
  if(!LATE_STAGES.has(String(run.stage||''))&&!['complete','complete_with_review'].includes(run.status)){
    return {repaired:false,reason:'not_at_publish_stage',runId:run.id,stage:run.stage};
  }

  const editions=await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]);
  const edition=editions[0]||null;
  if(edition&&edition.status==='published'&&editionQuality(edition.payload||{}).publishable){
    return {repaired:false,reason:'already_publishable',runId:run.id};
  }

  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&agent_key=eq.source_verification&status=eq.complete&order=finished_at.desc&limit=1`).catch(()=>[]);
  const verified=jobs[0]?.output||null;
  if(!verified) return {repaired:false,reason:'no_verified_output',runId:run.id};

  const payload=assembleFromVerified(run,verified,edition?.payload||{});
  if(!payload) return {repaired:false,reason:'verified_output_empty',runId:run.id};
  const quality=editionQuality(payload);
  if(!quality.publishable) return {repaired:false,reason:'verified_output_incomplete',runId:run.id,quality};

  const now=new Date().toISOString();
  const [row]=await upsert('otd_editions',{
    run_id:run.id,
    edition_date:run.edition_date,
    status:'published',
    lead_headline:payload.leadHeadline||'',
    years:run.years||payload.years||{},
    payload,
    published_at:edition?.published_at||now,
    updated_at:now,
  },'edition_date').catch(()=>[]);

  if(!row) return {repaired:false,reason:'edition_write_failed',runId:run.id,quality};
  await update('otd_runs',`id=eq.${run.id}`,{error:null,updated_at:now}).catch(()=>{});
  return {repaired:true,runId:run.id,editionId:row.id,quality};
}

function latestByKey(jobs=[]){
  const map=new Map();
  for(const job of jobs){
    const prior=map.get(job.agent_key);
    const pa=Number(prior?.attempt||0), ja=Number(job?.attempt||0);
    const pt=new Date(prior?.started_at||prior?.created_at||0).getTime();
    const jt=new Date(job?.started_at||job?.created_at||0).getTime();
    if(!prior || ja>pa || (ja===pa && jt>=pt)) map.set(job.agent_key,job);
  }
  return map;
}

async function removeRecoveryJobs(run,jobs,fullResearch){
  const keys=new Set([
    'source_verification','visual_archive','rights_review','discrepancy_exception','editor_producer',
    'then_now','archive_recipe','illustrator','social_editor','short_form_video','engagement_trends','social_distribution'
  ]);
  if(fullResearch){
    for(const key of ['major_press','black_press','regional_local','community_press','historical_context','translation']) keys.add(key);
  }
  for(const job of jobs){
    const key=String(job.agent_key||'');
    const hiddenVerification=key.startsWith(VERIFY_PREFIX)&&key!=='source_verification';
    const hiddenMajor=fullResearch&&key.startsWith('major_press_');
    if(keys.has(key)||hiddenVerification||hiddenMajor){
      await remove('otd_agent_jobs',`id=eq.${job.id}`).catch(()=>{});
    }
  }
}

async function recoverEmptyPublishedEdition(){
  const run=await latestDailyRun();
  if(!run) return {recovered:false};

  const editions=await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]);
  const edition=editions[0]||null;
  if(!edition||edition.status!=='published') return {recovered:false};

  const quality=editionQuality(edition.payload||{});
  const marker=String(run.error||'').match(/EMPTY_EDITION_RECOVERY:(\d+)/);
  if(quality.publishable){
    if(marker) await update('otd_runs',`id=eq.${run.id}`,{error:null,updated_at:new Date().toISOString()}).catch(()=>{});
    return {recovered:false,quality};
  }

  const recoveryCount=Number(marker?.[1]||0)+1;
  const fullResearch=recoveryCount>=2;
  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);
  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});
  await remove('otd_approvals',`run_id=eq.${run.id}`).catch(()=>{});
  await update('otd_editions',`id=eq.${edition.id}`,{
    status:'preparing',published_at:null,lead_headline:'',updated_at:new Date().toISOString(),
  }).catch(()=>{});
  await removeRecoveryJobs(run,jobs,fullResearch);

  const stage=fullResearch?'major_research':'verification';
  const reason=`EMPTY_EDITION_RECOVERY:${recoveryCount}: publication gate rejected edition; missing ${quality.missingCore.join(', ')||'verified stories'}.`;
  await update('otd_runs',`id=eq.${run.id}`,{
    status:'running',stage,completed_at:null,error:reason,next_retry_at:null,updated_at:new Date().toISOString(),
  }).catch(()=>{});
  return {recovered:true,runId:run.id,recoveryCount,fullResearch,stage,quality};
}

async function recoverStuckVerification(){
  const run=await latestDailyRun();
  if(!run||run.stage!=='verification') return {recovered:false};

  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);
  const latest=latestByKey(jobs);
  const recovered=[];

  for(const [key,job] of latest){
    if(!key.startsWith(VERIFY_PREFIX)||key==='source_verification'||job.status!=='failed') continue;
    const exhausted=Number(job.attempt||0)>=4;
    const stale=ageMs(job)>=STUCK_MS;
    if(!exhausted&&!stale) continue;
    const output={
      agent:'source_verification_batch',status:'complete',degraded:true,confidence:0,
      verifiedStories:[],rejectedCandidates:[],
      discrepancies:[{
        severity:'nonblocking',type:'verification_unavailable',
        description:`Verification batch ${key} could not be completed automatically and was isolated from publication. ${job.error||''}`.trim(),
      }],
    };
    await update('otd_agent_jobs',`id=eq.${job.id}`,{
      status:'complete',output,confidence:0,error:`NONBLOCKING: ${job.error||'verification unavailable'}`,finished_at:new Date().toISOString(),
    }).catch(()=>{});
    recovered.push(key);
  }

  const coordinator=latest.get('source_verification');
  if(coordinator?.status==='failed'&&ageMs(coordinator)>=STUCK_MS){
    await remove('otd_agent_jobs',`id=eq.${coordinator.id}`).catch(()=>{});
    recovered.push('source_verification_legacy_failure');
  }
  if(recovered.length){
    await update('otd_runs',`id=eq.${run.id}`,{status:'running',next_retry_at:null,updated_at:new Date().toISOString()}).catch(()=>{});
  }
  return {recovered:Boolean(recovered.length),items:recovered,runId:run.id};
}

export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;
  try {
    const run=await latestDailyRun();
    const checkpoint=run?await publishFromAgentCheckpoint(run):{locked:false,published:false,reason:'no_run'};

    // Once every canonical agent has completed, those outputs are the durable
    // checkpoint. Never send a fully-completed newsroom back through research
    // merely because the edition-table handoff failed.
    if(checkpoint.locked){
      return json(res,200,{ok:true,automatic:true,trigger:'vercel_cron',checkpoint,checkpointLocked:true});
    }

    const preRepair=await repairEditionFromVerified();
    const publicationRecovery=preRepair.repaired?{recovered:false,reason:'repaired_from_verified'}:await recoverEmptyPublishedEdition();
    const verificationRecovery=await recoverStuckVerification();
    const result=await tick();

    const afterRun=await latestDailyRun();
    const postCheckpoint=afterRun?await publishFromAgentCheckpoint(afterRun):{locked:false,published:false,reason:'no_run'};
    if(postCheckpoint.locked){
      return json(res,result.ok===false?500:200,{...result,automatic:true,trigger:'vercel_cron',checkpoint:postCheckpoint,checkpointLocked:true,publicationRecovery,verificationRecovery});
    }

    const postRepair=await repairEditionFromVerified();
    const postPublicationRecovery=postRepair.repaired
      ? {recovered:false,reason:'repaired_from_verified'}
      : await recoverEmptyPublishedEdition();
    json(res,result.ok===false?500:200,{...result,preRepair,publicationRecovery,verificationRecovery,postRepair,postPublicationRecovery,automatic:true,trigger:'vercel_cron'});
  } catch (error) {
    json(res,500,{ok:false,automatic:true,trigger:'vercel_cron',error:error.message});
  }
}
