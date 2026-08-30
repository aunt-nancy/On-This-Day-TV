
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


// Community Press ranking:
// African American / Black Press is always fixed in the center.
// All surrounding tiles are ordered by weighted population importance + headline relevance.
// Agents can update data-headline-weight daily without changing the layout.
(function(){
  const grid = document.getElementById('communityPriorityGrid');
  if(!grid) return;

  const black = document.getElementById('blackCenter');
  const cards = [...grid.querySelectorAll('.sortable-community')];

  cards.sort((a,b)=>{
    const score = el => {
      const population = Number(el.dataset.populationWeight || 0);
      const headline = Number(el.dataset.headlineWeight || 0);
      return (population * 0.55) + (headline * 0.45);
    };
    return score(b) - score(a);
  });

  // Desktop target:
  // row 1 = top ranked left, Black Press center, second ranked right.
  // remaining cards follow in descending weighted order.
  if(cards[0]) grid.insertBefore(cards[0], black);
  if(cards[1]) black.after(cards[1]);

  let anchor = cards[1] || black;
  cards.slice(2).forEach(card=>{
    anchor.after(card);
    anchor = card;
  });
})();


// The landing-page centerpiece is the day's major 100-year headline.
// Agents can populate this before publish without changing page structure.
window.OnThisDay = window.OnThisDay || {};
window.OnThisDay.setMajorHeadline = function(headline){
  document.querySelectorAll('[data-major-headline]').forEach(el=>{
    el.textContent = headline || "Today’s Leading Verified Headline";
  });
};


// Live agent-published edition binding. Static placeholders remain as a graceful fallback.
(async function loadAgentEdition(){
  try {
    const response = await fetch('/api/content/today', { headers: { Accept: 'application/json' } });
    const result = await response.json();
    const edition = result?.edition?.payload;
    if (!edition) return;
    const set = (selector, value) => { if (value) document.querySelectorAll(selector).forEach(el => el.textContent = value); };
    set('[data-major-headline]', edition.leadHeadline);
    const stories = edition.stories || {};
    set('[data-y200-headline]', stories.y200?.title);
    set('[data-y200-publication]', stories.y200?.publication);
    set('[data-y100-major-headline]', stories.y100?.major?.title);
    set('[data-y100-major-publication]', stories.y100?.major?.publication);
    set('[data-y100-black-headline]', stories.y100?.black?.title);
    set('[data-y100-black-publication]', stories.y100?.black?.publication);
    set('[data-y76-headline]', stories.y76?.title);
    set('[data-y76-publication]', stories.y76?.publication);
  } catch (error) {
    console.warn('Agent edition unavailable; using static fallback.', error);
  }
})();
