const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate=s=>{if(!s)return'';try{return new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})}catch{return s}};
const displayTitle=story=>String(story?.englishTitle||story?.translatedTitle||story?.titleEnglish||story?.title||'').trim();
function storyCard(story,label='Story'){
  if(!displayTitle(story))return'';
  return `<article class="editorial-card source-card"><div class="meta">${esc(label)}${story.eraYear?' • '+esc(story.eraYear):''}</div><h2>${esc(displayTitle(story))}</h2><p>${esc(story.summary||'')}</p><p><b>${esc(story.publication||'')}</b>${story.city?' • '+esc(story.city):''}${story.issueDate?' • '+esc(fmtDate(story.issueDate)):''}${story.page?' • Page '+esc(story.page):''}</p>${story.archive?`<p class="muted">Archive: ${esc(story.archive)}</p>`:''}${story.sourceUrl?`<a target="_blank" rel="noopener" href="${esc(story.sourceUrl)}">View original source →</a>`:''}</article>`;
}
async function getToday(){const date=new URLSearchParams(location.search).get('date');const url=date?`/api/content/archive?date=${encodeURIComponent(date)}`:'/api/content/today';const r=await fetch(url,{cache:'no-store'});return r.json()}
async function renderToday(){
  const mount=document.getElementById('todayMount');if(!mount)return;
  const d=await getToday();const e=d?.edition?.payload;if(!e){mount.hidden=true;return}
  const s=e.stories||{};const y=s.y100||{};
  const core=storyCard(s.y200,'200 Years Ago')+storyCard(y.major,'100 Years Ago — Major American Press')+storyCard(y.black,'100 Years Ago — Black Press')+storyCard(s.y75,'75 Years Ago');
  if(!core){mount.hidden=true;return}
  mount.hidden=false;
  mount.innerHTML=`<div class="page-kicker">${d.servingFallback?'Latest published edition • ':''}${esc(fmtDate(e.editionDate||d?.edition?.edition_date))}</div><p class="page-intro">One date. Many American voices. Every displayed story links to the source record used by the newsroom.</p><div class="editorial-grid">${core}</div>${(y.secondary||[]).length?`<h2>More Verified Headlines</h2><div class="editorial-grid">${(y.secondary||[]).map(x=>storyCard(x,'Additional Headline')).join('')}</div>`:''}`;
}
function communityName(s){return String(s?.community||'Community Press').replaceAll('_',' ')}
function communityContext(s){
  if(s?.comparisonType==='same_event')return'Verified coverage of the featured event';
  if(s?.comparisonType==='same_topic'){
    if(s.dateRelation==='previous_daily_issue')return'Verified reporting on the same topic from the previous daily issue';
    if(s.dateRelation==='adjacent_daily_issue')return'Verified reporting on the same topic from an adjacent daily issue';
    if(s.dateRelation==='nearest_weekly_issue')return'Verified reporting on the same topic from the nearest weekly issue';
    return'Verified reporting on the same topic';
  }
  if(s?.searchOutcome==='same_topic_not_verified')return'Newspaper source audit: no same-topic item is claimed from the issue searched';
  return'Newspaper source audit';
}
async function renderCommunity(){
  const mount=document.getElementById('communityMount');if(!mount)return;const d=await getToday();const e=d?.edition?.payload;
  const tiles=e?.communityTiles||[];const black=e?.stories?.y100?.black;
  const directBlack=black?.title?{...black,comparisonType:black.eventKey&&black.eventKey===e?.leadEventKey?'same_event':black.comparisonType}:null;
  const items=[...(directBlack?[directBlack]:[]),...tiles];
  if(!items.length){mount.hidden=true;return}
  mount.hidden=false;
  mount.innerHTML=`<h2>Published Community Press Articles</h2><p class="page-intro">Papers are selected by documented historical circulation or reach, then longevity. Direct coverage of the national headline ranks first, followed by verified reporting on the same topic. A fallback is shown only as a labeled source audit.</p><div class="community-list">${items.map(s=>`<article class="editorial-card"><div class="meta">${esc(communityName(s))}</div><h2>${esc(displayTitle(s))}</h2><p>${esc(s.summary||'')}</p><p class="muted">${esc(communityContext(s))}</p>${s.sourceSelectionNote?`<p class="muted"><b>Why this paper:</b> ${esc(s.sourceSelectionNote)}</p>`:''}<p><b>${esc(s.publication||'')}</b>${s.issueDate?' • '+esc(fmtDate(s.issueDate)):''}</p>${s.sourceRankLabel?`<p class="source-rank"><b>Source rank:</b> ${esc(s.sourceRankLabel)}</p>`:''}${s.sourceUrl?`<a target="_blank" rel="noopener" href="${esc(s.sourceUrl)}">View original source →</a>`:''}</article>`).join('')}</div>`;
}
async function renderArchive(){
  const mount=document.getElementById('archiveMount');if(!mount)return;const r=await fetch('/api/content/archive',{cache:'no-store'});const d=await r.json();const rows=d.editions||[];
  mount.innerHTML=rows.length?rows.map(e=>`<article class="archive-row"><b>${esc(fmtDate(e.edition_date))}</b><span>${esc(e.lead_headline||'Published edition')}</span><a href="today.html?date=${esc(e.edition_date)}">Open edition →</a></article>`).join(''):'<p class="empty-state">No closed publication dates yet.</p>';
}
async function renderRegional(){
  const mount=document.getElementById('regionalMount');if(!mount)return;const d=await getToday();const e=d?.edition?.payload;const rows=(e?.stories?.y100?.secondary||[]).filter(s=>s.sourceDesk==='regional_local');
  if(!rows.length){mount.hidden=true;return}
  mount.hidden=false;mount.innerHTML=`<h2>Published Regional &amp; Local Articles</h2><div class="editorial-grid">${rows.map(s=>storyCard(s,'Regional & Local')).join('')}</div>`;
}
document.addEventListener('DOMContentLoaded',()=>{renderToday().catch(()=>{});renderCommunity().catch(()=>{});renderArchive().catch(()=>{});renderRegional().catch(()=>{});});
