(function(){
  const FALLBACKS=[
    {id:'early-bank-1800',eraKey:'y200',visualType:'engraving',url:'https://cdn.loc.gov/service/pnp/cph/3b50000/3b52000/3b52000/3b52049r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2002718879/'},
    {id:'early-high-street-1800',eraKey:'y200',visualType:'engraving',url:'https://cdn.loc.gov/service/pnp/cph/3b50000/3b52000/3b52000/3b52042r.jpg',sourceUrl:'https://www.loc.gov/item/2002718872/'},
    {id:'washington-street-1924',eraKey:'y100',visualType:'photograph',url:'https://tile.loc.gov/storage-services/service/pnp/npcc/12400/12476v.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2016838745/'},
    {id:'new-orleans-street-1920s',eraKey:'y100',visualType:'photograph',url:'https://tile.loc.gov/storage-services/service/pnp/agc/7a02000/7a02900/7a02922v.jpg',sourceUrl:'https://www.loc.gov/item/2018705846/'},
    {id:'times-square-1952',eraKey:'y75',visualType:'photograph',url:'https://tile.loc.gov/storage-services/service/pnp/ppmsca/71200/71278v.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2021636503/'},
    {id:'new-york-street-1954',eraKey:'y75',visualType:'photograph',url:'https://tile.loc.gov/storage-services/service/pnp/ppmsca/69800/69835v.jpg',sourceUrl:'https://www.loc.gov/resource/ppmsca.69835/'},
    {id:'community-georgia-1900',eraKey:'community',visualType:'photograph',url:'https://tile.loc.gov/storage-services/service/pnp/ppmsca/08700/08770v.jpg',sourceUrl:'https://www.loc.gov/pictures/item/99472447/'},
    {id:'harlem-street-1943',eraKey:'community',visualType:'photograph',url:'https://tile.loc.gov/storage-services/service/pnp/fsa/8d28000/8d28500/8d28511v.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2017851517/'}
  ];

  const SLOT_ORDER=[
    {name:'--scene-y200',era:'y200'},
    {name:'--scene-y75',era:'y75'},
    {name:'--scene-head-left',era:'y100'},
    {name:'--scene-head-right',era:'y100'},
    {name:'--scene-community-left',era:'community'},
    {name:'--scene-community-right',era:'community'},
    {name:'--scene-then',era:null},
    {name:'--scene-changed',era:null},
    {name:'--scene-now',era:null},
    {name:'--scene-showcase-1',era:'y200'},
    {name:'--scene-showcase-2',era:'y100'},
    {name:'--scene-showcase-3',era:'y75'},
    {name:'--scene-showcase-4',era:'community'},
    {name:'--scene-recipe',era:'community'}
  ];

  function hash(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function current(name){return document.documentElement.style.getPropertyValue(name).trim();}
  function hasImage(value){return Boolean(value&&value!=='none'&&/url\(/i.test(value));}
  function extractUrl(value){const m=String(value||'').match(/url\(["']?([^"')]+)["']?\)/i);return m?.[1]||'';}
  function cssUrl(url){return `url("${String(url).replace(/"/g,'%22')}")`;}
  function validate(candidate){
    return new Promise(resolve=>{
      const img=new Image();let done=false;
      const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok?candidate:null);};
      const timer=setTimeout(()=>finish(false),5000);
      img.onload=()=>finish(img.naturalWidth>40&&img.naturalHeight>40);
      img.onerror=()=>finish(false);
      img.referrerPolicy='no-referrer';img.src=candidate.url;
    });
  }
  function rotated(list,seed){if(!list.length)return[];const n=seed%list.length;return [...list.slice(n),...list.slice(0,n)];}

  async function fill(){
    let editionDate='';
    try{
      const res=await fetch(`/api/content/today?sceneFallback=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(res.ok){const json=await res.json();editionDate=json?.edition?.edition_date||json?.edition?.payload?.editionDate||'';}
    }catch{}
    const seed=hash(editionDate||new Date().toISOString().slice(0,10));
    const checked=(await Promise.all(FALLBACKS.map(validate))).filter(Boolean);
    if(!checked.length)return;

    const used=new Set(SLOT_ORDER.map(s=>extractUrl(current(s.name))).filter(Boolean));
    let order=rotated(checked,seed);
    for(const slot of SLOT_ORDER){
      if(hasImage(current(slot.name)))continue;
      let candidates=order.filter(x=>!used.has(x.url)&&(slot.era?x.eraKey===slot.era:true));
      if(!candidates.length)candidates=order.filter(x=>!used.has(x.url));
      if(!candidates.length)break;
      const pick=candidates[0];
      document.documentElement.style.setProperty(slot.name,cssUrl(pick.url));
      used.add(pick.url);
      order=order.filter(x=>x.url!==pick.url);
    }
    document.documentElement.dataset.sceneFallbackCount=String(used.size);
  }

  const run=()=>setTimeout(fill,1500);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
