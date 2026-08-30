(function(){
  const now = new Date();

  function formatMonthDay(value){
    const d = value ? new Date(`${value}T12:00:00`) : now;
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric'}).format(d);
  }

  function formatIssueDate(value){
    if(!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if(Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-US',{
      month:'long', day:'numeric', year:'numeric'
    }).format(d);
  }

  function setText(selector,value){
    document.querySelectorAll(selector).forEach(el=>{
      el.textContent = value || '';
    });
  }

  function textExists(value){
    return Boolean(String(value || '').trim());
  }

  function headlineClass(el,text){
    if(!el) return;
    el.classList.remove('headline-long','headline-xlong');
    const length = String(text || '').trim().length;
    if(length > 105) el.classList.add('headline-xlong');
    else if(length > 72) el.classList.add('headline-long');
  }

  function sourceMeta(story){
    const parts = [];
    if(story?.city) parts.push(story.city);
    if(story?.archive) parts.push(story.archive);
    if(story?.page) parts.push(`Page ${story.page}`);
    return parts.join(' • ');
  }

  function bindStory(prefix,story,cardKey){
    const card = document.querySelector(`[data-story-card="${cardKey}"]`);
    if(!card) return false;

    const valid = Boolean(
      story &&
      textExists(story.title) &&
      (textExists(story.publication) || textExists(story.sourceUrl))
    );

    if(!valid){
      card.hidden = true;
      return false;
    }

    card.hidden = false;

    setText(`[data-${prefix}-publication]`, story.publication || 'Historical Newspaper');
    setText(`[data-${prefix}-date]`, formatIssueDate(story.issueDate));
    setText(`[data-${prefix}-headline]`, story.title);
    setText(`[data-${prefix}-summary]`, story.summary || '');

    const headline = document.querySelector(`[data-${prefix}-headline]`);
    headlineClass(headline, story.title);

    const meta = document.querySelector(`[data-${prefix}-source-meta]`);
    const metaText = sourceMeta(story);
    if(meta){
      meta.textContent = metaText;
      meta.hidden = !metaText;
    }

    const link = document.querySelector(`[data-${prefix}-source-link]`);
    if(link){
      if(textExists(story.sourceUrl)){
        link.href = story.sourceUrl;
        link.hidden = false;
      }else{
        link.hidden = true;
        link.removeAttribute('href');
      }
    }
    return true;
  }

  function renderSecondary(stories){
    const section = document.getElementById('verifiedSecondary');
    const list = document.getElementById('secondaryHeadlineList');
    if(!section || !list) return;

    const valid = (Array.isArray(stories) ? stories : [])
      .filter(story => story && textExists(story.title))
      .slice(0,4);

    if(!valid.length){
      section.hidden = true;
      list.replaceChildren();
      return;
    }

    const frag = document.createDocumentFragment();
    valid.forEach(story=>{
      const item = document.createElement(story.sourceUrl ? 'a' : 'div');
      item.className = 'secondary-item';
      if(story.sourceUrl){
        item.href = story.sourceUrl;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
      }

      const pub = document.createElement('span');
      pub.className = 'secondary-publication';
      pub.textContent = story.publication || 'Verified source';

      const head = document.createElement('strong');
      head.textContent = story.title;

      item.append(pub,head);
      frag.appendChild(item);
    });

    list.replaceChildren(frag);
    section.hidden = false;
  }

  function applyLayout(leftAvailable,rightAvailable,majorAvailable,blackAvailable){
    const layout = document.getElementById('editorialEraLayout');
    const compare = document.getElementById('featuredComparison');

    if(layout){
      layout.classList.toggle('missing-left',!leftAvailable);
      layout.classList.toggle('missing-right',!rightAvailable);
      layout.classList.toggle('center-only',!leftAvailable && !rightAvailable);
    }

    if(compare){
      compare.classList.toggle('single-comparison',Boolean(majorAvailable) !== Boolean(blackAvailable));
      compare.hidden = !majorAvailable && !blackAvailable;
    }
  }

  async function loadAgentEdition(){
    const board = document.getElementById('editorialBoard');

    try{
      const response = await fetch('/api/content/today', {
        headers:{Accept:'application/json'},
        cache:'no-store'
      });
      if(!response.ok) throw new Error(`Content endpoint returned ${response.status}`);

      const result = await response.json();
      const edition = result?.edition?.payload;
      if(!edition){
        if(board) board.hidden = true;
        return;
      }

      const editionDate = edition.editionDate || result?.edition?.edition_date || '';
      setText('[data-edition-monthday]', formatMonthDay(editionDate));

      const years = edition.years || {};
      setText('[data-edition-year="y200"]', years.y200 || '');
      setText('[data-edition-year="y100"]', years.y100 || '');
      setText('[data-edition-year="y76"]', years.y76 || '');

      if(years.y76 && editionDate){
        const currentYear = new Date(`${editionDate}T12:00:00`).getFullYear();
        const ago = currentYear - Number(years.y76);
        if(Number.isFinite(ago)) setText('[data-y76-ago-label]', `${ago} Years Ago`);
      }

      const stories = edition.stories || {};
      const left = bindStory('y200',stories.y200,'y200');
      const major = bindStory('y100-major',stories.y100?.major,'y100-major');
      const black = bindStory('y100-black',stories.y100?.black,'y100-black');
      const right = bindStory('y76',stories.y76,'y76');

      renderSecondary(stories.y100?.secondary);
      applyLayout(left,right,major,black);

      // If nothing publishable is present, hide the entire historical board
      // rather than showing generic placeholder copy.
      if(board){
        board.hidden = !(left || major || black || right);
        board.classList.add('is-ready');
      }
    }catch(error){
      console.warn('Published edition unavailable.',error);
      if(board) board.hidden = true;
    }
  }

  // Existing static page utilities.
  const fullDate = new Intl.DateTimeFormat('en-US',{
    month:'long',day:'numeric',year:'numeric'
  }).format(now);
  const monthDay = new Intl.DateTimeFormat('en-US',{
    month:'long',day:'numeric'
  }).format(now);

  document.querySelectorAll('[data-current-date]').forEach(el=>el.textContent=fullDate);
  document.querySelectorAll('[data-current-monthday]').forEach(el=>el.textContent=monthDay);
  document.querySelectorAll('[data-current-year]').forEach(el=>el.textContent=String(now.getFullYear()));
  document.querySelectorAll('[data-year-offset]').forEach(el=>{
    const offset=parseInt(el.getAttribute('data-year-offset'),10)||0;
    el.textContent=String(now.getFullYear()-offset);
  });

  const search=document.getElementById('archiveSearch');
  const community=document.getElementById('communityFilter');
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

  // Preserve the existing community priority behavior.
  const grid=document.getElementById('communityPriorityGrid');
  if(grid){
    const blackCenter=document.getElementById('blackCenter');
    const cards=[...grid.querySelectorAll('.sortable-community')];
    const score=el=>{
      const population=Number(el.dataset.populationWeight||0);
      const headline=Number(el.dataset.headlineWeight||0);
      return (population*.55)+(headline*.45);
    };
    cards.sort((a,b)=>score(b)-score(a));
    if(cards[0]&&blackCenter) grid.insertBefore(cards[0],blackCenter);
    if(cards[1]&&blackCenter) blackCenter.after(cards[1]);
    let anchor=cards[1]||blackCenter;
    cards.slice(2).forEach(card=>{
      if(anchor){anchor.after(card);anchor=card;}
    });
  }

  loadAgentEdition();
})();