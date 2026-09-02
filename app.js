(function(){
  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href=`homepage-enhancements.css?v=20260901b`;
  document.head.appendChild(style);

  const SITE_TZ='America/Los_Angeles';
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:SITE_TZ,year:'numeric',month:'long',day:'numeric'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type)?.value||'';
  const year=Number(get('year'));
  const month=get('month');
  const day=Number(get('day'));
  const fullDate=`${month} ${day}, ${year}`;
  const monthDay=`${month} ${day}`;

  document.querySelectorAll('[data-current-date]').forEach(el=>el.textContent=fullDate);
  document.querySelectorAll('[data-current-monthday]').forEach(el=>el.textContent=monthDay);
  document.querySelectorAll('[data-current-year]').forEach(el=>el.textContent=String(year));
  document.querySelectorAll('[data-year-offset]').forEach(el=>{
    const offset=parseInt(el.getAttribute('data-year-offset'),10)||0;
    el.textContent=String(year-offset);
  });

  const search=document.getElementById('archiveSearch');
  const community=document.getElementById('communityFilter');
  function filterArchive(){
    const q=(search?.value||'').toLowerCase().trim();
    const c=community?.value||'all';
    document.querySelectorAll('.archive-card').forEach(card=>{
      const body=card.textContent.toLowerCase();
      card.style.display=(!q||body.includes(q))&&(c==='all'||card.dataset.community===c)?'block':'none';
    });
  }
  search?.addEventListener('input',filterArchive);
  community?.addEventListener('change',filterArchive);
})();

window.OnThisDay=window.OnThisDay||{};
window.OnThisDay.setMajorHeadline=function(headline){
  document.querySelectorAll('[data-major-headline]').forEach(el=>{
    el.textContent=headline||'Today’s Leading Verified Headline';
  });
};

function text(value){return String(value||'').trim();}
function setElText(el,value){if(el&&text(value))el.textContent=text(value);}
function setSourceLink(el,url,label){
  if(!el||!text(url))return;
  el.href=url;el.target='_blank';el.rel='noopener noreferrer';
  if(label)el.textContent=label;
}
function paperParts(paper){
  if(!paper)return{};
  return {
    name:paper.querySelector('.paper-name'),
    date:paper.querySelector('.paper-date'),
    headline:paper.querySelector('.paper-headline'),
    copy:paper.querySelector('.paper-copy'),
    link:paper.querySelector('.source-link')
  };
}
function bindPaper(paper,story,linkLabel){
  if(!paper)return;
  const p=paperParts(paper);
  if(!story||!text(story.title)||!text(story.sourceUrl)){
    if(p.headline)p.headline.textContent='Headline pending exact-date verification';
    if(p.link)p.link.hidden=true;
    return;
  }
  setElText(p.name,story.publication||story.archive);
  setElText(p.date,story.issueDate);
  setElText(p.headline,story.title);
  setElText(p.copy,story.summary||story.evidenceNotes||story.verificationNotes);
  setSourceLink(p.link,story.sourceUrl,linkLabel);
  if(p.link)p.link.hidden=false;
}
function resetPublishedEditionDisplay(){
  window.OnThisDay.setMajorHeadline('Exact-date edition being prepared');
  const resetPaper=(paper,name,copy)=>{
    if(!paper)return;
    const p=paperParts(paper);
    if(p.name)p.name.textContent=name;
    if(p.headline)p.headline.textContent='Headline pending exact-date verification';
    if(p.copy)p.copy.textContent=copy;
    if(p.link){p.link.hidden=true;p.link.removeAttribute('href');}
  };
  resetPaper(document.querySelector('.era-200 .paper'),'Original Newspaper','The 200-year lead is being verified against the exact newspaper issue.');
  resetPaper(document.querySelector('.era-center .center-paper:not(.black)'),'Major American Press','The 100-year lead is being verified against the exact newspaper issue and circulation record.');
  resetPaper(document.querySelector('.era-center .center-paper.black'),'Black American Press','Verified Black Press coverage or the day’s leading Black Press story will appear here.');
  resetPaper(document.querySelector('.era-76 .paper'),'Original Newspaper','The 75-year lead is being verified against the exact newspaper issue.');
  const thenNow=document.getElementById('thenNowStrip');if(thenNow)thenNow.hidden=true;
  const recipe=document.getElementById('archiveRecipe');if(recipe)recipe.hidden=true;
}

