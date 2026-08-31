import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
for(const f of ['index.html','today.html','archive.html','community.html','regional.html','sources.html','about.html','admin.html','schema.sql','vercel.json','masthead-readers.jpg','BUILD_LOCK.md']){
  assert.ok(fs.existsSync(path.join(root,f)),`Missing required build file: ${f}`);
}
const lock=fs.readFileSync(path.join(root,'BUILD_LOCK.md'),'utf8');
assert.ok(lock.includes('Normal newsroom operation is automatic'),'Build lock must preserve automatic operation.');
assert.ok(lock.includes('Do not reintroduce the legacy `y76`'),'Build lock must forbid the old third-era key.');
const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8').toLowerCase();
for(const forbidden of ['run all agents','resume current run','start new run']) assert.ok(!admin.includes(forbidden),`Admin must not expose normal manual runner control: ${forbidden}`);
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(index.indexOf('class="real-sources"') < index.indexOf('class="community-home"'),'Community Press Voices must immediately follow the source/perspective strip.');
assert.ok(!index.includes('WHAT AMERICA WASN’T SEEING'),'Removed four-card row must not return to the locked homepage.');

const allText=['app.js','page.js','lib/agents.js','lib/prompts.js','lib/engine.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
assert.ok(!/\by76\b|era-76/.test(allText),'The clean rebuild must use y75 consistently and carry no legacy y76 compatibility key.');
const archiveRoute=fs.readFileSync(path.join(root,'lib/routes/content-archive.js'),'utf8');
assert.ok(archiveRoute.includes('{ok:true,editions:rows}'),'Archive API must expose a clean editions response key.');
const pageJs=fs.readFileSync(path.join(root,'page.js'),'utf8');
assert.ok(pageJs.includes('d.editions||[]'),'Archive page must consume the clean editions response key.');
const engineJs=fs.readFileSync(path.join(root,'lib/engine.js'),'utf8');
assert.ok(engineJs.includes('function visualIdentity'),'Visual rights and placement must share one canonical archive/asset identity contract.');
assert.ok(engineJs.includes('source_url:visualIdentity(raw)'),'Visual approval items must use the same identity contract as rights filtering.');
assert.ok(!fs.readFileSync(path.join(root,'lib/prompts.js'),'utf8').includes('sideEraRecoveryPrompt'),'Dead legacy recovery prompt must not ship in the consolidated build.');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
assert.ok(Array.isArray(vercel.crons)&&vercel.crons.some(c=>c.path==='/api/cron/newsroom'),'The automatic newsroom must have a scheduler route.');
console.log('ARCHITECTURE_TESTS_PASS');
