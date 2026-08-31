import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AGENTS } from '../lib/agents.js';
import { STAGES, siteDate, validateEdition, filterSafeVerified } from '../lib/engine.js';

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
for(const f of ['index.html','today.html','archive.html','community.html','regional.html','sources.html','about.html','admin.html','schema.sql','vercel.json','masthead-readers.jpg','BUILD_LOCK.md','art-frontpage.svg','art-archive.svg','art-map.svg','art-voices.svg']) assert.ok(fs.existsSync(path.join(root,f)),`Missing required build file: ${f}`);
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
assert.ok(index.includes('75 Years Ago'),'Public third-era label must be 75 years ago.');
assert.ok(!/data-year-offset="76"/.test(index),'Public date binding must not calculate a 76-year era.');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
assert.ok(css.includes('.community-priority-grid')&&css.includes('.history-board'),'Locked public design CSS must be present.');
const allDataCode=['app.js','lib/agents.js','lib/prompts.js','lib/engine.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
assert.ok(!/\by76\b/.test(allDataCode),'The clean newsroom data contract must use y75 consistently.');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert.ok(app.includes('/api/content/today'),'Locked public site must receive live automatic edition data.');
assert.ok(app.includes('America/Los_Angeles'),'Public date must use the newsroom site timezone.');
const archiveRoute=fs.readFileSync(path.join(root,'lib/routes/content-archive.js'),'utf8');
assert.ok(archiveRoute.includes('{ok:true,editions:rows}'),'Archive API must expose a clean editions response key.');
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
assert.ok(openaiJs.includes('requestTimeoutMs(timeoutMs)'),'The OpenAI wrapper must accept a per-stage timeout budget.');
console.log('MAJOR_PRESS_TIMEOUT_REGRESSION_TESTS_PASS');
