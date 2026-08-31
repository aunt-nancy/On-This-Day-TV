import { json } from '../http.js';
import { environmentStatus, BUILD_ID } from '../config.js';
import { rosterSummary, STAGES } from '../engine.js';
export default async function handler(req,res){
  json(res,200,{ok:true,build:BUILD_ID,environment:environmentStatus(),agents:rosterSummary(),stages:STAGES,operatingRule:'automatic_newsroom_manual_approvals_only'});
}