function normalizeCommunity(value,story={}){
  const s=`${text(value)} ${text(story.sourceDesk)} ${text(story.publication)}`.toLowerCase();
  if(/black|african|afro-american|afro american/.test(s))return'black';
  if(/latino|spanish|hispanic|mexican american|el fronterizo/.test(s))return'latino';
  if(/german/.test(s))return'german';
  if(/british|anglo/.test(s))return'british';
  if(/chinese/.test(s))return'chinese';
  if(/japanese/.test(s))return'japanese';
  if(/irish/.test(s))return'irish';
  if(/italian/.test(s))return'italian';
  if(/jewish|yiddish/.test(s))return'jewish';
  if(/indigenous|native|tribal/.test(s))return'indigenous';
  if(/caribbean/.test(s))return'caribbean';
  if(/filipino/.test(s))return'filipino';
  if(/south asian/.test(s))return'south_asian';
  if(/armenian/.test(s))return'armenian';
  if(/greek/.test(s))return'greek';
  if(/polish/.test(s))return'polish';
  return'';
}
const COMMUNITY_LABELS={
  latino:'Spanish-Language & Latino Press',german:'German American Press',british:'British American Press',
  chinese:'Chinese American Press',japanese:'Japanese American Press',irish:'Irish American Press',
  italian:'Italian American Press',jewish:'Jewish American Press',indigenous:'Indigenous & Native Press',
  caribbean:'Caribbean American Press',filipino:'Filipino American Press',south_asian:'South Asian American Press',
  armenian:'Armenian American Press',greek:'Greek American Press',polish:'Polish American Press'
};
function communityLabel(story,key){
  const raw=text(story?.community);
  if(raw&&raw.length<55&&!/press$/i.test(raw))return `${raw} Press`;
  return COMMUNITY_LABELS[key]||raw||'Community Press';
}
function storyScore(story){
  const importance=Number(story?.nationalImportance||0);
  const confidence=Number(story?.confidence||0);
  return (Number.isFinite(importance)?importance:0)*100+(Number.isFinite(confidence)?confidence:0);
}
function chooseCommunityStory(candidates,leadEventKey){
  if(!candidates.length)return null;
  const same=candidates.filter(s=>leadEventKey&&text(s.eventKey)===leadEventKey).sort((a,b)=>storyScore(b)-storyScore(a));
  if(same.length)return{...same[0],comparisonType:'same_event'};
  const fallback=[...candidates].sort((a,b)=>storyScore(b)-storyScore(a))[0];
  return fallback?{...fallback,comparisonType:'community_lead'}:null;
}
function updateCommunityCard(card,story,key,isBlack=false){
  if(!card)return;
  const h3=card.querySelector('h3');
  const p=card.querySelector('p');
  const link=card.querySelector('a');
  let mode=card.querySelector('.community-mode');
  let publication=card.querySelector('.community-publication');
  if(!mode&&card.querySelector('div')){
    mode=document.createElement('div');mode.className='community-mode';card.querySelector('div').prepend(mode);
  }
  if(!publication&&card.querySelector('div')){
    publication=document.createElement('span');publication.className='community-publication';card.querySelector('div').append(publication);
  }
  if(!story){
    if(mode)mode.textContent='Permanent community desk';
    if(p){p.className='community-empty-note';p.textContent='No verified Black Press article for the 100-year headline or same-date Black Press fallback was available in the sources searched. This desk remains permanently visible.';}
    if(publication)publication.textContent='';
    if(link){link.hidden=false;link.href='community.html#black';link.textContent='Explore Black Press →';}
    return;
  }
  card.dataset.communityMode=story.comparisonType||'community_lead';
  if(h3&&!isBlack)h3.textContent=communityLabel(story,key);
  if(mode)mode.textContent=story.comparisonType==='same_event'?'Community coverage of the 100-year headline':'What mattered in this community that day';
  if(p){p.className='';p.textContent=`${story.title}${text(story.summary)?` — ${story.summary}`:''}`;}
  if(publication)publication.textContent=[story.publication,story.issueDate].filter(text).join(' • ');
  setSourceLink(link,story.sourceUrl,'View Original Community Source →');
  if(link)link.hidden=false;
}
function renderDynamicCommunityVoices(edition,major,black){
  const grid=document.getElementById('communityPriorityGrid');
  if(!grid)return;
  const blackCard=document.getElementById('blackCenter');
  [...grid.querySelectorAll('.community-card:not(#blackCenter)')].forEach(card=>card.remove());

  const y100Year=String(edition?.years?.y100||major?.eraYear||'');
  const pool=[black,...(Array.isArray(edition?.stories?.y100?.secondary)?edition.stories.y100.secondary:[]),...(Array.isArray(edition?.communityTiles)?edition.communityTiles:[])].filter(Boolean).filter(story=>{
    const era=text(story.eraKey);
    const issue=text(story.issueDate);
    return (era==='y100'||(!era&&y100Year&&issue.startsWith(y100Year)))&&text(story.title)&&text(story.sourceUrl);
  });
  const leadEventKey=text(edition?.leadEventKey||major?.eventKey);
  const grouped=new Map();
  for(const story of pool){
    const key=normalizeCommunity(story.community||story.communityKey||story.group,story);
    if(!key)continue;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(story);
  }

  const blackStory=chooseCommunityStory(grouped.get('black')||[],leadEventKey);
  updateCommunityCard(blackCard,blackStory,'black',true);

  const dynamic=[];
  for(const [key,candidates] of grouped){
    if(key==='black')continue;
    const story=chooseCommunityStory(candidates,leadEventKey);
    if(story)dynamic.push({key,story});
  }
  dynamic.sort((a,b)=>{
    const am=a.story.comparisonType==='same_event'?1:0;
    const bm=b.story.comparisonType==='same_event'?1:0;
    return bm-am||storyScore(b.story)-storyScore(a.story);
  });

  dynamic.slice(0,8).forEach(({key,story})=>{
    const card=document.createElement('div');
    card.className='community-card dynamic-community';
    card.dataset.community=key;
    card.innerHTML='<div><div class="community-mode"></div><h3></h3><p></p><span class="community-publication"></span></div><a href="#">View Original Community Source →</a>';
    updateCommunityCard(card,story,key,false);
    grid.appendChild(card);
  });

  if(blackCard&&blackCard.parentElement===grid)grid.prepend(blackCard);
  const intro=document.querySelector('.community-home .section-heading p');
  if(intro)intro.textContent='Community Press Voices first follows the 100-year headline through the communities that covered it. When a community paper did not address that headline, its strongest verified story from that same day appears instead. These voices are representative, not required to disagree.';
}

