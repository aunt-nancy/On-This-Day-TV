import { AGENTS, computeEditionDate } from './agents.js';
import { assertCoreEnvironment } from './config.js';
import { runModel } from './openai.js';
import { insert, upsert, update, select } from './supabase.js';
import {
  researchPrompt, contextPrompt, translationPrompt, verificationPrompt,
  rightsPrompt, discrepancyPrompt, editorPrompt, socialPrompt, trendsPrompt,
} from './prompts.js';
import { dispatchPosts } from './social.js';

function now() { return new Date().toISOString(); }
function confidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

async function createRun(context, trigger) {
  const [run] = await insert('agent_runs', {
    edition_date: context.editionDate,
    status: 'running',
    trigger,
    agent_version: '2026-08-29.1',
    years: context.years,
    started_at: now(),
  });
  return run;
}

async function startJob(runId, agentKey) {
  const [job] = await insert('agent_jobs', {
    run_id: runId,
    agent_key: agentKey,
    status: 'running',
    started_at: now(),
  });
  return job;
}

async function finishJob(job, output, status = 'complete', error = null) {
  const patch = {
    status,
    output,
    confidence: confidence(output?.confidence),
    discrepancy_count: Array.isArray(output?.discrepancies) ? output.discrepancies.length : 0,
    error,
    finished_at: now(),
  };
  await update('agent_jobs', `id=eq.${job.id}`, patch);
  return output;
}

async function executeAgent(runId, agentKey, fn) {
  const job = await startJob(runId, agentKey);
  try {
    const output = await fn();
    return await finishJob(job, output);
  } catch (error) {
    await finishJob(job, { agent: agentKey, status: 'failed', confidence: 0, discrepancies: [{ type: 'agent_failure', description: error.message }] }, 'failed', error.message);
    throw error;
  }
}

async function modelJson(prompt, { model, webSearch = false, reasoning = 'low' } = {}) {
  const result = await runModel({ ...prompt, model, webSearch, reasoning });
  return { ...result.json, _openaiResponseId: result.responseId };
}

function flattenResearch(outputs) {
  return outputs.flatMap(output => output?.candidates || []);
}

function chooseVisuals(visualOutput) {
  return (visualOutput?.candidates || []).slice(0, 8);
}

async function persistEdition(run, context, editionOutput, verified, rights, discrepancies, social) {
  const edition = editionOutput.edition || {};
  const status = edition.publicationStatus || (discrepancies.publishable ? 'published' : 'needs_human');
  const [savedEdition] = await upsert('editions', {
    edition_date: context.editionDate,
    status,
    lead_headline: edition.leadHeadline || '',
    years: context.years,
    payload: edition,
    source_summary: edition.sourceSummary || [],
    published_at: status === 'published' ? now() : null,
    run_id: run.id,
    updated_at: now(),
  }, 'edition_date');

  const storyRows = (verified.verifiedStories || []).map((story, index) => ({
    edition_id: savedEdition.id,
    era_key: story.eraKey,
    era_year: story.eraYear,
    event_key: story.eventKey,
    role: story.community === 'black_press' || /black|african/i.test(story.community || '') ? 'black_press' : 'story',
    community: story.community || '',
    title: story.title || '',
    summary: story.summary || '',
    publication: story.publication || '',
    city: story.city || '',
    issue_date: story.issueDate || null,
    page: story.page || '',
    archive: story.archive || '',
    source_url: story.sourceUrl || '',
    language: story.language || '',
    article_type: story.articleType || '',
    confidence: confidence(story.confidence),
    verification_notes: story.verificationNotes || '',
    position: index,
  }));
  if (storyRows.length) await insert('stories', storyRows, { returning: false });

  const discrepancyRows = [
    ...(discrepancies.blocking || []).map(item => ({ ...item, severity: 'blocking' })),
    ...(discrepancies.nonBlocking || []).map(item => ({ ...item, severity: 'non_blocking' })),
  ].map(item => ({
    run_id: run.id,
    edition_id: savedEdition.id,
    discrepancy_type: item.type || 'unspecified',
    severity: item.severity,
    description: item.description || JSON.stringify(item),
    evidence: item.evidence || item,
    status: 'open',
  }));
  if (discrepancyRows.length) await insert('discrepancies', discrepancyRows, { returning: false });

  const socialRows = (social.posts || []).map(post => ({
    edition_id: savedEdition.id,
    platform: post.platform || '',
    format: post.format || '',
    status: 'queued',
    content: post,
    scheduled_for: null,
  }));
  if (socialRows.length) await insert('social_posts', socialRows, { returning: false });

  return savedEdition;
}

