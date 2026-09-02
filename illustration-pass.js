(function(){
  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='illustration-pass.css?v=20260901c';
  document.head.appendChild(style);

  function text(v){return String(v||'').trim();}
  function safeArray(v){return Array.isArray(v)?v:[];}
  function storySummary(story,limit=230){
    const value=text(story?.summary||story?.evidenceNotes||story?.verificationNotes);
    if(!value)return'';
    return value.length>limit?`${value.slice(0,limit).trim()}…`:value;
  }

  function addThenNowVisuals(){
    const section=document.getElementById('thenNowStrip');
    if(!section||section.hidden)return;
    const cells=[...section.querySelectorAll('.then-now-cell')];
    const classes=['then','changed','now'];
    const labels=['Historical setting','What changed over time','How the subject reaches the present'];
    cells.forEach((cell,i)=>{
      if(cell.querySelector('.then-now-visual'))return;
      const vis=document.createElement('div');
      vis.className=`then-now-visual ${classes[i]||'changed'}`;
      const span=document.createElement('span');span.textContent=labels[i]||'Historical context';vis.appendChild(span);
      const label=cell.querySelector('.then-now-label');label?.after(vis);
    });
  }

  function addSecondaryCards(edition){
    const holder=document.querySelector('.more-headlines');if(!holder)return;
    const stories=safeArray(edition?.stories?.y100?.secondary).filter(s=>text(s?.title)).slice(0,3);
    if(!stories.length||holder.querySelector('.more-headline-visual-grid'))return;
    const grid=document.createElement('div');grid.className='more-headline-visual-grid';
    stories.forEach(story=>{
      const card=document.createElement('div');card.className='more-headline-visual';
      const b=document.createElement('b');b.textContent=story.title;
      const span=document.createElement('span');span.textContent=[story.publication,story.issueDate].filter(text).join(' • ');
      card.append(b,span);grid.appendChild(card);
    });
    holder.prepend(grid);
  }

  function addDailyContextBand(edition){
    if(document.querySelector('.daily-context-band'))return;
    const stories={
      y200:edition?.stories?.y200||null,
      y100:edition?.stories?.y100?.major||null,
      y75:edition?.stories?.y75||null,
    };
    if(!Object.values(stories).some(Boolean))return;
    const band=document.createElement('section');band.className='daily-context-band';
    const heading=document.createElement('div');heading.className='daily-context-heading';heading.textContent='Across the Three Eras';band.appendChild(heading);
    const grid=document.createElement('div');grid.className='daily-context-grid';
    const labels={y200:'Deep Archive',y100:'Central Civic Conversation',y75:'Living-Memory Reexamination'};
    for(const key of ['y200','y100','y75']){
      const story=stories[key];if(!story)continue;
      const card=document.createElement('article');card.className='context-era-card';card.dataset.era=key;
      const label=document.createElement('div');label.className='context-era-label';label.textContent=labels[key];
      const h3=document.createElement('h3');h3.textContent=text(story.title)||'Verified historical story';
      const p=document.createElement('p');p.textContent=storySummary(story)||'Verified source material from the exact historical issue anchors this era.';
      const source=document.createElement('span');source.className='context-era-source';source.textContent=[story.publication,story.issueDate,story.city].filter(text).join(' • ');
      card.append(label,h3,p,source);grid.appendChild(card);
    }
    band.appendChild(grid);
    const board=document.querySelector('.history-board');
    board?.after(band);
  }

  function adaptCommunityGrid(){
    const grid=document.getElementById('communityPriorityGrid');if(!grid)return;
    const cards=[...grid.querySelectorAll('.community-card')];
    grid.dataset.cardCount=String(Math.min(cards.length,4));
    const black=document.getElementById('blackCenter');
    if(cards.length===1&&black&&!black.querySelector('.community-desk-note')){
      const note=document.createElement('div');note.className='community-desk-note';
      note.innerHTML='<b>Why this desk remains visible</b>This is the permanent Community Press desk. Additional community boxes appear only when verified material exists for that exact date, so the page does not manufacture viewpoints or filler.';
      black.appendChild(note);
    }
  }

  function addSourceTrail(edition){
    if(document.querySelector('.source-trail-band'))return;
    const candidates=[];
    const push=story=>{if(story&&text(story.title)&&text(story.sourceUrl))candidates.push(story);};
    push(edition?.stories?.y200);
    push(edition?.stories?.y100?.major);
    safeArray(edition?.stories?.y100?.secondary).forEach(push);
    safeArray(edition?.communityTiles).forEach(push);
    push(edition?.stories?.y75);
    const dedupe=[];const seen=new Set();
    for(const story of candidates){
      const key=text(story.sourceUrl);if(!key||seen.has(key))continue;seen.add(key);dedupe.push(story);
      if(dedupe.length>=6)break;
    }
    if(dedupe.length<2)return;
    const band=document.createElement('section');band.className='source-trail-band';
    const head=document.createElement('div');head.className='source-trail-head';
    const h2=document.createElement('h2');h2.textContent='Source Trail';
    const small=document.createElement('span');small.textContent='Verified publications used in today’s edition';head.append(h2,small);band.appendChild(head);
    const grid=document.createElement('div');grid.className='source-trail-grid';
    dedupe.slice(0,6).forEach(story=>{
      const card=document.createElement('article');card.className='source-trail-card';
      const b=document.createElement('b');b.textContent=story.publication||story.archive||'Historical source';
      const p=document.createElement('p');p.textContent=[story.issueDate,story.city,story.title].filter(text).join(' — ');
      const a=document.createElement('a');a.href=story.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open source →';
      card.append(b,p,a);grid.appendChild(card);
    });
    band.appendChild(grid);
    const community=document.querySelector('.community-home');
    community?.after(band);
  }

  function addRecipeVisual(edition){
    const section=document.getElementById('archiveRecipe');
    if(!section||section.hidden||section.querySelector('.recipe-illustration-banner'))return;
    const banner=document.createElement('div');banner.className='recipe-illustration-banner';
    const r=edition?.archiveRecipe||{};
    banner.dataset.caption=[r.publication,r.issueDate,r.location].filter(text).join(' • ')||'Recipe and domestic-life archive context';
    section.querySelector('.recipe-grid')?.before(banner);
  }

  async function run(){
    try{
      const res=await fetch(`/api/content/today?balance=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!res.ok)return;
      const json=await res.json();
      const edition=json?.edition?.payload;if(!edition)return;
      addSecondaryCards(edition);
      addDailyContextBand(edition);
      setTimeout(()=>{
        addThenNowVisuals();
        adaptCommunityGrid();
        addSourceTrail(edition);
        addRecipeVisual(edition);
      },250);
      setTimeout(()=>{
        addThenNowVisuals();
        adaptCommunityGrid();
        addSourceTrail(edition);
        addRecipeVisual(edition);
      },1200);
    }catch(error){console.warn('Homepage balance pass unavailable.',error);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
