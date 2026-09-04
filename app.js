window.OnThisDay=window.OnThisDay||{};

(function(){
  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='homepage-enhancements.css?v=20260904g';
  document.head.appendChild(style);

  const SITE_TZ='America/Los_Angeles';
  function bindEditionDate(value='',servingFallback=false){
    const dated=Boolean(/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')));
    const target=dated?new Date(`${value}T12:00:00Z`):new Date();
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:dated?'UTC':SITE_TZ,year:'numeric',month:'long',day:'numeric'}).formatToParts(target);
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
    document.querySelectorAll('[data-edition-heading]').forEach(el=>{
      el.textContent=servingFallback?'Latest Published Edition':'Today in History';
    });
  }
  window.OnThisDay.setEditionDate=bindEditionDate;
  bindEditionDate();

  const search=document.getElementById('archiveSearch');
  const community=document.getElementById('communityFilter');
  function filterArchive(){
    const q=(search?.value||'').toLowerCase().trim();
    const c=community?.value||'all';
    document.querySelectorAll('.archive-card,.archive-row').forEach(card=>{
      const body=card.textContent.toLowerCase();
      card.hidden=!((!q||body.includes(q))&&(c==='all'||card.dataset.community===c));
    });
  }
  search?.addEventListener('input',filterArchive);
  community?.addEventListener('change',filterArchive);
})();

window.OnThisDay.setMajorHeadline=function(headline){
  document.querySelectorAll('[data-major-headline]').forEach(el=>{
    el.textContent=text(headline);
  });
};

function text(value){return String(value||'').trim();}
function storyDisplayTitle(story){return text(story?.englishTitle||story?.translatedTitle||story?.titleEnglish||story?.title);}
window.OnThisDay.storyDisplayTitle=storyDisplayTitle;
function setElText(el,value){if(el)el.textContent=text(value);}
function validStory(story){return Boolean(storyDisplayTitle(story)&&text(story?.sourceUrl));}
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
    selection:paper.querySelector('.paper-selection'),
    headline:paper.querySelector('.paper-headline'),
    copy:paper.querySelector('.paper-copy'),
    link:paper.querySelector('.source-link')
  };
}
function bindPaper(paper,story,linkLabel){
  if(!paper)return false;
  const p=paperParts(paper);
  if(!validStory(story)){
    paper.hidden=true;
    if(p.link){p.link.hidden=true;p.link.removeAttribute('href');}
    return false;
  }
  paper.hidden=false;
  setElText(p.name,story.publication||story.archive);
  setElText(p.date,story.issueDate);
  if(p.selection){
    p.selection.textContent=text(story.sourceRankLabel)?`Source rank • ${story.sourceRankLabel}`:'';
    p.selection.title=text(story.sourceSelectionNote);
    p.selection.hidden=!p.selection.textContent;
  }
  setElText(p.headline,storyDisplayTitle(story));
  setElText(p.copy,story.summary||story.evidenceNotes||story.verificationNotes);
  setSourceLink(p.link,story.sourceUrl,linkLabel);
  if(p.link)p.link.hidden=false;
  return true;
}
function resetPublishedEditionDisplay(){
  window.OnThisDay.setMajorHeadline('');
  const board=document.querySelector('.history-board');if(board)board.hidden=true;
  const more=document.querySelector('.more-headlines');if(more)more.hidden=true;
  const perspectives=document.getElementById('featuredPerspectives');if(perspectives)perspectives.hidden=true;
  const y200Context=document.getElementById('y200Context');if(y200Context)y200Context.hidden=true;
  const communityHome=document.getElementById('communityHome');if(communityHome)communityHome.hidden=true;
  const thenNow=document.getElementById('thenNowStrip');if(thenNow)thenNow.hidden=true;
  const recipe=document.getElementById('archiveRecipe');if(recipe)recipe.hidden=true;
}
function finishEditionDisplay(available){
  document.body.classList.remove('edition-loading');
  document.body.classList.toggle('edition-ready',available);
  document.body.classList.toggle('edition-unavailable',!available);
}

