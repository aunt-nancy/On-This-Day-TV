(function(){
  const SITE_TZ='America/Los_Angeles';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clean=s=>String(s??'').trim();
  const normalizeCommunity=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const communityAliases={
    black:'black',black_press:'black',african_american:'black',african_american_press:'black',
    latino:'latino',spanish_language:'latino',spanish_language_latino:'latino',hispanic:'latino',
    chinese:'chinese',chinese_american:'chinese',chinese_american_press:'chinese',
    japanese:'japanese',japanese_american:'japanese',japanese_american_press:'japanese',
    jewish:'jewish',jewish_american:'jewish',jewish_american_press:'jewish',
    irish:'irish',irish_american:'irish',irish_american_press:'irish',
    italian:'italian',italian_american:'italian',italian_american_press:'italian',
    german:'german',german_american:'german',german_american_press:'german',
    british:'british',british_american:'british',british_american_press:'british',
    indigenous:'indigenous',native:'indigenous',native_american:'indigenous',indigenous_native:'indigenous'
  };

  function pacificParts(date=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:SITE_TZ,year:'numeric',month:'long',day:'numeric'}).formatToParts(date);
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return {year:Number(get('year')),month:get('month'),day:Number(get('day'))};
  }
  function datePartsFromISO(iso){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return null;
    const d=new Date(`${iso}T12:00:00Z`);
    if(Number.isNaN(d.getTime())) return null;
    return {year:d.getUTCFullYear(),month:d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),day:d.getUTCDate()};
  }
  function applyDate(parts){
    const full=`${parts.month} ${parts.day}, ${parts.year}`;
    const monthDay=`${parts.month} ${parts.day}`;
    document.querySelectorAll('[data-current-date]').forEach(el=>el.textContent=full);
    document.querySelectorAll('[data-current-monthday]').forEach(el=>el.textContent=monthDay);
    document.querySelectorAll('[data-current-year]').forEach(el=>el.textContent=String(parts.year));
    document.querySelectorAll('[data-year-offset]').forEach(el=>{
      const offset=parseInt(el.getAttribute('data-year-offset'),10)||0;
      el.textContent=String(parts.year-offset);
    });
  }
  applyDate(pacificParts());

  const search=document.getElementById('archiveSearch');
  const community=document.getElementById('communityFilter');
  function filterArchive(){
    const q=(search?.value||'').toLowerCase().trim();
    const c=community?.value||'all';
    document.querySelectorAll('.archive-card').forEach(card=>{
      const text=card.textContent.toLowerCase();
      const matchText=!q||text.includes(q);
      const matchCommunity=c==='all'||card.dataset.community===c||card.dataset.community==='all';
      card.style.display=(matchText&&matchCommunity)?'block':'none';
    });
  }
  search?.addEventListener('input',filterArchive);
  community?.addEventListener('change',filterArchive);

  function rankCommunityCards(){
    const grid=document.getElementById('communityPriorityGrid');
    if(!grid) return;
    const black=document.getElementById('blackCenter');
    const cards=[...grid.querySelectorAll('.sortable-community')];
    cards.sort((a,b)=>{
      const score=el=>(Number(el.dataset.populationWeight||0)*.55)+(Number(el.dataset.headlineWeight||0)*.45);
      return score(b)-score(a);
    });
    if(cards[0]) grid.insertBefore(cards[0],black);
    if(cards[1]) black.after(cards[1]);
    let anchor=cards[1]||black;
    cards.slice(2).forEach(card=>{anchor.after(card);anchor=card;});
  }
  rankCommunityCards();

  function storyText(story){
    return clean(story?.summary)||'Verified source coverage is available in today’s edition.';
  }
  function sourceLabel(story){
    const bits=[story?.publication,story?.city,story?.issueDate].map(clean).filter(Boolean);
    return bits.join(' • ')||'Original Newspaper';
  }
  function setLink(el,story,fallback){
    if(!el) return;
    if(story?.sourceUrl){ el.href=story.sourceUrl; el.target='_blank'; el.rel='noopener'; }
    else if(fallback){ el.href=fallback; el.removeAttribute('target'); el.removeAttribute('rel'); }
  }
  function populatePaper(root,story,fallbackHref){
    if(!root||!story?.title) return;
    const name=root.querySelector('.paper-name'); if(name) name.textContent=sourceLabel(story);
    const date=root.querySelector('.paper-date'); if(date&&story.issueDate){ const p=datePartsFromISO(story.issueDate); if(p) date.textContent=`${p.month} ${p.day}, ${p.year}`; }
    const headline=root.querySelector('.paper-headline'); if(headline) headline.textContent=story.title;
    const copy=root.querySelector('.paper-copy'); if(copy) copy.textContent=storyText(story);
    setLink(root.querySelector('.source-link'),story,fallbackHref);
  }
  function editionPayload(d){ return d?.edition?.payload||null; }
  async function fetchEdition(){
    const date=new URLSearchParams(location.search).get('date');
    const url=date?`/api/content/archive?date=${encodeURIComponent(date)}`:'/api/content/today';
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error(`Edition request failed: ${r.status}`);
    return r.json();
  }

  function renderHome(e){
    if(!document.querySelector('.history-board')||!e) return;
    const p=datePartsFromISO(e.editionDate); if(p) applyDate(p);
    const s=e.stories||{}, y=s.y100||{};
    document.querySelectorAll('[data-major-headline]').forEach(el=>{if(y.major?.title)el.textContent=y.major.title;});
    populatePaper(document.querySelector('.era-200 .paper'),s.y200,'today.html');
    populatePaper(document.querySelector('.era-center .center-paper:not(.black)'),y.major,'today.html');
    populatePaper(document.querySelector('.era-center .center-paper.black'),y.black,'community.html#black');
    populatePaper(document.querySelector('.era-75 .paper'),s.y75,'today.html');
    const more=document.querySelector('.more-headlines p');
    if(more&&(y.secondary||[]).length){ more.textContent=(y.secondary||[]).slice(0,3).map(x=>x.title).filter(Boolean).join(' • '); }

    const byCommunity=new Map();
    for(const story of (e.communityTiles||[])){
      const raw=normalizeCommunity(story.community||story.communityKey||story.sourceDesk||'');
      const key=communityAliases[raw]||raw;
      if(key&&!byCommunity.has(key)) byCommunity.set(key,story);
    }
    if(y.black?.title) byCommunity.set('black',y.black);
    document.querySelectorAll('#communityPriorityGrid .community-card').forEach(card=>{
      const raw=normalizeCommunity(card.dataset.community||card.id||'');
      const key=communityAliases[raw]||raw;
      const story=byCommunity.get(key); if(!story?.title) return;
      const p=card.querySelector('p'); if(p) p.textContent=`${story.title} — ${storyText(story)}`;
      const a=card.querySelector('a'); setLink(a,story,a?.getAttribute('href'));
      if(card.classList.contains('sortable-community')) card.dataset.headlineWeight=String(Math.max(50,Math.round((Number(story.confidence||.5))*100)));
    });
    const blackMini=document.querySelector('#blackCenter .black-compare-mini');
    if(blackMini){ const spans=blackMini.querySelectorAll('span'); if(spans[0]&&y.major?.title)spans[0].textContent=y.major.title; if(spans[1]&&y.black?.title)spans[1].textContent=y.black.title; }
    rankCommunityCards();
  }

  function updateStoryRow(row,story,label){
    if(!row||!story?.title) return;
    const meta=row.querySelector('.story-meta'); if(meta&&label) meta.textContent=label;
    const h=row.querySelector('h2'); if(h) h.textContent=story.title;
    const p=row.querySelector('p'); if(p) p.textContent=storyText(story);
    const a=row.querySelector('a'); if(a){ a.textContent='Original Source'; setLink(a,story,a.getAttribute('href')); }
  }
  function renderToday(e){
    if(!document.querySelector('.story-list')||!e) return;
    const p=datePartsFromISO(e.editionDate); if(p) applyDate(p);
    const rows=[...document.querySelectorAll('.story-list .story-row')];
    const s=e.stories||{}, y=s.y100||{};
    if(rows[0]&&y.major?.title){
      const comparison=y.black?.title?{...y.major,summary:`Major Press: ${y.major.title}. Black Press: ${y.black.title}. ${storyText(y.black)}`} : y.major;
      updateStoryRow(rows[0],comparison,'FEATURED • 100 YEARS AGO');
    }
    updateStoryRow(rows[1],s.y200,'200 YEARS AGO');
    updateStoryRow(rows[2],s.y75,'75 YEARS AGO');
    if(rows[3]&&(y.secondary||[]).length){ const h=rows[3].querySelector('h2'); const p2=rows[3].querySelector('p'); if(h)h.textContent='More verified headlines'; if(p2)p2.textContent=(y.secondary||[]).slice(0,5).map(x=>x.title).join(' • '); }
  }

  function renderCommunity(e){
    if(!document.querySelector('.community-grid')||!e) return;
    const byCommunity=new Map();
    const y=e.stories?.y100||{};
    if(y.black?.title) byCommunity.set('black',y.black);
    for(const story of (e.communityTiles||[])){
      const raw=normalizeCommunity(story.community||story.communityKey||story.sourceDesk||'');
      const key=communityAliases[raw]||raw;
      if(key&&!byCommunity.has(key))byCommunity.set(key,story);
    }
    document.querySelectorAll('.community-grid .community-card').forEach(card=>{
      const key=communityAliases[normalizeCommunity(card.id)]||normalizeCommunity(card.id);
      const story=byCommunity.get(key); if(!story?.title)return;
      const p=card.querySelector('p'); if(p)p.textContent=`${story.title} — ${storyText(story)}`;
      const a=card.querySelector('a'); if(a){a.textContent='Open Original Source →';setLink(a,story,a.getAttribute('href'));}
    });
  }

  function renderRegional(e){
    if(!document.querySelector('.regions')||!e) return;
    const rows=(e.stories?.y100?.secondary||[]).filter(s=>s.sourceDesk==='regional_local');
    const cards=[...document.querySelectorAll('.regions .region-card')];
    rows.slice(0,cards.length).forEach((story,i)=>{
      const card=cards[i],h=card.querySelector('h3'),p=card.querySelector('p');
      if(h)h.textContent=clean(story.city)||clean(story.publication)||'Regional & Local';
      if(p)p.textContent=`${story.title} — ${storyText(story)}`;
      card.style.cursor=story.sourceUrl?'pointer':'';
      if(story.sourceUrl){card.onclick=()=>window.open(story.sourceUrl,'_blank','noopener');card.title='Open original source';}
    });
  }

  async function renderArchive(){
    const grid=document.querySelector('.archive-grid'); if(!grid)return;
    const r=await fetch('/api/content/archive',{cache:'no-store'}); if(!r.ok)return;
    const d=await r.json(); const rows=d.editions||[]; if(!rows.length)return;
    grid.innerHTML=rows.slice(0,12).map(x=>`<div class="archive-card" data-community="all"><span class="badge">Published Edition</span><h3>${esc(x.lead_headline||'On This Day Edition')}</h3><p>${esc(x.edition_date||'')}</p><p><a href="today.html?date=${encodeURIComponent(x.edition_date||'')}">Open this edition →</a></p></div>`).join('');
    filterArchive();
  }

  window.OnThisDay=window.OnThisDay||{};
  window.OnThisDay.setMajorHeadline=headline=>document.querySelectorAll('[data-major-headline]').forEach(el=>el.textContent=headline||'Today’s Leading Verified Headline');

  document.addEventListener('DOMContentLoaded',async()=>{
    try{
      const data=await fetchEdition(); const e=editionPayload(data);
      if(e){ renderHome(e); renderToday(e); renderCommunity(e); renderRegional(e); }
      await renderArchive();
    }catch(err){ console.warn('On This Day live edition is not available yet.',err); }
  });
})();
