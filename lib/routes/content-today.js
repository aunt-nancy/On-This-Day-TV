import { json } from '../http.js';
import { select, update } from '../supabase.js';
import { siteDate } from '../engine.js';
import { sanitizeExactDateEdition } from '../exact-date.js';

export default async function handler(req,res){
  try{
    const today=siteDate();
    const rows=await select('otd_editions',`select=*&edition_date=eq.${today}&status=in.(published,preparing)&limit=1`).catch(()=>[]);
    let edition=rows[0]||null;
    let exactDate=null;

    if(edition){
      exactDate=sanitizeExactDateEdition(edition.payload||{},today);

      if(exactDate.publishable){
        const sanitizedPayload=exactDate.payload;
        const nextStatus='published';
        const shouldPersist=edition.status!=='published' || exactDate.invalid.length>0 || JSON.stringify(edition.payload||{})!==JSON.stringify(sanitizedPayload);
        if(shouldPersist){
          const now=new Date().toISOString();
          const updated=await update('otd_editions',`id=eq.${edition.id}`,{
            status:nextStatus,
            lead_headline:sanitizedPayload.leadHeadline||'',
            payload:sanitizedPayload,
            published_at:edition.published_at||now,
            updated_at:now,
          }).catch(()=>[]);
          edition=updated[0]||{...edition,status:nextStatus,lead_headline:sanitizedPayload.leadHeadline||'',payload:sanitizedPayload,published_at:edition.published_at||now};
        }else{
          edition={...edition,payload:sanitizedPayload};
        }
      }else{
        if(edition.status==='published'){
          const now=new Date().toISOString();
          await update('otd_editions',`id=eq.${edition.id}`,{status:'preparing',published_at:null,lead_headline:'',updated_at:now}).catch(()=>{});
        }
        edition=null;
      }
    }

    return json(res,200,{
      ok:true,
      requestedDate:today,
      edition,
      servingFallback:false,
      status:edition?'published':'preparing',
      exactDate:exactDate?{
        complete:exactDate.complete,
        validCoreCount:exactDate.validCoreCount,
        core:exactDate.core,
        missingCore:exactDate.missingCore,
        invalid:exactDate.invalid,
      }:null,
      partial:Boolean(edition&&exactDate&&!exactDate.complete),
      message:edition
        ? (exactDate?.complete?null:`Publishing verified exact-date stories now; still preparing: ${(exactDate?.missingCore||[]).join(', ')}.`)
        :`The ${today} edition is still being prepared with exact-date historical newspaper issues.`
    });
  }catch(error){
    return json(res,200,{ok:false,edition:null,error:error.message});
  }
}
