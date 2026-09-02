(function(){
  // Dynamic fallback only: today's edition.visuals / illustrator placements always win.
  // These Library of Congress images are used only when a decorative scene slot is empty.
  const scenes={
    y200:[
      {url:'https://cdn.loc.gov/service/pnp/ppmsca/31100/31152r.jpg',source:'https://www.loc.gov/pictures/item/2010631739/',label:'Richard Henry Lee engraving, 1820s'},
      {url:'https://cdn.loc.gov/service/pnp/cph/3b10000/3b16000/3b16400/3b16468r.jpg',source:'https://www.loc.gov/pictures/item/2004671661/',label:'Pioneer life in Missouri in 1820'}
    ],
    y100:[
      {url:'https://cdn.loc.gov/service/pnp/npcc/00300/00398r.jpg',source:'https://www.loc.gov/pictures/item/2016819656/',label:'Washington street scene, 1918–1920'},
      {url:'https://cdn.loc.gov/service/pnp/npcc/29500/29585r.jpg',source:'https://www.loc.gov/pictures/item/2016852329/',label:'Election crowd at White House, 1920'},
      {url:'https://cdn.loc.gov/service/pnp/cph/3b40000/3b40000/3b40200/3b40299r.jpg',source:'https://www.loc.gov/pictures/item/92519195/',label:'Curb brokers on Wall Street, 1920'},
      {url:'https://cdn.loc.gov/service/pnp/agc/7a03000/7a03300/7a03301r.jpg',source:'https://www.loc.gov/pictures/item/2018705978/',label:'New Orleans public life, 1920–1926'}
    ],
    y75:[
      {url:'https://cdn.loc.gov/service/pnp/fsa/8d28000/8d28100/8d28149r.jpg',source:'https://www.loc.gov/pictures/item/2017850406/',label:'People on a downtown Los Angeles street, 1942'},
      {url:'https://cdn.loc.gov/service/pnp/fsa/8d28000/8d28100/8d28141r.jpg',source:'https://www.loc.gov/pictures/item/2017850397/',label:'Los Angeles street scene, 1942'},
      {url:'https://cdn.loc.gov/service/pnp/fsa/8b31000/8b31500/8b31567r.jpg',source:'https://www.loc.gov/pictures/item/2017769454/',label:'Washington street scene, 1935–1942'},
      {url:'https://cdn.loc.gov/service/pnp/fsa/8d21000/8d21600/8d21601r.jpg',source:'https://www.loc.gov/pictures/collection/fsa/item/2017834567/',label:'African American public life in New York, 1942'}
    ]
  };

  const slots=[
    ['--scene-y200','y200'],
    ['--scene-head-left','y100'],
    ['--scene-head-right','y100'],
    ['--scene-y75','y75'],
    ['--scene-community-left','y100'],
    ['--scene-community-right','y100'],
    ['--scene-showcase-1','y200'],
    ['--scene-showcase-2','y100'],
    ['--scene-showcase-3','y75'],
    ['--scene-showcase-4','y75']
  ];

  function dateSeed(){
    const d=document.querySelector('[data-current-date]')?.textContent||document.querySelector('[data-current-monthday]')?.textContent||new Date().toISOString().slice(0,10);
    let h=2166136261;
    for(let i=0;i<d.length;i++){h^=d.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  function currentValue(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
  function missing(name){const v=currentValue(name);return !v||v==='none'||v==='initial'||v==='unset';}
  function pick(group,offset,used){
    const list=scenes[group]||[];if(!list.length)return null;
    const seed=dateSeed();
    for(let i=0;i<list.length;i++){
      const item=list[(seed+offset+i)%list.length];
      if(!used.has(item.url)){used.add(item.url);return item;}
    }
    return null;
  }
  function apply(){
    const used=new Set();
    // Protect any real archive visuals already assigned by illustration-pass.js.
    for(const [name] of slots){const v=currentValue(name);if(v&&v!=='none')used.add(v);}
    const applied=[];
    slots.forEach(([name,group],index)=>{
      if(!missing(name))return;
      const item=pick(group,index,used);if(!item)return;
      document.documentElement.style.setProperty(name,`url("${item.url}")`);
      applied.push({slot:name,label:item.label,source:item.source});
    });
    document.documentElement.dataset.sceneFallbackCount=String(applied.length);
    window.OnThisDay=window.OnThisDay||{};
    window.OnThisDay.sceneFallbackAttribution=applied;
  }

  // Run after the edition visual selector has had time to populate its variables.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,1700),{once:true});
  else setTimeout(apply,1700);
})();