function periodVisualCandidate(edition,eraKey){
  const visuals=Array.isArray(edition?.visuals)?edition.visuals.filter(v=>v?.eraKey===eraKey):[];
  const safe=visuals.filter(v=>v.rightsStatus==='public_domain'||v.displayMode==='full_image');
  const all=[...safe,...visuals];
  for(const v of all){
    const choices=[v.downloadUrl,v.assetUrl,v.thumbnailUrl,v.sourcePageUrl].filter(text);
    const image=choices.find(u=>/\.(png|jpe?g|webp)(\?|$)/i.test(u));
    if(image)return{url:image,type:'image',label:v.title||'Period newspaper view'};
    const pdf=choices.find(u=>/\.pdf(\?|$)/i.test(u));
    if(pdf)return{url:pdf,type:'pdf',label:v.title||'Period newspaper view'};
  }
  const ill=edition?.illustrations?.[eraKey];
  if(ill?.url){
    if(/\.pdf(\?|$)/i.test(ill.url))return{url:ill.url,type:'pdf',label:ill.label||'Period newspaper view'};
    if(/\.(png|jpe?g|webp)(\?|$)/i.test(ill.url))return{url:ill.url,type:'image',label:ill.label||'Period newspaper view'};
  }
  return null;
}
function renderPeriodVisual(selector,visual,story,eraLabel){
  const el=document.querySelector(selector);if(!el)return;
  el.replaceChildren();el.classList.add('period-visual-active');
  if(!visual){
    const fallback=document.createElement('div');fallback.className='period-visual-fallback';
    fallback.innerHTML=`<strong>${text(story?.publication)||eraLabel}</strong><span>${text(story?.issueDate)||'Period newspaper'}</span>`;
    el.appendChild(fallback);return;
  }
  const frame=document.createElement('div');frame.className='period-visual-frame';
  if(visual.type==='pdf'){
    const iframe=document.createElement('iframe');
    iframe.src=`${visual.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
    iframe.loading='lazy';iframe.title=visual.label;frame.appendChild(iframe);
  }else{
    const img=document.createElement('img');img.src=visual.url;img.alt=visual.label;img.loading='lazy';frame.appendChild(img);
  }
  const shade=document.createElement('div');shade.className='period-visual-shade';frame.appendChild(shade);el.appendChild(frame);
}

function renderThenNow(data){
  const section=document.getElementById('thenNowStrip');if(!section)return;
  const valid=Boolean(data&&data.show===true&&text(data.then?.title)&&text(data.now?.title)&&Array.isArray(data.sources)&&data.sources.some(s=>text(s?.url)));
  if(!valid){section.hidden=true;return;}
  setElText(document.getElementById('thenNowThenTitle'),data.then?.title);
  setElText(document.getElementById('thenNowThenText'),data.then?.text);
  setElText(document.getElementById('thenNowChangedTitle'),data.changed?.title||'What Changed');
  setElText(document.getElementById('thenNowChangedText'),data.changed?.text);
  setElText(document.getElementById('thenNowNowTitle'),data.now?.title);
  setElText(document.getElementById('thenNowNowText'),data.now?.text);
  const sources=document.getElementById('thenNowSources');
  if(sources){
    sources.replaceChildren();
    data.sources.filter(s=>text(s?.url)).slice(0,4).forEach((s,i)=>{
      if(i)sources.append(document.createTextNode(' • '));
      const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=s.label||'Source';sources.append(a);
    });
  }
  section.hidden=false;
}
function renderArchiveRecipe(recipe){
  const section=document.getElementById('archiveRecipe');if(!section)return;
  const valid=Boolean(recipe&&text(recipe.title)&&text(recipe.sourceUrl)&&text(recipe.originalText));
  if(!valid){section.hidden=true;return;}
  setElText(document.getElementById('recipeTitle'),recipe.title);
  setElText(document.getElementById('recipeSourceLine'),[recipe.publication,recipe.issueDate,recipe.location,recipe.community].filter(text).join(' • '));
  setElText(document.getElementById('recipeOriginal'),recipe.originalText);
  setElText(document.getElementById('recipeModern'),recipe.modernVersion);
  setElText(document.getElementById('recipeContext'),recipe.historicalContext);
  setElText(document.getElementById('recipeCommunity'),recipe.community?`Community: ${recipe.community}`:'');
  const safety=document.getElementById('recipeSafety');if(safety){safety.textContent=recipe.safetyNote||'';safety.hidden=!text(recipe.safetyNote);}
  const link=document.getElementById('recipeSourceLink');setSourceLink(link,recipe.sourceUrl,'View Original Source →');if(link)link.hidden=!text(recipe.sourceUrl);
  section.hidden=false;
}

(async function loadPublishedEditionIntoLockedDesign(){
  resetPublishedEditionDisplay();
  try{
    const response=await fetch(`/api/content/today?_=${Date.now()}`,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store'});
    if(!response.ok)return;
    const result=await response.json();
    const edition=result?.edition?.payload;
    if(!edition)return;
    const stories=edition.stories||{};
    const y200=stories.y200||null;
    const major=stories.y100?.major||null;
    const black=stories.y100?.black||null;
    const y75=stories.y75||null;

    if(major?.title)window.OnThisDay.setMajorHeadline(major.title);
    bindPaper(document.querySelector('.era-200 .paper'),y200,'View Original Source →');
    bindPaper(document.querySelector('.era-center .center-paper:not(.black)'),major,'View Original Source →');
    bindPaper(document.querySelector('.era-center .center-paper.black'),black,'View Black Press Source →');
    bindPaper(document.querySelector('.era-76 .paper'),y75,'View Original Source →');

    renderPeriodVisual('.era-200 .paper-illustration',periodVisualCandidate(edition,'y200'),y200,'200 Years Ago');
    renderPeriodVisual('.era-76 .paper-illustration',periodVisualCandidate(edition,'y75'),y75,'75 Years Ago');
    renderDynamicCommunityVoices(edition,major,black);
    renderThenNow(edition.thenNow);
    renderArchiveRecipe(edition.archiveRecipe);
  }catch(error){
    console.warn('Published edition unavailable; exact-date placeholders retained.',error);
  }
})();
