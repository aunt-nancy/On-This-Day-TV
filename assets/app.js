(function(){
  const now=new Date();
  const month=new Intl.DateTimeFormat('en-US',{month:'long'}).format(now);
  const dateLabel=`${month} ${now.getDate()}, ${now.getFullYear()}`;
  document.querySelectorAll('[data-current-date]').forEach(el=>{el.textContent=dateLabel;});
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

  const discrepancyBtn=document.getElementById('discrepancyDemo');
  const discrepancyBox=document.getElementById('discrepancyBox');
  discrepancyBtn?.addEventListener('click',()=>{
    if(!discrepancyBox)return;
    const isHidden=discrepancyBox.hasAttribute('hidden');
    if(isHidden){discrepancyBox.removeAttribute('hidden');discrepancyBtn.textContent='Hide discrepancy example';}
    else{discrepancyBox.setAttribute('hidden','');discrepancyBtn.textContent='Show discrepancy example';}
  });
})();
