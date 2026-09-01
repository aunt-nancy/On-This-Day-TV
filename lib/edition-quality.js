function safeArray(value){ return Array.isArray(value) ? value : []; }

function validStory(story){
  return Boolean(story && story.title && story.sourceUrl);
}

export function editionQuality(payload={}){
  const stories=payload?.stories||{};
  const y100=stories?.y100||{};
  const items=[
    stories?.y200,
    y100?.major,
    y100?.black,
    ...safeArray(y100?.secondary),
    stories?.y75,
    ...safeArray(payload?.communityTiles),
  ].filter(validStory);

  const core={
    y200:validStory(stories?.y200),
    y100:validStory(y100?.major),
    y75:validStory(stories?.y75),
  };

  const missingCore=Object.entries(core).filter(([,ok])=>!ok).map(([key])=>key);
  return {
    storyCount:items.length,
    core,
    missingCore,
    publishable:items.length>=3 && missingCore.length===0,
  };
}
