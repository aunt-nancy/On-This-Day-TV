import { json, requireAdmin } from '../http.js';
import { select } from '../supabase.js';
import { environmentStatus } from '../config.js';
import { rosterSummary } from '../engine.js';

function newestByKey(jobs=[]){
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

function syntheticParent(jobs,parent,prefix){
  const newest=newestByKey(jobs);
  const canonical=newest.get(parent);
  if(canonical?.status==='complete' || canonical?.status==='running') return null;

  const children=[...newest.values()].filter(j=>String(j.agent_key||'').startsWith(prefix));
  if(!children.length) return null;

  const running=children.filter(j=>j.status==='running');
  const failed=children.filter(j=>j.status==='failed');
  const complete=children.filter(j=>j.status==='complete');
  const chosen=running[0]||failed.sort((a,b)=>Number(b.attempt||0)-Number(a.attempt||0))[0]||complete[complete.length-1];
  const status=running.length?'running':failed.length?'failed':'running';
  return {
    id:`synthetic:${parent}`,
    run_id:chosen?.run_id||null,
    agent_key:parent,
    status,
    attempt:Math.max(0,...children.map(j=>Number(j.attempt||0))),
    started_at:running.map(j=>j.started_at).filter(Boolean).sort()[0]||chosen?.started_at||chosen?.created_at||null,
    finished_at:null,
    error:status==='failed'?(chosen?.error||null):null,
    output:{
      synthetic:true,
      splitSubjobs:children.map(j=>({agent_key:j.agent_key,status:j.status,attempt:j.attempt,error:j.error||null})),
      completeSubjobs:complete.length,
      runningSubjobs:running.length,
      failedSubjobs:failed.length,
    },
  };
}

export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;
  try{
    const runs=await select('otd_runs','select=*&order=created_at.desc&limit=10').catch(()=>[]);
    const latest=runs[0]||null;
    const rawJobs=latest?await select('otd_agent_jobs',`select=*&run_id=eq.${latest.id}&order=started_at.asc`).catch(()=>[]):[];
    const jobs=[...rawJobs];
    const major=syntheticParent(rawJobs,'major_press','major_press_');
    const verify=syntheticParent(rawJobs,'source_verification','source_verification_');
    if(major) jobs.push(major);
    if(verify) jobs.push(verify);

    const approvals=latest
      ? await select('otd_approvals',`select=*&run_id=eq.${latest.id}&status=eq.pending&order=created_at.asc`).catch(()=>[])
      : [];
    const edition=latest?(await select('otd_editions',`select=*&run_id=eq.${latest.id}&limit=1`).catch(()=>[]))[0]||null:null;
    json(res,200,{ok:true,environment:environmentStatus(),runs,latest,jobs,rawJobs,approvals,edition,agents:rosterSummary()});
  }catch(error){ json(res,500,{ok:false,error:error.message}); }
}
