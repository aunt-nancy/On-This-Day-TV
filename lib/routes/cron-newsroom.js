import { json, requireCron, requireMethod } from '../http.js';
import { tick } from '../engine.js';
import { select, update, remove } from '../supabase.js';

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

async function recoverStuckVerification(){
  const runs=await select('otd_runs','select=*&run_kind=eq.daily&order=created_at.desc&limit=1').catch(()=>[]);
  const run=runs[0]||null;
  if(!run || run.stage!=='verification') return {recovered:false};

  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);
  const latest=latestByKey(jobs);
  const recovered=[];

  // Hidden verification batches are implementation details. If one has exhausted
  // retries or has been failed for more than 10 minutes, isolate that candidate
  // instead of freezing the entire edition. It becomes a non-publishable,
  // nonblocking discrepancy and the other verified stories may continue.
  for(const [key,job] of latest){
    if(!key.startsWith(VERIFY_PREFIX) || key==='source_verification') continue;
    if(job.status!=='failed') continue;
    const exhausted=Number(job.attempt||0)>=4;
    const stale=ageMs(job)>=STUCK_MS;
    if(!exhausted && !stale) continue;

    const output={
      agent:'source_verification_batch',
      status:'complete',
      degraded:true,
      confidence:0,
      verifiedStories:[],
      rejectedCandidates:[],
      discrepancies:[{
        severity:'nonblocking',
        type:'verification_unavailable',
        description:`Verification batch ${key} could not be completed automatically and was isolated from publication. ${job.error||''}`.trim(),
      }],
    };
    await update('otd_agent_jobs',`id=eq.${job.id}`,{
      status:'complete',output,confidence:0,
      error:`NONBLOCKING: ${job.error||'verification unavailable'}`,
      finished_at:new Date().toISOString(),
    }).catch(()=>{});
    recovered.push(key);
  }

  // Recover an old monolithic/legacy Agent 4 failure so RC6 can create its
  // coordinator and bounded verification batches on the next tick.
  const coordinator=latest.get('source_verification');
  if(coordinator?.status==='failed' && ageMs(coordinator)>=STUCK_MS){
    await remove('otd_agent_jobs',`id=eq.${coordinator.id}`).catch(()=>{});
    recovered.push('source_verification_legacy_failure');
  }

  if(recovered.length){
    await update('otd_runs',`id=eq.${run.id}`,{
      status:'running',error:null,next_retry_at:null,updated_at:new Date().toISOString(),
    }).catch(()=>{});
  }
  return {recovered:Boolean(recovered.length),items:recovered,runId:run.id};
}

export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;
  try {
    const recovery=await recoverStuckVerification();
    const result=await tick();
    json(res,result.ok===false?500:200,{...result,recovery,automatic:true,trigger:'vercel_cron'});
  } catch (error) {
    json(res,500,{ok:false,automatic:true,trigger:'vercel_cron',error:error.message});
  }
}
