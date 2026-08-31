(function(){
  const now = new Date();
  const month = new Intl.DateTimeFormat('en-US',{month:'long'}).format(now);
  const fullDate = `${month} ${now.getDate()}, ${now.getFullYear()}`;
  const monthDay = `${month} ${now.getDate()}`;

  document.querySelectorAll('[data-current-date]').forEach(el => el.textContent = fullDate);
  document.querySelectorAll('[data-current-monthday]').forEach(el => el.textContent = monthDay);
  document.querySelectorAll('[data-current-year]').forEach(el => el.textContent = String(now.getFullYear()));
  document.querySelectorAll('[data-year-offset]').forEach(el => {
    const offset = parseInt(el.getAttribute('data-year-offset'),10) || 0;
    el.textContent = String(now.getFullYear() - offset);
  });

  const search = document.getElementById('archiveSearch');
  const community = document.getElementById('communityFilter');
  function filterArchive(){
    const q=(search?.value||'').toLowerCase().trim();
    const c=community?.value||'all';
    document.querySelectorAll('.archive-card').forEach(card=>{
      const text=card.textContent.toLowerCase();
      const matchText=!q||text.includes(q);
      const matchCommunity=c==='all'||card.dataset.community===c;
      card.style.display=(matchText&&matchCommunity)?'block':'none';
    });
  }
  search?.addEventListener('input',filterArchive);
  community?.addEventListener('change',filterArchive);
})();

function rankLockedCommunityTiles(){
  const grid = document.getElementById('communityPriorityGrid');
  if(!grid) return;

  const black = document.getElementById('blackCenter');
  const cards = [...grid.querySelectorAll('.sortable-community')];
  const score = el => {
    const population = Number(el.dataset.populationWeight || 0);
    const headline = Number(el.dataset.headlineWeight || 0);
    return (population * 0.55) + (headline * 0.45);
  };

  cards.sort((a,b)=>score(b)-score(a));
  if(cards[0] && black) grid.insertBefore(cards[0], black);
  if(cards[1] && black) black.after(cards[1]);

  let anchor = cards[1] || black;
  cards.slice(2).forEach(card=>{
    if(anchor){
      anchor.after(card);
      anchor = card;
    }
  });
}
rankLockedCommunityTiles();

window.OnThisDay = window.OnThisDay || {};
window.OnThisDay.setMajorHeadline = function(headline){
  document.querySelectorAll('[data-major-headline]').forEach(el=>{
    el.textContent = headline || "Today’s Leading Verified Headline";
  });
};

function text(value){
  return String(value || '').trim();
}
function setElText(el,value){
  if(el && text(value)) el.textContent = text(value);
}
function setSourceLink(el,url,label){
  if(!el || !text(url)) return;
  el.href = url;
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
  if(label) el.textContent = label;
}
function paperParts(paper){
  if(!paper) return {};
  return {
    name: paper.querySelector('.paper-name'),
    date: paper.querySelector('.paper-date'),
    headline: paper.querySelector('.paper-headline'),
    copy: paper.querySelector('.paper-copy'),
    link: paper.querySelector('.source-link')
  };
}
function bindPaper(paper,story,linkLabel){
  if(!paper) return;
  const p = paperParts(paper);

  if(!story || !text(story.title) || !text(story.sourceUrl)){
    if(p.headline) p.headline.textContent='Headline pending verification';
    if(p.link) p.link.hidden=true;
    return;
  }

  setElText(p.name, story.publication || story.archive);
  setElText(p.date, story.issueDate);
  setElText(p.headline, story.title);
  setElText(p.copy, story.summary || story.evidenceNotes);
  setSourceLink(p.link, story.sourceUrl, linkLabel);
  if(p.link) p.link.hidden=false;
}
function normalizeCommunity(value){
  const s = text(value).toLowerCase();
  if(/black|african/.test(s)) return 'black';
  if(/latino|spanish|hispanic/.test(s)) return 'latino';
  if(/german/.test(s)) return 'german';
  if(/british|anglo/.test(s)) return 'british';
  if(/chinese/.test(s)) return 'chinese';
  if(/japanese/.test(s)) return 'japanese';
  if(/irish/.test(s)) return 'irish';
  if(/italian/.test(s)) return 'italian';
  if(/jewish|yiddish/.test(s)) return 'jewish';
  if(/indigenous|native|tribal/.test(s)) return 'indigenous';
  if(/caribbean|filipino|south asian|armenian|greek|polish/.test(s)) return 'more';
  return '';
}


