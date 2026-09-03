import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AGENTS } from '../lib/agents.js';
import { STAGES, siteDate, validateEdition, filterSafeVerified } from '../lib/engine.js';
import { requestTimeoutMs } from '../lib/openai.js';
import healthHandler from '../api/health.js';
import { normalizePublishedEdition } from '../lib/routes/content-today.js';
import { communityDateStory, sanitizeExactDateEdition } from '../lib/exact-date.js';
import { applyEditorialSupplements } from '../lib/editorial-supplements.js';

assert.equal(AGENTS.length,19,'The consolidated roster must contain exactly 19 automatic newsroom roles.');
assert.equal(new Set(AGENTS.map(a=>a.key)).size,19,'Agent keys must be unique.');
assert.ok(STAGES.includes('publish')&&STAGES.at(-1)==='complete','Automatic stage model must end in complete.');
assert.equal(siteDate(new Date('2026-09-01T06:30:00Z'),'America/Los_Angeles'),'2026-08-31','Site date must use Pacific time.');

const verified={verifiedStories:[
  {eraKey:'y100',eventKey:'lead',title:'Major',sourceUrl:'https://example.com/major'},
  {eraKey:'y100',eventKey:'other',title:'Wrong Black',sourceUrl:'https://example.com/black'},
  {eraKey:'y100',eventKey:'other',title:'Community',sourceUrl:'https://example.com/community',comparisonType:'same_event'}
]};
const ed=validateEdition({stories:{y100:{major:verified.verifiedStories[0],black:verified.verifiedStories[1]}},communityTiles:[verified.verifiedStories[2]]},verified);
assert.equal(ed.stories.y100.black.title,undefined,'Black Press comparison cannot use a different eventKey.');
assert.equal(ed.communityTiles[0].comparisonType,'community_lead','Unmatched community coverage must not masquerade as same-event comparison.');
const sameEventVerified={verifiedStories:[
  {eventKey:'shared',sourceUrl:'https://example.com/major',title:'Major'},
  {eventKey:'shared',sourceUrl:'https://example.com/black',title:'Black'},
  {eventKey:'shared',sourceUrl:'https://example.com/local',title:'Local'}
]};
const heldOne=filterSafeVerified(sameEventVerified,[{status:'pending',category:'editorial',scope:'story',event_key:'shared',source_url:'https://example.com/black'}]);
assert.deepEqual(heldOne.verifiedStories.map(s=>s.title),['Major','Local'],'A story-level approval must exclude only the identified source, not every story sharing the event.');
const heldEventFallback=filterSafeVerified(sameEventVerified,[{status:'pending',category:'editorial',scope:'story',event_key:'shared',source_url:''}]);
assert.equal(heldEventFallback.verifiedStories.length,0,'Event fallback may exclude the event only when no source can identify the held item.');

