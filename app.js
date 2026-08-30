
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
