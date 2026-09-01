import { json, requireCron, requireMethod } from '../http.js';
import { tick } from '../engine.js';
import { select, update, remove } from '../supabase.js';
import { editionQuality } from '../edition-quality.js';

const VERIFY_PREFIX='source_verification_';
const STUCK_MS=10*60*1000;

function ageMs(job){
  const stamp=job?.finished_at||job?.started_at||job?.created_at;
  const t=stamp?new Date(stamp).getTime():0;
  return t?Math.max(0,Date.now()-t):Infinity;
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
    const hiddenVerification=key.startsWith(VERIFY_PREFIX) && key!=='source_verification';
    const hiddenMajor=fullResearch && key.startsWith('major_press_');
    if(keys.has(key)||hiddenVerification||hiddenMajor){
      await remove('otd_agent_jobs',`id=eq.${job.id}`).catch(()=>{});
    }
  }
}

async function recoverEmptyPublishedEdition(){
  const runs=await select('otd_runs','select=*&run_kind=eq.daily&order=created_at.desc&limit=1').catch(()=>[]);
  const run=runs[0]||null;
  if(!run) return {recovered:false};

  const editions=await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]);
  const edition=editions[0]||null;
  if(!edition || edition.status!=='published') return {recovered:false};

  const quality=editionQuality(edition.payload||{});
  const marker=String(run.error||'').match(/EMPTY_EDITION_RECOVERY:(\d+)/);

  if(quality.publishable){
    if(marker) await update('otd_runs',`id=eq.${run.id}`,{error:null,updated_at:new Date().toISOString()}).catch(()=>{});
    return {recovered:false,quality};
  }

  const recoveryCount=Number(marker?.[1]||0)+1;
  const fullResearch=recoveryCount>=2;
  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);

  // A three-era edition is not publishable unless it contains a verified,
  // source-backed story for 200, 100, and 75 years ago. Never leave an empty
  // or incomplete edition marked published simply because every agent reached
  // a terminal state.
  await remove('otd_stories',`edition_id=eq.${edition.id}`).catch(()=>{});
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
  const runs=await select('otd_runs','select=*&run_kind=eq.daily&order=created_at.desc&limit=1').catch(()=>[]);
  const run=runs[0]||null;
  if(!run || run.stage!=='verification') return {recovered:false};

  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);
  const latest=latestByKey(jobs);
  const recovered=[];

  for(const [key,job] of latest){
    if(!key.startsWith(VERIFY_PREFIX) || key==='source_verification') continue;
    if(job.status!=='failed') continue;
    const exhausted=Number(job.attempt||0)>=4;
    const stale=ageMs(job)>=STUCK_MS;
    if(!exhausted && !stale) continue;

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
  if(coordinator?.status==='failed' && ageMs(coordinator)>=STUCK_MS){
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
    const publicationRecovery=await recoverEmptyPublishedEdition();
    const verificationRecovery=await recoverStuckVerification();
    const result=await tick();
    json(res,result.ok===false?500:200,{...result,publicationRecovery,verificationRecovery,automatic:true,trigger:'vercel_cron'});
  } catch (error) {
    json(res,500,{ok:false,automatic:true,trigger:'vercel_cron',error:error.message});
  }
}
