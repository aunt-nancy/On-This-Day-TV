import { json } from '../http.js';
import { select, update } from '../supabase.js';
import { siteDate } from '../engine.js';
import { exactDateEdition } from '../exact-date.js';

export default async function handler(req,res){
  try{
    const today=siteDate();
    const rows=await select('otd_editions',`select=*&edition_date=eq.${today}&status=eq.published&limit=1`).catch(()=>[]);
    let edition=rows[0]||null;
    let exactDate=null;
    if(edition){
      exactDate=exactDateEdition(edition.payload||{},today);
      if(!exactDate.publishable){
        // Never present an older issue as today's historical edition. Demote the
        // bad row so the checkpoint lead-repair worker can replace it.
        await update('otd_editions',`id=eq.${edition.id}`,{status:'preparing',published_at:null,lead_headline:'',updated_at:new Date().toISOString()}).catch(()=>{});
        edition=null;
      }
    }
    return json(res,200,{
      ok:true,
      requestedDate:today,
      edition,
      servingFallback:false,
      status:edition?'published':'preparing',
      exactDate,
      message:edition?null:`The ${today} edition is still being prepared with exact-date historical newspaper issues.`
    });
  }catch(error){
    return json(res,200,{ok:false,edition:null,error:error.message});
  }
}
