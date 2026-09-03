import cronNewsroom from './cron-newsroom.js';
import { ensureDailyRun, siteDate, tick } from '../engine.js';
import { requireCron, requireMethod } from '../http.js';

export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;

  // Critical day-rollover guard: create/fetch the current Pacific-date run
  // and advance it once BEFORE legacy checkpoint/recovery logic can return
  // early on a completed prior-day edition.
  await ensureDailyRun(siteDate());
  await tick();

  return cronNewsroom(req,res);
}
