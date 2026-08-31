import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';
export default async function handler(req,res){
  try{
    const today=siteDate();
    let rows=await select('otd_editions',`select=*&edition_date=eq.${today}&status=eq.published&limit=1`).catch(()=>[]);
    if(!rows.length) rows=await select('otd_editions','select=*&status=eq.published&order=edition_date.desc&limit=1').catch(()=>[]);
    const edition=rows[0]||null;
    json(res,200,{ok:true,requestedDate:today,edition,servingFallback:Boolean(edition&&edition.edition_date!==today)});
  }catch(error){ json(res,200,{ok:false,edition:null,error:error.message}); }
}
