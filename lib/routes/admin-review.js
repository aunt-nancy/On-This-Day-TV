import { json, requireAdmin, requireMethod, readBody } from '../http.js';
import { select, update } from '../supabase.js';
import { queueRepublishAfterApproval } from '../engine.js';

async function latestDailyRun(){
  const runs=await select('otd_runs','select=*&run_kind=eq.daily&order=created_at.desc&limit=1').catch(()=>[]);
  return runs[0]||null;
}

export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;
  try{
    const latest=await latestDailyRun();

    if(req.method==='GET'){
      const approvals=latest
        ? await select('otd_approvals',`select=*&run_id=eq.${latest.id}&status=eq.pending&order=created_at.asc`).catch(()=>[])
        : [];
      return json(res,200,{ok:true,runId:latest?.id||null,editionDate:latest?.edition_date||null,approvals});
    }

    if(!requireMethod(req,res,['PATCH'])) return;
    const body=await readBody(req);
    if(!body.id||!['approve','reject'].includes(body.action)){
      return json(res,400,{ok:false,error:'id and action (approve|reject) are required'});
    }

    const rows=await select('otd_approvals',`select=*&id=eq.${encodeURIComponent(body.id)}&limit=1`).catch(()=>[]);
    const item=rows[0]||null;

    // A card can remain on screen briefly after another refresh or after a
    // prior click. Treat that as a harmless stale UI event, not a failure.
    if(!item){
      return json(res,200,{
        ok:true,
        stale:true,
        message:'This review item is no longer active. Refresh the newsroom; no further action is required.'
      });
    }

    // Old editions must never be reopened by a stale approval card.
    if(!latest || item.run_id!==latest.id){
      return json(res,200,{
        ok:true,
        stale:true,
        message:'This approval belongs to an earlier newsroom run and no longer blocks the current edition.'
      });
    }

    // Double-clicks or repeat taps are idempotent.
    if(item.status!=='pending'){
      return json(res,200,{
        ok:true,
        alreadyResolved:true,
        status:item.status,
        message:`This review item is already ${item.status}. No additional action is required.`
      });
    }

    const nextStatus=body.action==='approve'?'approved':'rejected';
    await update('otd_approvals',`id=eq.${item.id}`,{
      status:nextStatus,
      resolution_note:body.note||'',
      resolved_at:new Date().toISOString()
    });

    if(body.action==='reject'&&item.scope==='edition'){
      await update('otd_runs',`id=eq.${item.run_id}`,{
        status:'failed_terminal',stage:'complete',
        error:'Edition-wide approval item rejected by administrator.',
        completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
      });
    }else{
      await queueRepublishAfterApproval(item.run_id);
    }

    return json(res,200,{
      ok:true,
      action:body.action,
      message:body.action==='approve'
        ?'Approved. Automatic republish has been queued; no resume action is required.'
        :item.scope==='edition'
          ?'Rejected. This edition will remain unpublished.'
          :'Rejected. The item stays excluded and the automatic downstream package is being refreshed.'
    });
  }catch(error){
    json(res,500,{ok:false,error:error.message});
  }
}
