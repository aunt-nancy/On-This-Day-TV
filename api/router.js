import { BUILD_ID } from '../lib/config.js';
import health from '../lib/routes/health.js';
import cronNewsroom from '../lib/routes/cron-newsroom.js';
import contentToday from '../lib/routes/content-today.js';
import contentArchive from '../lib/routes/content-archive.js';
import adminStatus from '../lib/routes/admin-status.js';
import adminReview from '../lib/routes/admin-review.js';
const ROUTES={
  'health':health,
  'cron/newsroom':cronNewsroom,
  'content/today':contentToday,
  'content/archive':contentArchive,
  'admin/status':adminStatus,
  'admin/review':adminReview,
};
export default async function handler(req,res){
  res.setHeader('X-OTD-Build',BUILD_ID); res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'https://www.onthisday.tv');
  const route=String(req.query?.route||url.searchParams.get('route')||'').replace(/^\/+|\/+$/g,'');
  const target=ROUTES[route];
  if(!target){res.statusCode=404;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({ok:false,error:`Unknown API route: ${route||'(missing)'}`}));}
  return target(req,res);
}
