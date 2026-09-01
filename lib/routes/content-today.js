import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';

export default async function handler(req,res){
  try{
    const today=siteDate();
    const rows=await select('otd_editions',`select=*&edition_date=eq.${today}&status=eq.published&limit=1`).catch(()=>[]);
    const edition=rows[0]||null;
    return json(res,200,{
      ok:true,
      requestedDate:today,
      edition,
      servingFallback:false,
      status:edition?'published':'preparing',
      message:edition?null:`The ${today} edition is still being prepared.`
    });
  }catch(error){
    return json(res,200,{ok:false,edition:null,error:error.message});
  }
}
