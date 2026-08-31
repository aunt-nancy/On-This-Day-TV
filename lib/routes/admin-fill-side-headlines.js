import { json, requireAdmin, requireMethod } from '../http.js';
import { runModel } from '../openai.js';
import { select, update, insert, remove } from '../supabase.js';
import { computeEditionDate } from '../agents.js';
import { sideEraRecoveryPrompt } from '../prompts.js';

function exactDate(context, eraKey) {
  const year = context.years?.[eraKey];
  return `${year}-${String(context.month).padStart(2,'0')}-${String(context.day).padStart(2,'0')}`;
}

function valid(story, context, eraKey) {
  return Boolean(
    story &&
    story.eraKey === eraKey &&
    String(story.title || '').trim() &&
    String(story.publication || '').trim() &&
    /^https?:\/\//i.test(String(story.sourceUrl || '').trim()) &&
    String(story.issueDate || '').trim() === exactDate(context, eraKey)
  );
}

async function recover(context, eraKey) {
  const model = process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra';
  const attempts = [];

  for (const recoveryPass of [1,2]) {
    try {
      const prompt = sideEraRecoveryPrompt(context, eraKey, recoveryPass);
      const result = await runModel({
        ...prompt,
        model,
        webSearch: true,
        reasoning: recoveryPass === 1 ? 'medium' : 'low',
        maxOutputTokens: 2400,
      });

      const story = result?.json?.verifiedStory;

      if (valid(story, context, eraKey)) {
        return {
          ok: true,
          story: {
            ...story,
            eraKey,
            eraYear: context.years?.[eraKey],
            issueDate: exactDate(context, eraKey),
            sourceDesk: story.sourceDesk || 'major_press',
            community: story.community || 'major_press',
          },
          recoveryPass,
          responseId: result.responseId || null,
        };
      }

      attempts.push({
        recoveryPass,
        error:'No valid exact-date story returned.',
        responseId:result.responseId||null,
      });
    } catch (error) {
      attempts.push({ recoveryPass, error:error.message });
    }
  }

  return { ok:false, story:null, attempts };
}

function publicStory(story) {
  return {
    eventKey:story.eventKey||'',
    sourceDesk:story.sourceDesk||'major_press',
    coverageScope:story.coverageScope||'',
    nationalImportance:Number(story.nationalImportance||0),
    eraKey:story.eraKey||'',
    eraYear:story.eraYear||null,
    title:story.title||'',
    summary:story.summary||'',
    publication:story.publication||'',
    city:story.city||'',
    issueDate:story.issueDate||null,
    page:story.page||'',
    archive:story.archive||'',
    sourceUrl:story.sourceUrl||'',
    community:story.community||'major_press',
    confidence:Number(story.confidence||0),
  };
}

async function persistStory(edition, context, eraKey, story) {
  const payload=edition.payload||{};
  const next={
    ...payload,
    years:context.years,
    stories:{
      ...(payload.stories||{}),
      [eraKey]:publicStory(story),
    },
  };

  await update('editions',`id=eq.${edition.id}`,{
    years:context.years,
    payload:next,
    updated_at:new Date().toISOString(),
  });

  await remove('stories',`edition_id=eq.${edition.id}&era_key=eq.${eraKey}`).catch(()=>{});

  await insert('stories',{
    edition_id:edition.id,
    era_key:eraKey,
    era_year:context.years?.[eraKey],
    event_key:story.eventKey||'',
    role:'story',
    community:story.community||'major_press',
    title:story.title||'',
    summary:story.summary||'',
    publication:story.publication||'',
    city:story.city||'',
    issue_date:story.issueDate,
    page:story.page||'',
    archive:story.archive||'',
    source_url:story.sourceUrl,
    language:story.language||'English',
    article_type:story.articleType||'news',
    confidence:Number(story.confidence||0),
    verification_notes:story.verificationNotes||'Mandatory exact-date side headline recovery.',
    position:eraKey==='y200'?0:999,
  },{returning:false});

  return next;
}

export default async function handler(req,res){
  if(!requireMethod(req,res,['POST'])) return;
  if(!requireAdmin(req,res)) return;

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const context=computeEditionDate(body.date||undefined);

    const editions=await select(
      'editions',
      `select=*&edition_date=eq.${encodeURIComponent(context.editionDate)}&order=updated_at.desc&limit=1`
    );

    if(!editions.length){
      return json(res,404,{
        ok:false,
        error:`No edition exists for ${context.editionDate}. Run the newsroom once to create it.`,
      });
    }

    let edition=editions[0];
    const existing=edition.payload?.stories||{};
    const needs=['y200','y76'].filter(eraKey=>!valid(existing?.[eraKey],context,eraKey));

    if(!needs.length){
      return json(res,200,{
        ok:true,
        changed:false,
        years:{y200:context.years.y200,y75:context.years.y76},
        message:'Both mandatory side headlines are already populated.',
      });
    }

    const results=await Promise.all(needs.map(eraKey=>recover(context,eraKey)));
    const failures=[];

    for(let i=0;i<needs.length;i++){
      const eraKey=needs[i];
      const result=results[i];

      if(!result?.ok||!result.story){
        failures.push({eraKey,attempts:result?.attempts||[]});
        continue;
      }

      const nextPayload=await persistStory(edition,context,eraKey,result.story);
      edition={...edition,payload:nextPayload};
    }

    const finalStories=edition.payload?.stories||{};
    const ready=['y200','y76'].every(eraKey=>valid(finalStories?.[eraKey],context,eraKey));

    if(ready){
      await update('editions',`id=eq.${edition.id}`,{
        status:'published',
        payload:{
          ...(edition.payload||{}),
          mandatorySideHeadlines:{ready:true,missing:[]},
        },
        updated_at:new Date().toISOString(),
      });
    }

    return json(res,ready?200:422,{
      ok:ready,
      changed:true,
      editionDate:context.editionDate,
      years:{y200:context.years.y200,y75:context.years.y76},
      ready,
      failures,
      stories:{
        y200:finalStories.y200||null,
        y76:finalStories.y76||null,
      },
      message:ready
        ?'Mandatory 200-year and 75-year headlines are populated.'
        :'One or more mandatory side headlines still could not be verified.',
    });
  }catch(error){
    return json(res,500,{ok:false,error:error.message});
  }
}
