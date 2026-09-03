import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';
import { sanitizeExactDateEdition } from '../exact-date.js';
import { applyEditorialSupplements } from '../editorial-supplements.js';

export default async function handler(req,res){
  try{
    const url=new URL(req.url,'https://www.onthisday.tv');
    const date=url.searchParams.get('date');
    if(date){
      const rows=await select('otd_editions',`select=*&edition_date=eq.${encodeURIComponent(date)}&status=eq.published&limit=1`).catch(()=>[]);
      const row=rows[0]||null;
      const exact=row?sanitizeExactDateEdition(applyEditorialSupplements(row.payload||{},row.edition_date||date),row.edition_date||date):null;
      const edition=row&&exact?.complete?{...row,payload:exact.payload}:null;
      return json(res,200,{ok:true,edition});
    }
    const today=siteDate();
    const rows=await select('otd_editions',`select=id,edition_date,lead_headline,published_at,status,payload&status=eq.published&edition_date=lt.${today}&order=edition_date.desc&limit=60`).catch(()=>[]);
    const editions=rows.filter(row=>sanitizeExactDateEdition(applyEditorialSupplements(row.payload||{},row.edition_date),row.edition_date).complete)
      .map(({payload,...row})=>row);
    json(res,200,{ok:true,archivedBefore:today,editions});
  }catch(error){ json(res,200,{ok:false,editions:[],error:error.message}); }
}
