import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';
import { sanitizeExactDateEdition } from '../exact-date.js';

export default async function handler(req,res){
  try{
    const today=siteDate();
    const rows=await select('otd_editions',`select=*&edition_date=eq.${today}&status=eq.published&limit=1`).catch(()=>[]);
    const stored=rows[0]||null;
    const exactDate=stored?sanitizeExactDateEdition(stored.payload||{},today):null;
    const edition=stored&&exactDate?.publishable
      ? {...stored,payload:exactDate.payload}
      : null;

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
