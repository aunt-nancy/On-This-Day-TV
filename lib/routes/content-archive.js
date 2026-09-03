import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDate } from '../engine.js';
import { sanitizeExactDateEdition } from '../exact-date.js';

export default async function handler(req,res){
  try{
    const url=new URL(req.url,'https://www.onthisday.tv');
    const date=url.searchParams.get('date');
    if(date){
      const rows=await select('otd_editions',`select=*&edition_date=eq.${encodeURIComponent(date)}&status=eq.published&limit=1`).catch(()=>[]);
      const row=rows[0]||null;
      const exact=row?sanitizeExactDateEdition(row.payload||{},row.edition_date||date):null;
      const edition=row&&exact?.publishable?{...row,payload:exact.payload}:null;
      return json(res,200,{ok:true,edition});
    }
    const today=siteDate();
    const rows=await select('otd_editions',`select=id,edition_date,lead_headline,published_at,status&status=eq.published&edition_date=lt.${today}&order=edition_date.desc&limit=60`).catch(()=>[]);
    json(res,200,{ok:true,archivedBefore:today,editions:rows});
  }catch(error){ json(res,200,{ok:false,editions:[],error:error.message}); }
}
