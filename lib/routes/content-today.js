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
        const now=new Date().toISOString();
        await update('otd_editions',`id=eq.${edition.id}`,{status:'preparing',published_at:null,lead_headline:'',updated_at:now}).catch(()=>{});
        edition=null;
      }
    }

    // The discarded edition may already have been demoted on an earlier request.
    // In that case there is no published row left to tell us its run_id. Look up
    // today's daily run directly and clear only edition-wide PENDING reviews from
    // the discarded package. Story/source-specific holds remain untouched.
    if(!edition){
      const runs=await select('otd_runs',`select=*&edition_date=eq.${today}&run_kind=eq.daily&order=created_at.desc&limit=1`).catch(()=>[]);
      const run=runs[0]||null;
      if(run){
        await update(
          'otd_approvals',
          `run_id=eq.${run.id}&status=eq.pending&scope=eq.edition`,
          {
            status:'superseded',
            resolution_note:'Superseded automatically because the previous edition package failed the exact-date publication gate.',
            resolved_at:new Date().toISOString(),
          }
        ).catch(()=>{});
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
