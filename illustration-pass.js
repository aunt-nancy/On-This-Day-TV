(function(){
  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='illustration-pass.css?v=20260901a';
  document.head.appendChild(style);

  function text(v){return String(v||'').trim();}
  function safeArray(v){return Array.isArray(v)?v:[];}
  function firstVisual(edition,eraKey){
    const visual=safeArray(edition?.visuals).find(v=>v?.eraKey===eraKey&&(v.rightsStatus==='public_domain'||v.displayMode==='full_image'))
      ||safeArray(edition?.visuals).find(v=>v?.eraKey===eraKey);
    if(!visual)return null;
    const candidates=[visual.downloadUrl,visual.assetUrl,visual.thumbnailUrl,visual.sourcePageUrl].filter(text);
    const image=candidates.find(u=>/\.(png|jpe?g|webp)(\?|$)/i.test(u));
    if(image)return{type:'image',url:image,label:visual.title||'Historical newspaper page'};
    const pdf=candidates.find(u=>/\.pdf(\?|$)/i.test(u));
    if(pdf)return{type:'pdf',url:pdf,label:visual.title||'Historical newspaper page'};
    return null;
  }
  function renderMedia(box,visual,caption,fallbackClass='editorial-fallback'){
    if(!box)return;
    box.replaceChildren();
    box.classList.add('featured-period-illustration');
    box.classList.add(fallbackClass);
    box.dataset.caption=caption||'Historical newspaper view';
    if(!visual)return;
    box.classList.remove(fallbackClass);
    if(visual.type==='pdf'){
      const frame=document.createElement('iframe');
      frame.src=`${visual.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
      frame.loading='lazy';frame.title=visual.label;box.appendChild(frame);
    }else{
      const img=document.createElement('img');
      img.src=visual.url;img.alt=visual.label;img.loading='lazy';box.appendChild(img);
    }
  }
  function addCenterVisuals(edition){
    const majorPaper=document.querySelector('.era-center .center-paper:not(.black)');
    if(majorPaper&&!majorPaper.querySelector('.featured-period-illustration')){
      const div=document.createElement('div');
      const anchor=majorPaper.querySelector('.paper-date');
      anchor?.after(div);
      const visual=firstVisual(edition,'y100');
      const story=edition?.stories?.y100?.major||{};
      renderMedia(div,visual,[story.publication,story.issueDate].filter(text).join(' • ')||'100-year archival front page');
    }
    const blackPaper=document.querySelector('.era-center .center-paper.black');
    if(blackPaper&&!blackPaper.querySelector('.featured-period-illustration')){
      const black=edition?.stories?.y100?.black||null;
      const div=document.createElement('div');
      const anchor=blackPaper.querySelector('.paper-date');
      anchor?.after(div);
      div.className='featured-period-illustration black-press-visual';
      div.dataset.caption=black?.publication?`${black.publication} • ${black.issueDate||''}`:'Black Press archival lens';
    }
  }
  function addThenNowVisuals(){
    const section=document.getElementById('thenNowStrip');
    if(!section||section.hidden)return;
    const cells=[...section.querySelectorAll('.then-now-cell')];
    const classes=['then','changed','now'];
    const labels=['Historical record','What the years revealed','The issue today'];
    cells.forEach((cell,i)=>{
      if(cell.querySelector('.then-now-visual'))return;
      const vis=document.createElement('div');
      vis.className=`then-now-visual ${classes[i]||'changed'}`;
      const span=document.createElement('span');span.textContent=labels[i]||'Historical context';vis.appendChild(span);
      const label=cell.querySelector('.then-now-label');label?.after(vis);
    });
  }
  function addCommunityVisuals(){
    document.querySelectorAll('#communityPriorityGrid .community-card').forEach(card=>{
      if(card.querySelector('.community-masthead-visual'))return;
      const body=card.querySelector('div');if(!body)return;
      const pub=text(card.querySelector('.community-publication')?.textContent).split(' • ')[0];
      const heading=text(card.querySelector('h3')?.textContent);
      const visual=document.createElement('div');visual.className='community-masthead-visual';
      const strong=document.createElement('strong');strong.textContent=pub||heading||'Community Press';visual.appendChild(strong);
      const h3=body.querySelector('h3');h3?.before(visual);
    });
  }
  function addSecondaryVisuals(edition){
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
  function addRecipeVisual(edition){
    const section=document.getElementById('archiveRecipe');
    if(!section||section.hidden||section.querySelector('.recipe-illustration-banner'))return;
    const banner=document.createElement('div');banner.className='recipe-illustration-banner';
    const r=edition?.archiveRecipe||{};
    banner.dataset.caption=[r.publication,r.issueDate,r.location].filter(text).join(' • ')||'Recipe from the newspaper archive';
    const grid=section.querySelector('.recipe-grid');grid?.before(banner);
  }

  async function run(){
    try{
      const res=await fetch(`/api/content/today?illustrations=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!res.ok)return;
      const json=await res.json();
      const edition=json?.edition?.payload;if(!edition)return;
      addCenterVisuals(edition);
      addSecondaryVisuals(edition);
      // app.js renders these asynchronously from the same payload. Allow its DOM updates to land first.
      setTimeout(()=>{
        addThenNowVisuals();
        addCommunityVisuals();
        addRecipeVisual(edition);
      },250);
      setTimeout(()=>{
        addThenNowVisuals();
        addCommunityVisuals();
        addRecipeVisual(edition);
      },1200);
    }catch(error){console.warn('Illustration pass unavailable.',error);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
