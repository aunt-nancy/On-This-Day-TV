import { json } from '../http.js';
import { select } from '../supabase.js';
export default async function handler(req,res){
  try{
    const url=new URL(req.url,'https://www.onthisday.tv');
    const date=url.searchParams.get('date');
    if(date){
      const rows=await select('otd_editions',`select=*&edition_date=eq.${encodeURIComponent(date)}&status=eq.published&limit=1`).catch(()=>[]);
      return json(res,200,{ok:true,edition:rows[0]||null});
    }
    const rows=await select('otd_editions','select=id,edition_date,lead_headline,published_at,status&status=eq.published&order=edition_date.desc&limit=60').catch(()=>[]);
    json(res,200,{ok:true,editions:rows});
  }catch(error){ json(res,200,{ok:false,editions:[],error:error.message}); }
}
