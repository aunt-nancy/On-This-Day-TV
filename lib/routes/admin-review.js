import { json, requireAdmin, requireMethod, readBody } from '../http.js';
import { select, update } from '../supabase.js';
import { queueRepublishAfterApproval } from '../engine.js';
export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;
  try{
    if(req.method==='GET'){
      const approvals=await select('otd_approvals','select=*&status=eq.pending&order=created_at.asc').catch(()=>[]);
      return json(res,200,{ok:true,approvals});
    }
    if(!requireMethod(req,res,['PATCH'])) return;
    const body=await readBody(req);
    if(!body.id||!['approve','reject'].includes(body.action)) return json(res,400,{ok:false,error:'id and action (approve|reject) are required'});
    const rows=await select('otd_approvals',`select=*&id=eq.${encodeURIComponent(body.id)}&limit=1`); const item=rows[0];
    if(!item) return json(res,404,{ok:false,error:'Approval item not found'});
    await update('otd_approvals',`id=eq.${item.id}`,{status:body.action==='approve'?'approved':'rejected',resolution_note:body.note||'',resolved_at:new Date().toISOString()});
    if(body.action==='reject' && item.scope==='edition'){
      await update('otd_runs',`id=eq.${item.run_id}`,{status:'failed_terminal',stage:'complete',error:'Edition-wide approval item rejected by administrator.',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    } else {
      await queueRepublishAfterApproval(item.run_id);
    }
    return json(res,200,{ok:true,action:body.action,message:body.action==='approve'?'Approved. Automatic republish has been queued; no resume action is required.':item.scope==='edition'?'Rejected. This edition will remain unpublished; the prior published edition remains public.':'Rejected. The item stays excluded and the automatic downstream package is being refreshed.'});
  }catch(error){ json(res,500,{ok:false,error:error.message}); }
}