export async function runAllAgents({ date, trigger = 'manual' } = {}) {
  assertCoreEnvironment();
  const context = computeEditionDate(date);
  const run = await createRun(context, trigger);
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const verifyModel = process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra';

  try {
    await executeAgent(run.id, 'date_anniversary', async () => ({
      agent: 'date_anniversary', status: 'complete', confidence: 1, ...context, discrepancies: [],
    }));

    const researchKeys = ['major_press', 'black_press', 'regional_local', 'community_press', 'visual_archive'];
    const researchOutputs = await Promise.all(researchKeys.map(agentKey =>
      executeAgent(run.id, agentKey, () => modelJson(researchPrompt(agentKey, context), { model, webSearch: true, reasoning: agentKey === 'visual_archive' ? 'low' : 'medium' }))
    ));
    const research = flattenResearch(researchOutputs);
    const visuals = researchOutputs.find(x => x.agent === 'visual_archive') || { candidates: [] };

    const [contextual, translation] = await Promise.all([
      executeAgent(run.id, 'historical_context', () => modelJson(contextPrompt(context, research), { model, webSearch: true, reasoning: 'medium' })),
      executeAgent(run.id, 'translation', () => modelJson(translationPrompt(context, research), { model, webSearch: false, reasoning: 'low' })),
    ]);

    const verified = await executeAgent(run.id, 'source_verification', () =>
      modelJson(verificationPrompt(context, research, { contextual, translation }), { model: verifyModel, webSearch: true, reasoning: 'high' })
    );

    const rights = await executeAgent(run.id, 'rights_review', () =>
      modelJson(rightsPrompt(context, verified, chooseVisuals(visuals)), { model: verifyModel, webSearch: true, reasoning: 'medium' })
    );

    const discrepancy = await executeAgent(run.id, 'discrepancy_exception', () =>
      modelJson(discrepancyPrompt(context, { verified, contextual, translation, rights, visuals }), { model: verifyModel, webSearch: false, reasoning: 'high' })
    );

    const editionOutput = await executeAgent(run.id, 'editor_producer', () =>
      modelJson(editorPrompt(context, verified, contextual, rights, chooseVisuals(visuals), discrepancy), { model: verifyModel, webSearch: false, reasoning: 'high' })
    );

    const [socialEditor, shortVideo, trends] = await Promise.all([
      executeAgent(run.id, 'social_editor', () => modelJson(socialPrompt('social_editor', context, editionOutput.edition), { model, reasoning: 'low' })),
      executeAgent(run.id, 'short_form_video', () => modelJson(socialPrompt('short_form_video', context, editionOutput.edition), { model, reasoning: 'low' })),
      executeAgent(run.id, 'engagement_trends', async () => {
        const priorMetrics = await select('social_metrics', 'select=*&order=recorded_at.desc&limit=100').catch(() => []);
        return modelJson(trendsPrompt(context, editionOutput.edition, priorMetrics), { model, reasoning: 'low' });
      }),
    ]);

    const combinedPosts = [...(socialEditor.posts || []), ...(shortVideo.posts || [])];
    const distribution = await executeAgent(run.id, 'social_distribution', async () => {
      const results = await dispatchPosts(combinedPosts, editionOutput.edition);
      return { agent: 'social_distribution', status: 'complete', results, confidence: 1, discrepancies: [] };
    });

    const savedEdition = await persistEdition(run, context, editionOutput, verified, rights, discrepancy, { posts: combinedPosts });

    const finalStatus = discrepancy.humanReviewRequired ? 'needs_human' : 'complete';
    await update('agent_runs', `id=eq.${run.id}`, {
      status: finalStatus,
      publishable: Boolean(discrepancy.publishable),
      human_review_required: Boolean(discrepancy.humanReviewRequired),
      summary: {
        editionId: savedEdition.id,
        verifiedStories: (verified.verifiedStories || []).length,
        blockingDiscrepancies: (discrepancy.blocking || []).length,
        socialPosts: combinedPosts.length,
        distribution: distribution.results,
        trends: trends.recommendations || [],
      },
      finished_at: now(),
    });

    return {
      ok: true,
      runId: run.id,
      editionId: savedEdition.id,
      status: finalStatus,
      publishable: Boolean(discrepancy.publishable),
      humanReviewRequired: Boolean(discrepancy.humanReviewRequired),
      agents: AGENTS.map(a => a.key),
      summary: {
        candidates: research.length,
        verifiedStories: (verified.verifiedStories || []).length,
        blockingDiscrepancies: (discrepancy.blocking || []).length,
        nonBlockingDiscrepancies: (discrepancy.nonBlocking || []).length,
        socialPosts: combinedPosts.length,
      },
    };
  } catch (error) {
    await update('agent_runs', `id=eq.${run.id}`, {
      status: 'failed',
      error: error.message,
      finished_at: now(),
    }).catch(() => {});
    throw error;
  }
}
