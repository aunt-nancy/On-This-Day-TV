function safeArray(value){ return Array.isArray(value)?value:[]; }

const SUPPLEMENTS={
  '2026-09-02':{
    y200:{
      eraKey:'y200',
      eraYear:1826,
      eventKey:'charleston_resolutions_adams_administration',
      sourceDesk:'major_press',
      comparisonType:'unmatched',
      coverageScope:'national',
      nationalImportance:0.82,
      title:'Charleston Citizens Praise the Adams Administration',
      summary:'The paper reprinted Charleston resolutions approving John Quincy Adams’s administration and Adams’s reply, presenting public confidence as a judgment on the administration’s purpose and service.',
      publication:'Daily National Intelligencer',
      city:'Washington City',
      issueDate:'1826-09-02',
      page:'2',
      archive:'Library of Congress',
      sourceUrl:'https://www.loc.gov/resource/sn83026172/1826-09-02/ed-1/?sp=2&st=text',
      language:'English',
      articleType:'news',
      confidence:0.99,
    },
    voicesBeyondNewsprint:{
      y200:{
        label:'Voices Beyond the Newsprint',
        text:'No comparable Black community newspaper page is being claimed for this edition. Legal notices and slavery advertisements in the same issue show lives described by authorities and advertisers rather than in those people’s own published voices.',
        sourceUrl:'https://www.loc.gov/item/sn83026172/1826-09-02/ed-1/',
        sourceLabel:'Examine the complete issue',
      },
    },
    visuals:[
      {
        eraKey:'y200',
        eventKey:'charleston_resolutions_adams_administration',
        placementKey:'y200_story_card',
        visualType:'newspaper_scan',
        title:'Daily National Intelligencer, page 2',
        assetUrl:'https://tile.loc.gov/image-services/iiif/service:ndnp:dlc:batch_dlc_eel_ver01:data:sn83026172:print:1826090201:0002/full/pct:12.5/0/default.jpg',
        sourcePageUrl:'https://www.loc.gov/resource/sn83026172/1826-09-02/ed-1/?sp=2',
        rightsStatus:'public_domain',
        displayMode:'thumbnail',
        attribution:'Library of Congress, Chronicling America',
        confidence:0.99,
      },
    ],
    communityTiles:[
      {
        eraKey:'y100',
        eraYear:1926,
        eventKey:'knights_of_columbus_request_coolidge_aid_mexico',
        sourceDesk:'community_press',
        communityKey:'latino',
        community:'Mexican',
        comparisonType:'same_event',
        coverageScope:'international',
        nationalImportance:0.95,
        title:'La intervención en México',
        summary:'El Informador’s Guadalajara front page framed the report as a question of U.S. intervention. It reported that the Knights sought U.S. good offices rather than armed intervention, alongside Coolidge’s nonintervention position.',
        publication:'El Informador',
        city:'Guadalajara, Jalisco, México',
        issueDate:'1926-09-02',
        page:'1',
        archive:'Hemeroteca Nacional Digital de México',
        sourceUrl:'https://hndm.iib.unam.mx/consulta/publicacion/visualizar/558075be7d1e63c9fea1a303?pagina=558a33877d1ed64f1696e642',
        language:'Spanish',
        articleType:'news',
        confidence:0.98,
      },
      {
        eraKey:'y100',
        eraYear:1926,
        eventKey:'putnam_county_flogging_investigation',
        sourceDesk:'black_press',
        communityKey:'black',
        community:'African American / Black',
        comparisonType:'community_lead',
        dateRelation:'nearest_weekly_issue',
        coverageScope:'national',
        nationalImportance:0.91,
        title:'Whippings of White and Black Citizens Investigated in Secret',
        summary:'The Dallas Express led its first weekly issue after September 2 with a probe into more than fifty floggings of Black and white residents and two killings, making racial terror and official accountability its front-page priority.',
        publication:'The Dallas Express',
        city:'Dallas, Texas',
        issueDate:'1926-09-04',
        page:'1',
        archive:'The Portal to Texas History',
        sourceUrl:'https://texashistory.unt.edu/ark:/67531/metapth1759424/m1/1/',
        language:'English',
        articleType:'news',
        confidence:0.99,
      },
      {
        eraKey:'y100',
        eraYear:1926,
        eventKey:'national_origins_immigration_plan',
        sourceDesk:'community_press',
        communityKey:'jewish',
        community:'Jewish American',
        comparisonType:'community_lead',
        coverageScope:'national',
        nationalImportance:0.89,
        title:'U.S. Labor Department Is Preparing to Enact National Origins Plan',
        summary:'The Jewish Daily Bulletin focused on Labor Department preparations for the national-origins quota system and the sharp reductions it would impose on many immigrant groups.',
        publication:'Jewish Daily Bulletin',
        city:'New York, New York',
        issueDate:'1926-09-02',
        page:'',
        archive:'Jewish Telegraphic Agency Archive',
        sourceUrl:'https://www.jta.org/archive/u-s-labor-department-is-preparing-to-enact-national-origins-plan',
        language:'English',
        articleType:'news',
        confidence:0.99,
      },
    ],
  },
};

function sourceKey(story={}){
  return String(story.sourceUrl||`${story.publication||''}|${story.issueDate||''}|${story.title||''}`);
}

export function applyEditorialSupplements(payload={},editionDate=payload?.editionDate||''){
  const supplement=SUPPLEMENTS[String(editionDate||'')];
  const clean=structuredClone(payload||{});
  if(!supplement)return clean;

  clean.stories=clean.stories||{};
  clean.stories.y100=clean.stories.y100||{};
  if(!clean.stories.y200?.title||!clean.stories.y200?.sourceUrl){
    clean.stories.y200=structuredClone(supplement.y200);
  }

  clean.voicesBeyondNewsprint={
    ...(clean.voicesBeyondNewsprint||{}),
    ...structuredClone(supplement.voicesBeyondNewsprint||{}),
  };

  const visuals=[...structuredClone(supplement.visuals||[]),...safeArray(clean.visuals)];
  const visualSeen=new Set();
  clean.visuals=visuals.filter(visual=>{
    const key=String(visual.assetUrl||visual.url||visual.sourcePageUrl||'');
    if(!key||visualSeen.has(key))return false;
    visualSeen.add(key);
    return true;
  });

  const merged=[...structuredClone(supplement.communityTiles||[]),...safeArray(clean.communityTiles)];
  const seen=new Set();
  clean.communityTiles=merged.filter(story=>{
    const key=sourceKey(story);
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
  });
  clean.editorialSupplement='verified_date_specific_sources_v1';
  return clean;
}
