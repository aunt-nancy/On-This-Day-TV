import { json, requireCron, requireMethod } from '../http.js';
import { tick } from '../engine.js';
export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;
  const result=await tick();
  json(res,result.ok===false?500:200,result);
}
