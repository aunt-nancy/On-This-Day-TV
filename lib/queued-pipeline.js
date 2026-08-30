import { AGENTS, computeEditionDate } from './agents.js';
import { assertCoreEnvironment } from './config.js';
import { runModel } from './openai.js';
import { insert, upsert, update, select, remove } from './supabase.js';
import {
  researchPrompt, contextPrompt, translationPrompt, verificationPrompt,
  rightsPrompt, discrepancyPrompt, editorPrompt, socialPrompt, trendsPrompt,
} from './prompts.js';
import { dispatchPosts } from './social.js';

export const QUEUE_TOPIC = 'otd-agent-work';

export const STAGE_ORDER = [
  'date_anniversary',
  'major_press',
  'black_press',
  'regional_local',
  'community_press',
  'visual_archive',
  'historical_context',
  'translation',
  'source_verification',
  'rights_review',
  'discrepancy_exception',
  'editor_producer',
  'social_editor',
  'short_form_video',
  'engagement_trends',
  'social_distribution',
];

const RESEARCH_KEYS = ['major_press','black_press','regional_local','community_press','visual_archive'];
const NONFATAL_KEYS = new Set([
  ...RESEARCH_KEYS,
  'historical_context',
  'translation',
  'social_editor',
  'short_form_video',
  'engagement_trends',
  'social_distribution',
]);

function now() { return new Date().toISOString(); }

function confidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function nextStage(agentKey) {
  const i = STAGE_ORDER.indexOf(agentKey);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

async function modelJson(prompt, { model, webSearch = false, reasoning = 'low' } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const retryPrompt = attempt === 1 ? prompt : {
        ...prompt,
        instructions: `${prompt.instructions}\nRETRY: Return a smaller valid JSON object only. Keep only the strongest supported results.`,
      };
      const result = await runModel({ ...retryPrompt, model, webSearch, reasoning });
      return { ...result.json, _openaiResponseId: result.responseId };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function createJob(runId, agentKey) {
  const [job] = await insert('agent_jobs', {
    run_id: runId,
    agent_key: agentKey,
    status: 'running',
    started_at: now(),
  });
  return job;
}

async function finishJob(job, output, status = 'complete', error = null) {
  await update('agent_jobs', `id=eq.${job.id}`, {
    status,
    output,
    confidence: confidence(output?.confidence),
    discrepancy_count: Array.isArray(output?.discrepancies) ? output.discrepancies.length : 0,
    error,
    finished_at: now(),
  });
  return output;
}

async function completedOutput(runId, agentKey) {
  const rows = await select(
    'agent_jobs',
    `select=*&run_id=eq.${runId}&agent_key=eq.${agentKey}&status=eq.complete&order=finished_at.desc&limit=1`
  ).catch(() => []);
  return rows[0]?.output || null;
}

async function failedJobs(runId) {
  return select(
    'agent_jobs',
    `select=agent_key,error,output&run_id=eq.${runId}&status=eq.failed&order=started_at.desc`
  ).catch(() => []);
}

async function researchOutputs(runId) {
  const outputs = [];
  for (const key of RESEARCH_KEYS) {
    const output = await completedOutput(runId, key);
    if (output) outputs.push(output);
  }
  return outputs;
}

function flattenResearch(outputs) {
  return outputs.flatMap(output => output?.candidates || []);
}

function chooseVisuals(output) {
  return (output?.candidates || []).slice(0, 8);
}

async function contextForRun(runId) {
  const rows = await select('agent_runs', `select=*&id=eq.${runId}&limit=1`);
  if (!rows.length) throw new Error(`Run ${runId} not found`);
  return { run: rows[0], context: computeEditionDate(rows[0].edition_date) };
}

export async function createQueuedRun({ date, trigger = 'manual' } = {}) {
  assertCoreEnvironment();
  const context = computeEditionDate(date);

  // Close stale prior runs for the same date so the admin page never confuses them with live work.
  const stale = await select(
    'agent_runs',
    `select=id&edition_date=eq.${context.editionDate}&status=eq.running`
  ).catch(() => []);
  for (const old of stale) {
    await update('agent_runs', `id=eq.${old.id}`, {
      status: 'failed',
      error: 'Superseded by a new durable queue run.',
      finished_at: now(),
    }).catch(() => {});
    await update('agent_jobs', `run_id=eq.${old.id}&status=eq.running`, {
      status: 'failed',
      error: 'Superseded by a new durable queue run.',
      finished_at: now(),
    }).catch(() => {});
  }

  const [run] = await insert('agent_runs', {
    edition_date: context.editionDate,
    status: 'running',
    trigger,
    agent_version: '2026-08-30.queue.1',
    years: context.years,
    started_at: now(),
  });
  return { run, context };
}

async function persistEditionCore(run, context, editionOutput, verified, discrepancy) {
  const edition = editionOutput.edition || {};
  const status = discrepancy?.humanReviewRequired
    ? 'needs_human'
    : (discrepancy?.publishable ? 'published' : 'needs_human');

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

  await remove('stories', `edition_id=eq.${savedEdition.id}`).catch(() => {});
  await remove('discrepancies', `edition_id=eq.${savedEdition.id}`).catch(() => {});

  const storyRows = (verified?.verifiedStories || []).map((story, index) => ({
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
    ...(discrepancy?.blocking || []).map(x => ({ ...x, severity: 'blocking' })),
    ...(discrepancy?.nonBlocking || []).map(x => ({ ...x, severity: 'non_blocking' })),
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

  return savedEdition;
}

export async function runQueuedStage(runId, agentKey) {
  assertCoreEnvironment();
  if (!STAGE_ORDER.includes(agentKey)) throw new Error(`Unknown agent stage: ${agentKey}`);

  // Queue delivery is at-least-once. Completed jobs are idempotent and never rerun.
  const existing = await completedOutput(runId, agentKey);
  if (existing) return { ok: true, reused: true, output: existing, continue: true };

  const { run, context } = await contextForRun(runId);
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const verifyModel = process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra';
  const job = await createJob(runId, agentKey);

  try {
    let output;

    if (agentKey === 'date_anniversary') {
      output = { agent: agentKey, status: 'complete', confidence: 1, ...context, discrepancies: [] };
    } else if (RESEARCH_KEYS.includes(agentKey)) {
      output = await modelJson(
        researchPrompt(agentKey, context),
        { model, webSearch: true, reasoning: agentKey === 'visual_archive' ? 'low' : 'medium' }
      );
    } else {
      const researchOut = await researchOutputs(runId);
      const research = flattenResearch(researchOut);
      const visuals = researchOut.find(x => x.agent === 'visual_archive') || { candidates: [] };

      if (agentKey === 'historical_context') {
        output = await modelJson(contextPrompt(context, research), { model, webSearch: true, reasoning: 'medium' });
      } else if (agentKey === 'translation') {
        output = await modelJson(translationPrompt(context, research), { model, webSearch: false, reasoning: 'low' });
      } else if (agentKey === 'source_verification') {
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        if (!research.length) throw new Error('No completed research candidates are available for source verification.');
        output = await modelJson(
          verificationPrompt(context, research, { contextual, translation }),
          { model: verifyModel, webSearch: true, reasoning: 'high' }
        );
      } else if (agentKey === 'rights_review') {
        const verified = await completedOutput(runId, 'source_verification');
        if (!verified) throw new Error('Source Verification has not completed.');
        output = await modelJson(
          rightsPrompt(context, verified, chooseVisuals(visuals)),
          { model: verifyModel, webSearch: true, reasoning: 'medium' }
        );
      } else if (agentKey === 'discrepancy_exception') {
        const verified = await completedOutput(runId, 'source_verification');
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        const rights = await completedOutput(runId, 'rights_review');
        const failures = await failedJobs(runId);
        if (!verified || !rights) throw new Error('Verification and rights review must complete first.');
        output = await modelJson(
          discrepancyPrompt(context, { verified, contextual, translation, rights, visuals, agentFailures: failures }),
          { model: verifyModel, webSearch: false, reasoning: 'high' }
        );
      } else if (agentKey === 'editor_producer') {
        const verified = await completedOutput(runId, 'source_verification');
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const rights = await completedOutput(runId, 'rights_review');
        const discrepancy = await completedOutput(runId, 'discrepancy_exception');
        if (!verified || !rights || !discrepancy) throw new Error('Editorial dependencies are incomplete.');
        output = await modelJson(
          editorPrompt(context, verified, contextual, rights, chooseVisuals(visuals), discrepancy),
          { model: verifyModel, webSearch: false, reasoning: 'high' }
        );

        // Publish the article package as soon as editorial work completes.
        const saved = await persistEditionCore(run, context, output, verified, discrepancy);
        output = { ...output, savedEditionId: saved.id };
      } else if (agentKey === 'social_editor' || agentKey === 'short_form_video') {
        const editor = await completedOutput(runId, 'editor_producer');
        if (!editor?.edition) throw new Error('Editor & Producer has not completed.');
        output = await modelJson(
          socialPrompt(agentKey, context, editor.edition),
          { model, reasoning: 'low' }
        );
      } else if (agentKey === 'engagement_trends') {
        const editor = await completedOutput(runId, 'editor_producer');
        if (!editor?.edition) throw new Error('Editor & Producer has not completed.');
        const priorMetrics = await select('social_metrics', 'select=*&order=recorded_at.desc&limit=100').catch(() => []);
        output = await modelJson(
          trendsPrompt(context, editor.edition, priorMetrics),
          { model, reasoning: 'low' }
        );
      } else if (agentKey === 'social_distribution') {
        const editor = await completedOutput(runId, 'editor_producer');
        const socialEditor = await completedOutput(runId, 'social_editor') || { posts: [] };
        const video = await completedOutput(runId, 'short_form_video') || { posts: [] };
        const discrepancy = await completedOutput(runId, 'discrepancy_exception') || {};
        const posts = [...(socialEditor.posts || []), ...(video.posts || [])];

        const editions = await select('editions', `select=*&run_id=eq.${runId}&limit=1`);
        const edition = editions[0] || null;

        if (edition) {
          await remove('social_posts', `edition_id=eq.${edition.id}`).catch(() => {});
          const rows = posts.map(post => ({
            edition_id: edition.id,
            platform: post.platform || '',
            format: post.format || '',
            status: discrepancy.humanReviewRequired ? 'queued' : 'queued',
            content: post,
            scheduled_for: null,
          }));
          if (rows.length) await insert('social_posts', rows, { returning: false });
        }

        const results = discrepancy.humanReviewRequired
          ? posts.map(post => ({ platform: post.platform, status: 'waiting_human_review' }))
          : await dispatchPosts(posts, editor?.edition || {});

        output = {
          agent: agentKey,
          status: 'complete',
          results,
          postsQueued: posts.length,
          confidence: 1,
          discrepancies: [],
        };
      } else {
        throw new Error(`No stage implementation for ${agentKey}`);
      }
    }

    await finishJob(job, output);

    if (agentKey === 'social_distribution') {
      const discrepancy = await completedOutput(runId, 'discrepancy_exception') || {};
      const verified = await completedOutput(runId, 'source_verification') || {};
      const socialEditor = await completedOutput(runId, 'social_editor') || { posts: [] };
      const shortVideo = await completedOutput(runId, 'short_form_video') || { posts: [] };

      await update('agent_runs', `id=eq.${runId}`, {
        status: discrepancy.humanReviewRequired ? 'needs_human' : 'complete',
        publishable: Boolean(discrepancy.publishable),
        human_review_required: Boolean(discrepancy.humanReviewRequired),
        summary: {
          verifiedStories: (verified.verifiedStories || []).length,
          blockingDiscrepancies: (discrepancy.blocking || []).length,
          socialPosts: (socialEditor.posts || []).length + (shortVideo.posts || []).length,
        },
        finished_at: now(),
      });
    }

    return { ok: true, output, continue: true };
  } catch (error) {
    await finishJob(
      job,
      { agent: agentKey, status: 'failed', confidence: 0, discrepancies: [{ type: 'agent_failure', description: error.message }] },
      'failed',
      error.message
    ).catch(() => {});

    const nonfatal = NONFATAL_KEYS.has(agentKey);
    if (!nonfatal) {
      await update('agent_runs', `id=eq.${runId}`, {
        status: 'failed',
        error: `${agentKey}: ${error.message}`,
        finished_at: now(),
      }).catch(() => {});
    }

    return { ok: false, error: error.message, nonfatal, continue: nonfatal };
  }
}
