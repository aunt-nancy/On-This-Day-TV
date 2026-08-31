import { json, requireAdmin } from '../http.js';
import { select } from '../supabase.js';
import { environmentStatus } from '../config.js';
import { rosterSummary } from '../engine.js';
export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;
  try{
    const runs=await select('otd_runs','select=*&order=created_at.desc&limit=10').catch(()=>[]);
    const latest=runs[0]||null;
    const jobs=latest?await select('otd_agent_jobs',`select=*&run_id=eq.${latest.id}&order=started_at.asc`).catch(()=>[]):[];
    const approvals=await select('otd_approvals','select=*&status=eq.pending&order=created_at.asc').catch(()=>[]);
    const edition=latest?(await select('otd_editions',`select=*&run_id=eq.${latest.id}&limit=1`).catch(()=>[]))[0]||null:null;
    json(res,200,{ok:true,environment:environmentStatus(),runs,latest,jobs,approvals,edition,agents:rosterSummary()});
  }catch(error){ json(res,500,{ok:false,error:error.message}); }
}
