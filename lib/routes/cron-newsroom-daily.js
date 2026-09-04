import cronNewsroom from './cron-newsroom.js';
import { tick } from '../engine.js';
import { requireCron, requireMethod } from '../http.js';

export default async function handler(req,res){
  if(!requireMethod(req,res,['GET','POST'])) return;
  if(!requireCron(req,res)) return;

  // Critical window-rollover guard: create/fetch the current Pacific-date slot
  // and advance it once BEFORE legacy checkpoint/recovery logic can return
  // early on the prior completed slot. The published edition remains visible
  // until this slot has a complete, exact-date replacement.
  await tick();

  return cronNewsroom(req,res);
}