function normalizeCommunity(value,story={}){
  const s=`${text(value)} ${text(story.sourceDesk)} ${text(story.publication)}`.toLowerCase();
  if(/black|african|afro-american|afro american/.test(s))return'black';
  if(/latino|spanish|hispanic|mexican|el fronterizo/.test(s))return'latino';
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
function sourcePriorityScore(story){
  const reach=Number(story?.historicalReachScore||0);
  const founded=Number(story?.publicationFounded||0);
  const eraYear=Number(story?.eraYear||0);
  const longevity=Number.isFinite(founded)&&founded>0&&Number.isFinite(eraYear)&&eraYear>=founded?Math.min(eraYear-founded,200):0;
  return (Number.isFinite(reach)?reach:0)*10000+(text(story?.sourceSelectionNote)?500:0)+longevity+storyScore(story);
}
function chooseCommunityStory(candidates,leadEventKey,leadTopicKey,leadIssueDate){
  if(!candidates.length)return null;
  const ranked=rows=>[...rows].sort((a,b)=>sourcePriorityScore(b)-sourcePriorityScore(a));
  const same=ranked(candidates.filter(s=>
    leadEventKey&&text(s.eventKey)===leadEventKey&&s.comparisonType!=='same_topic'&&
    (!leadIssueDate||text(s.issueDate)===leadIssueDate||s.dateRelation==='exact_date')
  ));
  if(same.length)return{...same[0],comparisonType:'same_event',searchOutcome:'same_event_verified'};
  const topical=ranked(candidates.filter(s=>
    leadTopicKey&&s.comparisonType==='same_topic'&&text(s.topicKey)===leadTopicKey
  ));
  if(topical.length)return{...topical[0],comparisonType:'same_topic',searchOutcome:'same_topic_verified'};
  const audited=ranked(candidates.filter(s=>
    s.comparisonType==='community_lead'&&s.searchOutcome==='same_topic_not_verified'&&text(s.sourceSelectionNote)
  ));
  return audited[0]||null;
}
function communityModeLabel(story,key){
  if(story?.comparisonType==='same_event')return'Direct coverage of the 100-year headline';
  if(story?.comparisonType==='same_topic'){
    if(story.dateRelation==='previous_daily_issue')return'Same topic • previous daily issue';
    if(story.dateRelation==='adjacent_daily_issue')return'Same topic • adjacent daily issue';
    if(story.dateRelation==='nearest_weekly_issue')return'Same topic • nearest weekly issue';
    return'Same topic • exact issue';
  }
  if(story?.searchOutcome==='same_topic_not_verified'){
    const timing=story.dateRelation==='nearest_weekly_issue'?' • nearest weekly issue':story.dateRelation==='exact_date'?' • exact issue':'';
    return `${key==='black'?'Black press':'Community press'} source audit${timing}`;
  }
  return'Community press source audit';
}
function communitySelectionLabel(story){
  const rank=text(story?.sourceRankLabel);
  if(rank)return `Source rank • ${rank}`;
  const note=text(story?.sourceSelectionNote);
  return note?`Selection note • ${note}`:'';
}
function updateCommunityCard(card,story,key,isBlack=false){
  if(!card)return;
  const h3=card.querySelector('h3');
  const p=card.querySelector('p');
  const link=card.querySelector('a');
  let mode=card.querySelector('.community-mode');
  let publication=card.querySelector('.community-publication');
  let selection=card.querySelector('.community-selection-note');
  if(!mode&&card.querySelector('div')){
    mode=document.createElement('div');mode.className='community-mode';card.querySelector('div').prepend(mode);
  }
  if(!publication&&card.querySelector('div')){
    publication=document.createElement('span');publication.className='community-publication';card.querySelector('div').append(publication);
  }
  if(!selection&&card.querySelector('div')){
    selection=document.createElement('span');selection.className='community-selection-note';card.querySelector('div').append(selection);
  }
  if(!story){
    card.hidden=true;
    return;
  }
  card.hidden=false;
  card.dataset.communityMode=story.comparisonType||'community_lead';
  if(h3&&!isBlack)h3.textContent=communityLabel(story,key);
  if(mode)mode.textContent=communityModeLabel(story,key);
  if(p){p.className='';p.textContent=`${storyDisplayTitle(story)}${text(story.summary)?` — ${story.summary}`:''}`;}
  if(publication)publication.textContent=[story.publication,story.issueDate].filter(text).join(' • ');
  if(selection){
    selection.textContent=communitySelectionLabel(story);
    selection.title=text(story.sourceSelectionNote);
    selection.hidden=!selection.textContent;
  }
  setSourceLink(link,story.sourceUrl,'View Original Community Source →');
  if(link)link.hidden=false;
}
function collectCommunityVoices(edition,major,black){
  const y100Year=String(edition?.years?.y100||major?.eraYear||'');
  const pool=[black,...(Array.isArray(edition?.stories?.y100?.secondary)?edition.stories.y100.secondary:[]),...(Array.isArray(edition?.communityTiles)?edition.communityTiles:[])].filter(Boolean).filter(story=>{
    const era=text(story.eraKey);
    const issue=text(story.issueDate);
    return (era==='y100'||(!era&&y100Year&&issue.startsWith(y100Year)))&&storyDisplayTitle(story)&&text(story.sourceUrl);
  });
  const leadEventKey=text(edition?.leadEventKey||major?.eventKey);
  const leadTopicKey=text(major?.topicKey||edition?.leadTopicKey);
  const leadIssueDate=text(major?.issueDate);
  const grouped=new Map();
  for(const story of pool){
    const key=normalizeCommunity(story.community||story.communityKey||story.group,story);
    if(!key)continue;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(story);
  }
  const voices=[];
  for(const [key,candidates] of grouped){
    const story=chooseCommunityStory(candidates,leadEventKey,leadTopicKey,leadIssueDate);
    if(story)voices.push({key,story});
  }
  voices.sort((a,b)=>{
    const priority=voice=>(voice.story.comparisonType==='same_event'?300000:voice.story.comparisonType==='same_topic'?200000:100000)+sourcePriorityScore(voice.story);
    return priority(b)-priority(a);
  });
  return voices;
}
function featuredVoiceOrder(voices){
  const black=voices.find(voice=>voice.key==='black');
  const selected=voices.filter(voice=>voice.key!=='black').slice(0,black?2:3);
  if(black)selected.splice(Math.min(1,selected.length),0,black);
  return selected.slice(0,3);
}
function renderFeaturedVoices(voices){
  const section=document.getElementById('featuredPerspectives');
  const grid=document.getElementById('featuredVoices');
  if(!section||!grid)return;
  grid.replaceChildren();
  featuredVoiceOrder(voices).forEach(({key,story})=>{
    const card=document.createElement('article');card.className='featured-voice';card.dataset.community=key;card.dataset.communityMode=story.comparisonType||'community_lead';
    const mode=document.createElement('div');mode.className='featured-voice-mode';mode.textContent=communityModeLabel(story,key);
    const label=document.createElement('h4');label.textContent=communityLabel(story,key);
    const headline=document.createElement('p');headline.textContent=storyDisplayTitle(story);
    const source=document.createElement('span');source.className='featured-voice-source';source.textContent=[story.publication,story.issueDate].filter(text).join(' • ');
    const selection=document.createElement('span');selection.className='featured-voice-selection';selection.textContent=communitySelectionLabel(story);selection.title=text(story.sourceSelectionNote);selection.hidden=!selection.textContent;
    const link=document.createElement('a');setSourceLink(link,story.sourceUrl,'Read this voice →');
    card.append(mode,label,headline,source,selection,link);grid.appendChild(card);
  });
  section.hidden=!grid.children.length;
}
function renderDynamicCommunityVoices(edition,major,black){
  const grid=document.getElementById('communityPriorityGrid');
  if(!grid)return;
  const blackCard=document.getElementById('blackCenter');
  [...grid.querySelectorAll('.community-card:not(#blackCenter)')].forEach(card=>card.remove());
  const voices=collectCommunityVoices(edition,major,black);
  const home=document.getElementById('communityHome');if(home)home.hidden=!voices.length;
  const blackVoice=voices.find(voice=>voice.key==='black');
  updateCommunityCard(blackCard,blackVoice?.story||null,'black',true);

  voices.filter(voice=>voice.key!=='black').slice(0,8).forEach(({key,story})=>{
    const card=document.createElement('div');
    card.className='community-card dynamic-community';
    card.dataset.community=key;
    card.innerHTML='<div><div class="community-mode"></div><h3></h3><p></p><span class="community-publication"></span><span class="community-selection-note"></span></div><a href="#">View Original Community Source →</a>';
    updateCommunityCard(card,story,key,false);
    grid.appendChild(card);
  });

  if(blackCard&&blackCard.parentElement===grid)grid.prepend(blackCard);
  renderFeaturedVoices(voices);
  const intro=document.querySelector('.community-home .section-heading p');
  if(intro)intro.textContent='Each edition begins with a major daily selected by documented historical circulation and reach. It then searches the communities closest to that headline and ranks representative minority papers by reach and longevity: direct coverage first, same-topic reporting second, and a clearly labeled source audit only when no topical item was verified.';
}

function renderY200Context(note){
  const section=document.getElementById('y200Context');if(!section)return;
  const valid=Boolean(note&&text(note.label)&&text(note.text)&&text(note.sourceUrl));
  if(!valid){section.hidden=true;return;}
  setElText(document.getElementById('y200ContextLabel'),note.label);
  setElText(document.getElementById('y200ContextText'),note.text);
  const link=document.getElementById('y200ContextLink');setSourceLink(link,note.sourceUrl,note.sourceLabel||'Examine the source →');
  section.hidden=false;
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
  const compact=value=>text(value).replace(/[ \t]+\n/g,'\n').replace(/\n\s*\n+/g,'\n');
  setElText(document.getElementById('recipeOriginal'),compact(recipe.originalText));
  setElText(document.getElementById('recipeModern'),compact(recipe.modernVersion));
  setElText(document.getElementById('recipeContext'),recipe.historicalContext);
  setElText(document.getElementById('recipeCommunity'),recipe.community?`Community: ${recipe.community}`:'');
  const safety=document.getElementById('recipeSafety');if(safety){safety.textContent=recipe.safetyNote||'';safety.hidden=!text(recipe.safetyNote);}
  const link=document.getElementById('recipeSourceLink');setSourceLink(link,recipe.sourceUrl,'View Original Source →');if(link)link.hidden=!text(recipe.sourceUrl);
  section.hidden=false;
}

(async function loadPublishedEditionIntoLockedDesign(){
  resetPublishedEditionDisplay();
  let available=false;
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
    const core=[y200,major,y75].filter(validStory);
    if(core.length!==3)return;
    available=true;

    window.OnThisDay.setEditionDate(edition.editionDate||result?.edition?.edition_date||'',Boolean(result?.servingFallback));
    const board=document.querySelector('.history-board');if(board)board.hidden=false;
    document.querySelectorAll('.era-box').forEach(panel=>panel.hidden=false);

    if(storyDisplayTitle(major))window.OnThisDay.setMajorHeadline(storyDisplayTitle(major));
    bindPaper(document.querySelector('.era-200 .paper'),y200,'View Original Source →');
    bindPaper(document.querySelector('.era-center .center-paper'),major,'View Original Source →');
    bindPaper(document.querySelector('.era-76 .paper'),y75,'View Original Source →');
    renderY200Context(edition.voicesBeyondNewsprint?.y200);
    const secondary=Array.isArray(stories.y100?.secondary)?stories.y100.secondary.filter(validStory):[];
    const more=document.querySelector('.more-headlines');if(more)more.hidden=!secondary.length;

    renderDynamicCommunityVoices(edition,major,black);
    renderThenNow(edition.thenNow);
    renderArchiveRecipe(edition.archiveRecipe);
  }catch(error){
    console.warn('Published edition request failed.',error);
  }finally{
    finishEditionDisplay(available);
  }
})();
