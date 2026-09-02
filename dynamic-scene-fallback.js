(function(){
  // Daily fallback pool. edition.visuals and illustrator placements always win.
  // Every fallback below is a digitized Library of Congress image with a record
  // stating no known restrictions on publication.
  const FALLBACKS=[
    {id:'lee-engraving-1820s',eraKey:'y200',visualType:'engraving',url:'https://cdn.loc.gov/service/pnp/ppmsca/31100/31152r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2010631739/'},
    {id:'pioneer-life-1820',eraKey:'y200',visualType:'engraving',url:'https://cdn.loc.gov/service/pnp/cph/3b10000/3b16000/3b16400/3b16468r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2004671661/'},

    {id:'washington-street-1918-1920',eraKey:'y100',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/npcc/00300/00398r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2016819656/'},
    {id:'white-house-crowd-1920',eraKey:'y100',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/npcc/29500/29585r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2016852329/'},
    {id:'wall-street-curb-brokers-1920',eraKey:'y100',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/cph/3b40000/3b40000/3b40200/3b40299r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/92519195/'},
    {id:'new-orleans-public-life-1920s',eraKey:'y100',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/agc/7a03000/7a03300/7a03301r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2018705978/'},

    {id:'los-angeles-downtown-1942',eraKey:'y75',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/fsa/8d28000/8d28100/8d28149r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2017850406/'},
    {id:'los-angeles-street-1942',eraKey:'y75',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/fsa/8d28000/8d28100/8d28141r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2017850397/'},
    {id:'washington-street-1935-1942',eraKey:'y75',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/fsa/8b31000/8b31500/8b31567r.jpg',sourceUrl:'https://www.loc.gov/pictures/item/2017769454/'},
    {id:'black-public-life-new-york-1942',eraKey:'community',visualType:'photograph',url:'https://cdn.loc.gov/service/pnp/fsa/8d21000/8d21600/8d21601r.jpg',sourceUrl:'https://www.loc.gov/pictures/collection/fsa/item/2017834567/'}
  ];

  // Most important dead-space zones first. Secondary showcase slots fill only
  // after the page-framing areas have distinct images.
  const SLOT_ORDER=[
    {name:'--scene-y200',era:'y200'},
    {name:'--scene-head-left',era:'y100'},
    {name:'--scene-head-right',era:'y100'},
    {name:'--scene-y75',era:'y75'},
    {name:'--scene-community-left',era:'community'},
    {name:'--scene-community-right',era:'y100'},
    {name:'--scene-showcase-1',era:'y200'},
    {name:'--scene-showcase-2',era:'y100'},
    {name:'--scene-showcase-3',era:'y75'},
    {name:'--scene-showcase-4',era:'y75'},
    {name:'--scene-then',era:null},
    {name:'--scene-changed',era:null},
    {name:'--scene-now',era:null},
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
      const timer=setTimeout(()=>finish(false),6500);
      img.onload=()=>finish(img.naturalWidth>80&&img.naturalHeight>80);
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
    if(!checked.length){document.documentElement.dataset.sceneFallbackStatus='no-valid-fallbacks';return;}

    const used=new Set(SLOT_ORDER.map(s=>extractUrl(current(s.name))).filter(Boolean));
    let order=rotated(checked,seed);
    const applied=[];
    for(const slot of SLOT_ORDER){
      if(hasImage(current(slot.name)))continue;
      let candidates=order.filter(x=>!used.has(x.url)&&(slot.era?x.eraKey===slot.era:true));
      if(!candidates.length)candidates=order.filter(x=>!used.has(x.url));
      if(!candidates.length)break;
      const pick=candidates[0];
      document.documentElement.style.setProperty(slot.name,cssUrl(pick.url));
      used.add(pick.url);
      applied.push({slot:slot.name,id:pick.id,sourceUrl:pick.sourceUrl});
      order=order.filter(x=>x.url!==pick.url);
    }
    window.OnThisDay=window.OnThisDay||{};
    window.OnThisDay.sceneFallbackAttribution=applied;
    document.documentElement.dataset.sceneFallbackCount=String(applied.length);
    document.documentElement.dataset.sceneFallbackStatus=applied.length?'applied':'not-needed';
  }

  const run=()=>setTimeout(fill,1650);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
