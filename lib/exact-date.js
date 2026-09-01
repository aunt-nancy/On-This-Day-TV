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

export function exactDateEdition(payload={},editionDate=payload?.editionDate||''){
  const stories=payload?.stories||{};
  const y100=stories?.y100||{};
  const core={
    y200:exactDateStory(stories?.y200,'y200',editionDate),
    y100:exactDateStory(y100?.major,'y100',editionDate),
    y75:exactDateStory(stories?.y75,'y75',editionDate),
  };
  const invalid=[];
  const inspect=(story,eraKey,label)=>{
    if(!story?.title||!story?.sourceUrl) return;
    if(exactDateStory(story,eraKey,editionDate)) return;
    invalid.push({label,title:story.title,publication:story.publication||'',issueDate:normalizeDate(story.issueDate),expectedIssueDate:expectedIssueDate(editionDate,eraKey),sourceUrl:story.sourceUrl});
  };
  inspect(stories?.y200,'y200','y200');
  inspect(y100?.major,'y100','y100');
  inspect(stories?.y75,'y75','y75');
  inspect(y100?.black,'y100','y100_black');
  (Array.isArray(y100?.secondary)?y100.secondary:[]).forEach((s,i)=>inspect(s,'y100',`y100_secondary_${i}`));
  (Array.isArray(payload?.communityTiles)?payload.communityTiles:[]).forEach((s,i)=>inspect(s,'y100',`community_${i}`));
  return {publishable:Object.values(core).every(Boolean),core,invalid};
}
