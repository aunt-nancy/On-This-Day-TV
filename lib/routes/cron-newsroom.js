import { json, requireCron, requireMethod } from '../http.js';
import { tick } from '../engine.js';
export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;
  try {
    const result=await tick();
    json(res,result.ok===false?500:200,{...result,automatic:true,trigger:'vercel_cron'});
  } catch (error) {
    json(res,500,{ok:false,automatic:true,trigger:'vercel_cron',error:error.message});
  }
}