const root=path.resolve(new URL('..',import.meta.url).pathname);
const sceneFiles=['hero-1926-newsstand.webp','scene-1826-printshop.webp','scene-1926-civic-square.webp','scene-1951-public-square.webp','scene-black-press-1926.webp'];
for(const f of ['index.html','today.html','archive.html','community.html','regional.html','sources.html','about.html','admin.html','schema.sql','vercel.json','BUILD_LOCK.md','SCENE_ASSETS.md',...sceneFiles]) assert.ok(fs.existsSync(path.join(root,f)),`Missing required build file: ${f}`);
for(const f of sceneFiles){
  const bytes=fs.readFileSync(path.join(root,f));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF',`${f} must be a real WebP image.`);
  assert.equal(bytes.subarray(8,12).toString(),'WEBP',`${f} must be a real WebP image.`);
}
function jsFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(directory,entry.name);
    return entry.isDirectory()?jsFiles(full):(entry.name.endsWith('.js')?[path.relative(root,full).replaceAll('\\','/')]:[]);
  });
}
assert.deepEqual(jsFiles(path.join(root,'api')).sort(),[
  'api/admin/review.js',
  'api/content/today.js',
  'api/health.js',
  'api/router.js',
],'Only canonical API entrypoints may deploy; retired manual-run and queue functions must not return.');
const lock=fs.readFileSync(path.join(root,'BUILD_LOCK.md'),'utf8');
assert.ok(lock.includes('Public site — LOCKED'),'Build lock must protect the public design.');
assert.ok(lock.includes('Normal newsroom operation is automatic'),'Build lock must preserve automatic operation.');
assert.ok(lock.includes('Do not reintroduce the legacy y76 data key')||lock.includes('Do not reintroduce the legacy `y76` data key'),'Build lock must forbid the old y76 data key.');
const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8').toLowerCase();
for(const forbidden of ['run all agents','resume current run','start new run']) assert.ok(!admin.includes(forbidden),`Admin must not expose normal manual runner control: ${forbidden}`);
for(const required of ['on this day agent newsroom','priority & execution model','agent roster — ranked by importance','needs review','publishing status','recent runs','open discrepancies','raw status']) assert.ok(admin.includes(required),`Admin regression: missing approved newsroom section: ${required}`);
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(index.indexOf('class="real-sources"') < index.indexOf('class="community-home"'),'Community Press Voices must immediately follow the source/perspective strip.');
assert.ok(index.includes('communityPriorityGrid'),'Locked public Community Press Voices grid must be preserved.');
assert.ok(index.includes('major-lead'),'Locked public 100-year major-headline centerpiece must be preserved.');
assert.ok(index.includes('id="featuredVoices"')&&index.includes('id="y200Context"'),'The 100-year community ring and 200-year context desk must remain in the locked three-era board.');
assert.ok(index.includes('75 Years Ago'),'Public third-era label must be 75 years ago.');
assert.ok(!/data-year-offset="76"/.test(index),'Public date binding must not calculate a 76-year era.');
assert.ok(!index.includes('dynamic-scene-fallback.js'),'Homepage must not inject unrelated generic historical photographs.');
assert.ok(!/Headline pending|edition being prepared/i.test(index),'Homepage HTML must not expose newsroom work-in-progress copy.');
assert.ok(index.includes('class="edition-loading"'),'Homepage must hide unhydrated article slots instead of flashing placeholders.');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
assert.ok(css.includes('.community-priority-grid')&&css.includes('.history-board'),'Locked public design CSS must be present.');
assert.ok(!/art-(archive|frontpage|map|press|voices)\.svg/.test(css),'Flat generic art must not remain in the public visual layer.');
const allDataCode=['app.js','lib/agents.js','lib/prompts.js','lib/engine.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
assert.ok(!/\by76\b/.test(allDataCode),'The clean newsroom data contract must use y75 consistently.');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert.ok(app.includes('/api/content/today'),'Locked public site must receive live automatic edition data.');
assert.ok(app.includes('America/Los_Angeles'),'Public date must use the newsroom site timezone.');
assert.ok(index.includes('homepage-enhancements.css?v=20260903b')&&app.includes("homepage-enhancements.css?v=20260903b"),'Homepage enhancement CSS must use one current cache-busting version.');
assert.ok(!/pending exact-date|pending verification|being prepared/i.test(app),'Public hydration must hide missing slots instead of writing placeholder copy.');
assert.ok(!app.includes('dataset.coreCount'),'Published hydration must never collapse the permanent three-era grid.');
const illustrationPass=fs.readFileSync(path.join(root,'illustration-pass.js'),'utf8');
assert.ok(!illustrationPass.includes('const any=pool'),'Visual selection must not fall back to an unrelated image.');
assert.ok(illustrationPass.includes("!['public_domain','licensed'].includes(rights)"),'Visual selection must require reusable rights.');
assert.ok(illustrationPass.includes('eventKey:events.y200')&&illustrationPass.includes('eventKey:events.y75'),'Article imagery must match the exact story event.');
const archiveRoute=fs.readFileSync(path.join(root,'lib/routes/content-archive.js'),'utf8');
assert.ok(archiveRoute.includes('edition_date=lt.${today}'),'Archive API must move editions into the archive only after their publication date closes.');
assert.ok(archiveRoute.includes('editions}'),'Archive API must expose a clean editions response key.');
const archiveHtml=fs.readFileSync(path.join(root,'archive.html'),'utf8');
assert.ok(archiveHtml.includes('id="archiveMount"')&&archiveHtml.includes('page.js'),'Archive page must mount live published editions.');
for(const f of ['today.html','community.html','regional.html']) assert.ok(fs.readFileSync(path.join(root,f),'utf8').includes('page.js'),`${f} must render published newsroom content.`);
const normalized=normalizePublishedEdition({status:'published',edition_date:'2026-09-01',payload:{stories:{
  y200:{title:'Early lead',sourceUrl:'https://example.com/early',issueDate:'1826-09-01'},
  y100:{major:{title:'Verified lead',sourceUrl:'https://example.com/source',issueDate:'1926-09-01'}},
  y75:{title:'Later lead',sourceUrl:'https://example.com/later',issueDate:'1951-09-01'},
}}});
assert.equal(normalized?.edition?.payload?.stories?.y100?.major?.title,'Verified lead','A prior exact-date publication must remain eligible as the rollover fallback.');
const partial=normalizePublishedEdition({status:'published',edition_date:'2026-09-01',payload:{stories:{y100:{major:{title:'Only one era',sourceUrl:'https://example.com/partial',issueDate:'1926-09-01'}}}}});
assert.equal(partial,null,'A partial edition must not collapse the public three-era format; the route should keep serving the latest complete publication.');
const supplemented=applyEditorialSupplements({stories:{y100:{major:{title:'Mexico lead',sourceUrl:'https://example.com/mexico',issueDate:'1926-09-02'}},y75:{title:'1951 lead',sourceUrl:'https://example.com/1951',issueDate:'1951-09-02'}}},'2026-09-02');
const exactSupplement=sanitizeExactDateEdition(supplemented,'2026-09-02');
assert.equal(exactSupplement.complete,true,'The verified September 2 supplement must restore the missing 1826 core era.');
assert.ok(exactSupplement.payload.communityTiles.some(s=>s.communityKey==='latino'&&s.comparisonType==='same_event'),'The Mexico lead must include the verified Mexican same-event newspaper view.');
assert.ok(exactSupplement.payload.communityTiles.some(s=>s.communityKey==='black'&&s.dateRelation==='nearest_weekly_issue'),'The Black Press fallback must identify the nearest weekly issue explicitly.');
assert.equal(communityDateStory({title:'Weekly lead',sourceUrl:'https://example.com/weekly',issueDate:'1926-09-04',comparisonType:'community_lead',dateRelation:'nearest_weekly_issue'},'2026-09-02'),true,'A labeled nearest weekly community lead within seven days is valid.');
assert.equal(communityDateStory({title:'False response',sourceUrl:'https://example.com/false-response',issueDate:'1926-09-04',comparisonType:'same_event',dateRelation:'nearest_weekly_issue'},'2026-09-02'),false,'An off-date weekly story must never pass as a same-event response.');
const contentTodayRoute=fs.readFileSync(path.join(root,'lib/routes/content-today.js'),'utf8');
assert.ok(contentTodayRoute.includes('publishEditionSlots(run')&&contentTodayRoute.includes("policy:'single_verified_recovery_v1'"),'A publicly served verified recovery must pass through the authoritative publisher so it can enter the archive after rollover.');
const engineJs=fs.readFileSync(path.join(root,'lib/engine.js'),'utf8');
assert.ok(engineJs.includes('function visualIdentity'),'Visual rights and placement must share one canonical archive/asset identity contract.');
assert.ok(engineJs.includes('source_url:visualIdentity(raw)'),'Visual approval items must use the same identity contract as rights filtering.');
assert.ok(!fs.readFileSync(path.join(root,'lib/prompts.js'),'utf8').includes('sideEraRecoveryPrompt'),'Dead legacy recovery prompt must not ship in the consolidated build.');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
assert.ok(Array.isArray(vercel.crons)&&vercel.crons.some(c=>c.path==='/api/cron/newsroom'),'The automatic newsroom must have a scheduler route.');
console.log('ARCHITECTURE_TESTS_PASS');

// RC4 scheduler regression: the automatic newsroom must bind to Vercel's exact
// CRON_SECRET contract instead of treating OTD_CRON_SECRET as sufficient.
const configJs=fs.readFileSync(path.join(root,'lib/config.js'),'utf8');
const httpJs=fs.readFileSync(path.join(root,'lib/http.js'),'utf8');
assert.ok(configJs.includes("CRON_SECRET: Boolean(process.env.CRON_SECRET)"),'Core readiness must require Vercel CRON_SECRET by exact name.');
assert.ok(configJs.includes('legacyAliasPresent'),'Legacy OTD_CRON_SECRET may be diagnosed but cannot silently mark the scheduler ready.');
assert.ok(httpJs.includes('const configured = process.env.CRON_SECRET'),'Cron authentication must use Vercel CRON_SECRET by exact name.');
assert.ok(!httpJs.includes("process.env.OTD_CRON_SECRET || process.env.CRON_SECRET"),'Do not prefer the legacy alias over Vercel CRON_SECRET.');
assert.equal(vercel.crons.find(c=>c.path==='/api/cron/newsroom')?.schedule,'* * * * *','Automatic newsroom should receive a production tick every minute.');
const adminRc4=fs.readFileSync(path.join(root,'admin.html'),'utf8');
assert.ok(adminRc4.includes('Scheduler:'),'Admin must expose scheduler readiness instead of only idle READY agent cards.');
assert.ok(adminRc4.includes('Automatic scheduler is blocked'),'Admin must explain why READY agents are not starting when cron is unavailable.');
console.log('SCHEDULER_REGRESSION_TESTS_PASS');


// RC5 major-press timeout regression: do not put all three historical eras into
// one long web-search request. The automatic newsroom splits the Major Press
// desk into bounded subdesks and merges them back into the canonical agent.
const promptsJs=fs.readFileSync(path.join(root,'lib/prompts.js'),'utf8');
const openaiJs=fs.readFileSync(path.join(root,'lib/openai.js'),'utf8');
assert.ok(promptsJs.includes('majorPressEraPrompt'),'Major Press must have a split-era research prompt.');
assert.ok(engineJs.includes("const MAJOR_SUBDESKS = ['y100','y200','y75']"),'Major Press must split into the three locked eras.');
assert.ok(engineJs.includes("major_press_${eraKey}"),'Split-era progress must persist independently so successful eras are not rerun after another era times out.');
assert.ok(engineJs.includes("if(!(await majorSubdeskDone(run.id,'y100')))"),'The 100-year national lead must complete before side-era research.');
assert.ok(engineJs.includes("const sideEras=['y200','y75']"),'The two side eras should run as a bounded pair after the center lead.');
assert.ok(engineJs.includes("strategy:'split_era_v1'"),'Completed split-era research must merge into the canonical major_press output.');
assert.ok(engineJs.includes('timeoutMs:60000'),'Split-era web research must use a bounded request timeout shorter than the old 80-second monolith.');
assert.ok(engineJs.includes('const waitMinutes=isTimeout?1:'),'Timeout recovery must retry automatically on the next-minute cadence, not wait through the old long backoff.');
assert.ok(openaiJs.includes('requestTimeoutMs(timeoutMs, webSearch)'),'The OpenAI wrapper must pass the per-stage timeout budget through for every request type.');
assert.equal(requestTimeoutMs(60000,true),60000,'An explicit Major Press timeout must not be enlarged by the archival-search default.');
assert.equal(requestTimeoutMs(55000,true),55000,'An explicit Source Verification timeout must not be enlarged by the archival-search default.');
console.log('MAJOR_PRESS_TIMEOUT_REGRESSION_TESTS_PASS');


// RC6 source-verification timeout regression: verification is bounded, persisted,
// resumable, and must not inflate the visible 19-agent roster count.
const engineRc6=fs.readFileSync(path.join(root,'lib/engine.js'),'utf8');
const promptsRc6=fs.readFileSync(path.join(root,'lib/prompts.js'),'utf8');
const adminRc6=fs.readFileSync(path.join(root,'admin.html'),'utf8');
assert.ok(promptsRc6.includes('verificationBatchPrompt'),'Source Verification must have a bounded batch prompt.');
assert.ok(engineRc6.includes('const VERIFY_BATCH_SIZE = 3'),'Verification batches must remain small enough for serverless web-search execution.');
assert.ok(engineRc6.includes('source_verification_${batch.eraKey}_${hash}'),'Verification batch progress must persist independently.');
assert.ok(engineRc6.includes('timeoutMs:55000'),'Verification web-search calls must have a bounded timeout below the old 80-second monolith.');
assert.ok(engineRc6.includes("const chosen=pending.slice(0,2)"),'At most two verification batches may run in one scheduler tick.');
assert.ok(engineRc6.includes("strategy:'bounded_candidate_batches_v1'"),'Verification batches must merge into one canonical Source Verification output.');
assert.ok(engineRc6.includes("await runSourceVerification(current,context"),'The verification stage must use the bounded coordinator, not the generic monolithic runner.');
assert.ok(adminRc6.includes('const rosterKeys=new Set(agents.map(a=>a.key))'),'Admin completion counts must exclude hidden split-work jobs.');
console.log('SOURCE_VERIFICATION_TIMEOUT_REGRESSION_TESTS_PASS');


// RC7 health-route regression: Vercel gives a physical /api file precedence
// over the router rewrite, so the physical entrypoint must execute successfully
// and report the canonical 19-agent roster.
let healthBody='';
const healthResponse={
  statusCode:0,
  headers:{},
  status(code){this.statusCode=code;return this;},
  setHeader(name,value){this.headers[name]=value;return this;},
  end(body){healthBody=String(body||'');return this;},
};
await healthHandler({},healthResponse);
assert.equal(healthResponse.statusCode,200,'The physical /api/health entrypoint must not crash.');
const healthPayload=JSON.parse(healthBody);
assert.equal(healthPayload.ok,true,'Health response must report ok.');
assert.equal(healthPayload.agents.length,19,'Health response must expose the canonical 19-agent roster.');
assert.equal(healthPayload.build,'2026-09-03.three-era-community-ring.1','Health response must expose the current build ID.');
console.log('HEALTH_ROUTE_REGRESSION_TESTS_PASS');
