import { AGENTS } from './agents.js';
import { select } from './supabase.js';
import { sanitizeExactDateEdition } from './exact-date.js';

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
  if(!run) return {locked:false,complete:0,expected:AGENTS.length,jobs:[],completeKeys:[]};
  const jobs=await select('otd_agent_jobs',`select=*&run_id=eq.${run.id}&order=started_at.asc`).catch(()=>[]);
  const latest=latestByKey(jobs);
  const completeKeys=AGENTS.filter(a=>latest.get(a.key)?.status==='complete').map(a=>a.key);
  return {
    locked:completeKeys.length===AGENTS.length,
    complete:completeKeys.length,
    expected:AGENTS.length,
    completeKeys,
    jobs,
    latest,
  };
}

// A completed-agent checkpoint is preservation only. It may short-circuit the
// cron only after a publishable edition actually exists. If the stored edition
// is still preparing/non-publishable, leave locked=false so the verified-story
// repair path can rebuild and publish it.
export async function publishFromAgentCheckpoint(run){
  const checkpoint=await agentCheckpoint(run);
  const edition=run
    ? (await select('otd_editions',`select=*&run_id=eq.${run.id}&limit=1`).catch(()=>[]))[0]||null
    : null;
  const sanitized=edition?sanitizeExactDateEdition(edition.payload||{},run.edition_date):null;
  const published=Boolean(edition?.status==='published'&&sanitized?.complete);
  const effectiveLock=Boolean(checkpoint.locked&&published);
  return {
    ...checkpoint,
    locked:effectiveLock,
    agentsComplete:checkpoint.locked,
    published,
    reason:effectiveLock
      ? 'checkpoint_preserved_read_only'
      : checkpoint.locked
        ? 'checkpoint_complete_but_edition_requires_repair'
        : 'checkpoint_not_complete',
    editionId:edition?.id||null,
    exactDate:sanitized?{
      publishable:sanitized.publishable,
      complete:sanitized.complete,
      validCoreCount:sanitized.validCoreCount,
      missingCore:sanitized.missingCore,
      invalid:sanitized.invalid,
    }:null,
  };
}
