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

function explicitBlockers(discrepancy = {}) {
  const blocking = Array.isArray(discrepancy.blocking) ? discrepancy.blocking : [];
  return {
    editionBlocked: blocking.some(item => String(item?.scope || '').toLowerCase() === 'edition'),
    eventKeys: new Set(blocking.map(item => item?.eventKey).filter(Boolean)),
    sourceUrls: new Set(blocking.map(item => item?.sourceUrl).filter(Boolean)),
  };
}

function safeVerifiedStories(verified = {}, discrepancy = {}) {
  const stories = Array.isArray(verified.verifiedStories) ? verified.verifiedStories : [];
  const blockers = explicitBlockers(discrepancy);
  if (blockers.editionBlocked) return [];
  return stories.filter(story => {
    if (story?.eventKey && blockers.eventKeys.has(story.eventKey)) return false;
    if (story?.sourceUrl && blockers.sourceUrls.has(story.sourceUrl)) return false;
    return true;
  });
}

function chooseEraStory(stories, eraKey, predicate = () => true) {
  return stories
    .filter(story => story?.eraKey === eraKey && predicate(story))
    .sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0] || null;
}

function publicStory(story) {
  if (!story) return {};
  return {
    eventKey: story.eventKey || '',
    eraKey: story.eraKey || '',
    eraYear: story.eraYear || null,
    title: story.title || '',
    summary: story.summary || '',
    publication: story.publication || '',
    city: story.city || '',
    issueDate: story.issueDate || null,
    page: story.page || '',
    archive: story.archive || '',
    sourceUrl: story.sourceUrl || '',
    community: story.community || '',
    confidence: confidence(story.confidence),
  };
}

function deterministicEdition(context, safeStories, discrepancy = {}) {
  const isBlack = story => /black|african/i.test(String(story?.community || ''));
  const y200 = chooseEraStory(safeStories, 'y200');
  const y76 = chooseEraStory(safeStories, 'y76');
  const y100Black = chooseEraStory(safeStories, 'y100', isBlack);
  const y100Major = chooseEraStory(safeStories, 'y100', story => !isBlack(story));
  const used = new Set([y200, y76, y100Black, y100Major].filter(Boolean).map(x => x.eventKey || x.sourceUrl));
  const secondary = safeStories
    .filter(story => story?.eraKey === 'y100' && !used.has(story.eventKey || story.sourceUrl))
    .slice(0, 6)
    .map(publicStory);

  const lead = y100Major?.title || y100Black?.title || y200?.title || y76?.title || '';
  return {
    editionDate: context.editionDate,
    leadHeadline: lead,
    years: context.years,
    stories: {
      y200: publicStory(y200),
      y100: {
        major: publicStory(y100Major),
        black: publicStory(y100Black),
        secondary,
      },
      y76: publicStory(y76),
    },
    communityTiles: [],
    visuals: [],
    sourceSummary: safeStories.slice(0, 20).map(story => ({
      publication: story.publication || '',
      archive: story.archive || '',
      sourceUrl: story.sourceUrl || '',
    })),
    publishedStoryKeys: safeStories.map(story => story.eventKey || story.sourceUrl).filter(Boolean),
    heldForReview: Array.isArray(discrepancy.blocking) ? discrepancy.blocking : [],
    publicationStatus: safeStories.length ? 'published' : 'needs_human',
  };
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
  const safeStories = safeVerifiedStories(verified, discrepancy);
  const blockers = explicitBlockers(discrepancy);
  const generatedEdition = editionOutput?.edition || {};
  const fallback = deterministicEdition(context, safeStories, discrepancy);

  // The editor may improve the presentation, but publishing is determined by
  // verified safe stories, not by whether any unrelated discrepancy exists.
  const edition = {
    ...fallback,
    ...generatedEdition,
    editionDate: context.editionDate,
    years: context.years,
    stories: generatedEdition?.stories || fallback.stories,
    publishedStoryKeys: generatedEdition?.publishedStoryKeys?.length
      ? generatedEdition.publishedStoryKeys
      : fallback.publishedStoryKeys,
    heldForReview: Array.isArray(discrepancy?.blocking) ? discrepancy.blocking : [],
  };

  const hasSafeStories = safeStories.length > 0;
  const status = hasSafeStories && !blockers.editionBlocked ? 'published' : 'needs_human';
  edition.publicationStatus = status;

  const [savedEdition] = await upsert('editions', {
    edition_date: context.editionDate,
    status,
    lead_headline: edition.leadHeadline || fallback.leadHeadline || '',
    years: context.years,
    payload: edition,
    source_summary: edition.sourceSummary || fallback.sourceSummary || [],
    published_at: status === 'published' ? now() : null,
    run_id: run.id,
    updated_at: now(),
  }, 'edition_date');

  await remove('stories', `edition_id=eq.${savedEdition.id}`).catch(() => {});
  await remove('discrepancies', `edition_id=eq.${savedEdition.id}`).catch(() => {});

  const storyRows = safeStories.map((story, index) => ({
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

  return { savedEdition, safeStories, edition };
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

        const safeStories = safeVerifiedStories(verified, discrepancy);
        if (!safeStories.length) {
          throw new Error('No verified, undisputed stories are available to publish.');
        }

        try {
          output = await modelJson(
            editorPrompt(context, { ...verified, verifiedStories: safeStories }, contextual, rights, chooseVisuals(visuals), discrepancy),
            { model: verifyModel, webSearch: false, reasoning: 'high' }
          );
        } catch (editorError) {
          // Verified source material must not disappear just because the prose/editor model had a temporary failure.
          output = {
            agent: 'editor_producer',
            status: 'complete',
            edition: deterministicEdition(context, safeStories, discrepancy),
            confidence: Math.min(...safeStories.map(story => confidence(story.confidence)).filter(Number.isFinite), 0.75),
            discrepancies: [{
              type: 'editor_fallback',
              description: `Editor model failed; published deterministic verified edition instead: ${editorError.message}`,
            }],
          };
        }

        // Publish verified safe articles immediately. Story-level discrepancies are held separately.
        const persisted = await persistEditionCore(run, context, output, verified, discrepancy);
        output = {
          ...output,
          edition: persisted.edition,
          savedEditionId: persisted.savedEdition.id,
          publishedStoryCount: persisted.safeStories.length,
        };
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

        const results = editor?.edition?.publicationStatus === 'published'
          ? await dispatchPosts(posts, editor?.edition || {})
          : posts.map(post => ({ platform: post.platform, status: 'waiting_human_review' }));

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
        status: 'complete',
        publishable: true,
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
