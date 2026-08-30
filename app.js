
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
