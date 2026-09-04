import { json } from '../http.js';
import { environmentStatus, BUILD_ID } from '../config.js';
import { currentUpdateWindow, rosterSummary, siteDate, STAGES, UPDATE_WINDOWS } from '../engine.js';
import { select } from '../supabase.js';
import { sanitizeExactDateEdition } from '../exact-date.js';

function newestByKey(jobs=[]){
  const newest=new Map();
  for(const job of jobs){
    const prior=newest.get(job.agent_key);
    const priorAttempt=Number(prior?.attempt||0);
    const attempt=Number(job?.attempt||0);
    const priorTime=new Date(prior?.finished_at||prior?.started_at||0).getTime();
    const time=new Date(job?.finished_at||job?.started_at||0).getTime();
    if(!prior||attempt>priorAttempt||(attempt===priorAttempt&&time>=priorTime)) newest.set(job.agent_key,job);
  }
  return [...newest.values()];
}

export default async function handler(req,res){
  const editionDate=siteDate();
  const activeWindow=currentUpdateWindow();
  const [runs,editions,published]=await Promise.all([
    select('otd_runs',`select=id,edition_date,run_kind,status,stage,run_attempt,next_retry_at,error,created_at,updated_at&edition_date=eq.${editionDate}&run_kind=eq.${activeWindow.runKind}&limit=1`).catch(()=>[]),
    select('otd_editions',`select=edition_date,status,payload,published_at,updated_at&edition_date=eq.${editionDate}&limit=1`).catch(()=>[]),
    select('otd_editions','select=edition_date,published_at&status=eq.published&order=edition_date.desc&limit=1').catch(()=>[]),
  ]);
  const run=runs[0]||null;
  const edition=editions[0]||null;
  const jobs=run
    ? await select('otd_agent_jobs',`select=agent_key,status,attempt,started_at,finished_at&run_id=eq.${run.id}`).catch(()=>[])
    : [];
  const latestJobs=newestByKey(jobs);
  const jobCounts=latestJobs.reduce((counts,job)=>{
    const key=String(job.status||'unknown');
    counts[key]=(counts[key]||0)+1;
    return counts;
  },{});
  const exact=edition?sanitizeExactDateEdition(edition.payload||{},editionDate):null;
  json(res,200,{
    ok:true,
    build:BUILD_ID,
    environment:environmentStatus(),
    agents:rosterSummary(),
    stages:STAGES,
    operatingRule:'automatic_newsroom_manual_approvals_only',
    publication:{
      siteDate:editionDate,
      latestPublishedDate:published[0]?.edition_date||null,
      schedule:{
        timeZone:'America/Los_Angeles',
        updatesPerDay:UPDATE_WINDOWS.length,
        windows:UPDATE_WINDOWS.map(window=>window.label),
        activeWindow:activeWindow.label,
        activeRunKind:activeWindow.runKind,
      },
      run:run?{
        kind:run.run_kind,
        status:run.status,
        stage:run.stage,
        attempt:Number(run.run_attempt||0),
        blocked:Boolean(run.error),
        nextRetryAt:run.next_retry_at||null,
        createdAt:run.created_at||null,
        updatedAt:run.updated_at||null,
      }:null,
      jobs:{total:latestJobs.length,counts:jobCounts,failed:latestJobs.filter(job=>job.status==='failed').map(job=>job.agent_key)},
      edition:edition?{
        status:edition.status,
        complete:Boolean(exact?.complete),
        validCoreCount:Number(exact?.validCoreCount||0),
        missingCore:exact?.missingCore||[],
        publishedAt:edition.published_at||null,
        updatedAt:edition.updated_at||null,
      }:null,
    },
  });
}