function applyGeneratedIllustration(selector, illustration){
  const el = document.querySelector(selector);
  if(!el || !illustration?.url) return;
  el.style.backgroundImage = `url("${illustration.url}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
  el.setAttribute('role','img');
  el.setAttribute('aria-label', illustration.label || 'Editorial illustration');
  el.title = illustration.label || 'Editorial illustration';
  el.dataset.generatedIllustration = 'true';
}


function renderThenNow(data){
  const section=document.getElementById('thenNowStrip');
  if(!section) return;

  const valid=Boolean(
    data &&
    data.show===true &&
    text(data.then?.title) &&
    text(data.now?.title) &&
    Array.isArray(data.sources) &&
    data.sources.some(s=>text(s?.url))
  );

  if(!valid){
    section.hidden=true;
    return;
  }

  setElText(document.getElementById('thenNowThenTitle'),data.then?.title);
  setElText(document.getElementById('thenNowThenText'),data.then?.text);
  setElText(document.getElementById('thenNowChangedTitle'),data.changed?.title||'What changed');
  setElText(document.getElementById('thenNowChangedText'),data.changed?.text);
  setElText(document.getElementById('thenNowNowTitle'),data.now?.title);
  setElText(document.getElementById('thenNowNowText'),data.now?.text);

  const sources=document.getElementById('thenNowSources');
  if(sources){
    sources.replaceChildren();
    data.sources.filter(s=>text(s?.url)).slice(0,4).forEach((s,i)=>{
      if(i) sources.append(document.createTextNode(' • '));
      const a=document.createElement('a');
      a.href=s.url;
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.textContent=s.label||'Source';
      sources.append(a);
    });
  }
  section.hidden=false;
}

function renderArchiveRecipe(recipe){
  const section=document.getElementById('archiveRecipe');
  if(!section) return;

  const valid=Boolean(
    recipe &&
    text(recipe.title) &&
    text(recipe.sourceUrl) &&
    text(recipe.originalText)
  );

  if(!valid){
    section.hidden=true;
    return;
  }

  setElText(document.getElementById('recipeTitle'),recipe.title);
  setElText(
    document.getElementById('recipeSourceLine'),
    [recipe.publication,recipe.issueDate,recipe.location,recipe.community].filter(text).join(' • ')
  );
  setElText(document.getElementById('recipeOriginal'),recipe.originalText);
  setElText(document.getElementById('recipeModern'),recipe.modernVersion);
  setElText(document.getElementById('recipeContext'),recipe.historicalContext);
  setElText(document.getElementById('recipeCommunity'),recipe.community ? `Community: ${recipe.community}` : '');

  const safety=document.getElementById('recipeSafety');
  if(safety){
    safety.textContent=recipe.safetyNote||'';
    safety.hidden=!text(recipe.safetyNote);
  }

  const link=document.getElementById('recipeSourceLink');
  setSourceLink(link,recipe.sourceUrl,'View Original Source →');
  if(link) link.hidden=!text(recipe.sourceUrl);

  section.hidden=false;
}

(async function loadPublishedEditionIntoLockedDesign(){
  try{
    const response = await fetch('/api/content/today',{
      headers:{Accept:'application/json'},
      cache:'no-store'
    });
    if(!response.ok) return;

    const result = await response.json();
    const edition = result?.edition?.payload;
    if(!edition) return;

    const stories = edition.stories || {};
    const y200 = stories.y200 || null;
    const major = stories.y100?.major || null;
    const black = stories.y100?.black || null;
    const y76 = stories.y76 || null;

    // LOCKED EDITORIAL ORDER:
    // American headline is the anchor. Community voices then show what those
    // newspapers were saying. No synthesized combined headline is created.
    if(major?.title){
      window.OnThisDay.setMajorHeadline(major.title);
    }

    // Bind the exact existing three-era cards. No DOM is added or moved.
    bindPaper(
      document.querySelector('.era-200 .paper'),
      y200,
      'View Original Source →'
    );
    bindPaper(
      document.querySelector('.era-center .center-paper:not(.black)'),
      major,
      'View Original Source →'
    );
    bindPaper(
      document.querySelector('.era-center .center-paper.black'),
      black,
      'View Black Press Source →'
    );
    bindPaper(
      document.querySelector('.era-76 .paper'),
      y76,
      'View Original Source →'
    );

    // Dedicated Illustrator Agent fills ONLY the two existing side-era
    // illustration slots. The center comparison and masthead are untouched.
    applyGeneratedIllustration(
      '.era-200 .paper-illustration',
      edition?.illustrations?.y200
    );
    applyGeneratedIllustration(
      '.era-76 .paper-illustration',
      edition?.illustrations?.y76
    );

    // The pre-approved Community Press Voices cards remain exactly where and
    // how they were designed. Verified stories replace explanatory copy only.
    const pool = [
      ...(black ? [black] : []),
      ...(Array.isArray(stories.y100?.secondary) ? stories.y100.secondary : []),
      ...(Array.isArray(edition.communityTiles) ? edition.communityTiles : [])
    ].filter(Boolean);

    const leadEventKey = text(edition.leadEventKey || major?.eventKey);

    const candidatesByCommunity = new Map();
    for(const story of pool){
      const key = normalizeCommunity(
        story.community || story.communityKey || story.label || story.group
      );
      if(!key || !text(story.title)) continue;
      if(!candidatesByCommunity.has(key)) candidatesByCommunity.set(key,[]);
      candidatesByCommunity.get(key).push(story);
    }

    function chooseCommunityStory(key){
      const candidates = candidatesByCommunity.get(key) || [];
      if(!candidates.length) return null;

      // Editorial priority #1: a verified community lens on the SAME national event.
      const sameEvent = candidates
        .filter(story => leadEventKey && text(story.eventKey) === leadEventKey)
        .sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0));

      if(sameEvent.length){
        return {...sameEvent[0], comparisonType:'same_event'};
      }

      // Editorial priority #2: that community's strongest verified headline
      // for the same historical date. It is explicitly NOT presented as a
      // point of view on the national lead.
      const fallback = [...candidates]
        .sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0))[0];

      return fallback ? {...fallback, comparisonType:'community_lead'} : null;
    }

    for(const key of ['black','latino','german','british','chinese','japanese','irish','italian','jewish','indigenous','more']){
      const story = chooseCommunityStory(key);
      if(!story) continue;

      const card = key === 'black'
        ? document.getElementById('blackCenter')
        : document.querySelector(`.community-card[data-community="${key}"]`);
      if(!card) continue;

      card.dataset.comparisonType = story.comparisonType;

      const p = card.querySelector('p');
      if(p){
        const pub = text(story.publication);
        const summary = text(story.summary);
        const prefix = story.comparisonType === 'same_event'
          ? 'Same-event coverage: '
          : 'Leading community headline: ';
        p.textContent = `${prefix}${pub ? pub + ': ' : ''}${story.title}${summary ? ' — ' + summary : ''}`;
      }

      const link = card.querySelector('a');
      setSourceLink(
        link,
        story.sourceUrl,
        story.comparisonType === 'same_event'
          ? 'View Original Source →'
          : 'View Leading Headline Source →'
      );

      if(key === 'black'){
        const mini = card.querySelector('.black-compare-mini');
        if(mini){
          mini.style.display = story.comparisonType === 'same_event' ? '' : 'none';
        }
      }else{
        // Same-event coverage gets the highest relevance boost. A fallback
        // headline still raises the tile above a completely static card.
        card.dataset.headlineWeight = story.comparisonType === 'same_event' ? '100' : '70';
      }
    }

    rankLockedCommunityTiles();
    renderThenNow(edition.thenNow);
    renderArchiveRecipe(edition.archiveRecipe);
  }catch(error){
    console.warn('Published edition unavailable; locked static design retained.',error);
  }
})();