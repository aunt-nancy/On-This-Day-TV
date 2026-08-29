const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const today=new Date();
function fmt(d){return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
$$('[data-current-date]').forEach(el=>el.textContent=fmt(today));
$$('[data-year-offset]').forEach(el=>{const off=Number(el.dataset.yearOffset); el.textContent=today.getFullYear()-off});
const search=$('#archiveSearch'); if(search){search.addEventListener('input',e=>{const q=e.target.value.toLowerCase();$$('.archive-card').forEach(c=>c.hidden=!c.innerText.toLowerCase().includes(q));});}
const community=$('#communityFilter'); if(community){community.addEventListener('change',e=>{const v=e.target.value;$$('.archive-card').forEach(c=>c.hidden=v!=='all'&&!c.dataset.community.includes(v));});}
const discrepancyToggle=$('#discrepancyDemo'); if(discrepancyToggle){discrepancyToggle.addEventListener('click',()=>{const el=$('#discrepancyBox'); el.hidden=!el.hidden;});}
