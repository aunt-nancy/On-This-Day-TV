import cronNewsroom from './cron-newsroom.js';
import { ensureDailyRun, siteDate } from '../engine.js';
import { requireCron, requireMethod } from '../http.js';

export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;

  // Critical day-rollover guard: create/fetch the current Pacific-date run
  // BEFORE the legacy checkpoint code asks for the latest completed run.
  // Without this, yesterday's checkpoint-locked edition can return early and
  // prevent today's automatic newsroom run from ever being created.
  await ensureDailyRun(siteDate());

  return cronNewsroom(req,res);
}
