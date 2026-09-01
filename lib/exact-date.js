const OFFSETS={y200:200,y100:100,y75:75};

function normalizeDate(value){
  const text=String(value||'').trim();
  if(!text) return '';
  const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(slash) return `${slash[3]}-${String(slash[1]).padStart(2,'0')}-${String(slash[2]).padStart(2,'0')}`;
  return '';
}

export function expectedIssueDate(editionDate,eraKey){
  const date=normalizeDate(editionDate);
  const offset=OFFSETS[eraKey];
  if(!date||!offset) return '';
  const [year,month,day]=date.split('-');
  return `${Number(year)-offset}-${month}-${day}`;
}

export function exactDateStory(story,eraKey,editionDate){
  if(!story?.title||!story?.sourceUrl) return false;
  return normalizeDate(story.issueDate)===expectedIssueDate(editionDate,eraKey);
}

export function sanitizeExactDateEdition(payload={},editionDate=payload?.editionDate||''){
  const clean=structuredClone(payload||{});
  clean.stories=clean.stories||{};
  clean.stories.y100=clean.stories.y100||{};
  const invalid=[];

  const keep=(story,eraKey,label)=>{
    if(!story?.title||!story?.sourceUrl) return null;
    if(exactDateStory(story,eraKey,editionDate)) return story;
    invalid.push({
      label,
      title:story.title,
      publication:story.publication||'',
      issueDate:normalizeDate(story.issueDate),
      expectedIssueDate:expectedIssueDate(editionDate,eraKey),
      sourceUrl:story.sourceUrl,
    });
    return null;
  };

  clean.stories.y200=keep(clean.stories.y200,'y200','y200')||{};
  clean.stories.y75=keep(clean.stories.y75,'y75','y75')||{};
  clean.stories.y100.major=keep(clean.stories.y100.major,'y100','y100')||{};
  clean.stories.y100.black=keep(clean.stories.y100.black,'y100','y100_black')||{};
  clean.stories.y100.secondary=(Array.isArray(clean.stories.y100.secondary)?clean.stories.y100.secondary:[])
    .map((s,i)=>keep(s,'y100',`y100_secondary_${i}`)).filter(Boolean);
  clean.communityTiles=(Array.isArray(clean.communityTiles)?clean.communityTiles:[])
    .map((s,i)=>keep(s,'y100',`community_${i}`)).filter(Boolean);

  const core={
    y200:Boolean(clean.stories.y200?.title&&clean.stories.y200?.sourceUrl),
    y100:Boolean(clean.stories.y100.major?.title&&clean.stories.y100.major?.sourceUrl),
    y75:Boolean(clean.stories.y75?.title&&clean.stories.y75?.sourceUrl),
  };
  const validCoreCount=Object.values(core).filter(Boolean).length;
  const missingCore=Object.entries(core).filter(([,ok])=>!ok).map(([key])=>key);

  if(core.y100){
    clean.leadHeadline=clean.stories.y100.major.title||clean.leadHeadline||'';
    clean.leadEventKey=clean.stories.y100.major.eventKey||clean.leadEventKey||'';
  }else{
    clean.leadHeadline='';
    clean.leadEventKey='';
    clean.stories.y100.black={};
  }

  clean.editionDate=editionDate||clean.editionDate||'';
  clean.publicationStatus=validCoreCount===3?'published':'published_partial';
  clean.missingCoreEras=missingCore;

  return {
    payload:clean,
    core,
    validCoreCount,
    missingCore,
    invalid,
    publishable:validCoreCount>0,
    complete:validCoreCount===3,
  };
}

export function exactDateEdition(payload={},editionDate=payload?.editionDate||''){
  const result=sanitizeExactDateEdition(payload,editionDate);
  return {
    publishable:result.publishable,
    complete:result.complete,
    core:result.core,
    validCoreCount:result.validCoreCount,
    missingCore:result.missingCore,
    invalid:result.invalid,
  };
}
