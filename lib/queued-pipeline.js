import { AGENTS, computeEditionDate } from './agents.js';
import { assertCoreEnvironment } from './config.js';
import { runModel } from './openai.js';
import { insert, upsert, update, select, remove } from './supabase.js';
import {
  editorOpeningPrompt, researchPrompt, contextPrompt, translationPrompt, verificationPrompt,
  visualArchivePrompt, rightsPrompt, discrepancyPrompt, editorPrompt, socialPrompt, trendsPrompt,
} from './prompts.js';
import { dispatchPosts } from './social.js';

export const QUEUE_TOPIC = 'otd-agent-work';

export const STAGE_ORDER = [
  'editor_opening',
  'black_press',
  'major_press',
  'regional_local',
  'community_press',
  'historical_context',
  'translation',
  'source_verification',
  'rights_review',
  'discrepancy_exception',
  'editor_producer',
  'visual_archive',
  'social_editor',
  'short_form_video',
  'engagement_trends',
  'social_distribution',
];

const RESEARCH_KEYS = ['black_press','major_press','regional_local','community_press'];
const NONFATAL_KEYS = new Set([
  'editor_opening',
  ...RESEARCH_KEYS,
  'visual_archive',
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

async function modelJson(prompt, options = {}) {
  try {
    const result = await runModel({ ...prompt, ...options });
    return { ...result.json, _openaiResponseId: result.responseId };
  } catch (error) {
    // Retry only malformed/empty model output. Network timeouts and rate-limit
    // exhaustion are not multiplied into another full research request here.
    const retryableJson = /valid JSON|empty response/i.test(String(error?.message || ''));
    if (!retryableJson) throw error;

    const retryPrompt = {
      ...prompt,
      instructions: `${prompt.instructions}
RETRY: Return a smaller valid JSON object only. Keep only the strongest supported results.`,
    };
    const result = await runModel({
      ...retryPrompt,
      ...options,
      maxOutputTokens: Math.min(Number(options.maxOutputTokens || 2800), 2200),
    });
    return { ...result.json, _openaiResponseId: result.responseId };
  }
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

async function latestRunningJob(runId, agentKey) {
  const rows = await select(
    'agent_jobs',
    `select=*&run_id=eq.${runId}&agent_key=eq.${agentKey}&status=eq.running&order=started_at.desc&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

async function clearStaleRunningJob(runId, agentKey) {
  const running = await latestRunningJob(runId, agentKey);
  if (!running) return null;

  const ageMs = Date.now() - new Date(running.started_at || 0).getTime();
  const staleAfterMs = 150000; // 2.5 minutes; AI HTTP requests hard-stop earlier.

  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < staleAfterMs) {
    return running;
  }

  await update('agent_jobs', `id=eq.${running.id}`, {
    status: 'failed',
    error: 'Stale running job cleared automatically by the parallel newsroom engine.',
    finished_at: now(),
  }).catch(() => {});

  return null;
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

function verificationOnlyGate(verified = {}) {
  const blocking = [];
  const nonBlocking = [];

  for (const raw of (verified.discrepancies || [])) {
    const item = raw || {};
    const scope = String(item.scope || '').toLowerCase();
    const eventKey = item.eventKey || item.event_key || '';
    const sourceUrl = item.sourceUrl || item.source_url || '';

    if (scope === 'edition') {
      blocking.push({ ...item, scope: 'edition' });
    } else if (eventKey || sourceUrl) {
      blocking.push({ ...item, scope: 'story', eventKey, sourceUrl });
    } else {
      nonBlocking.push(item);
    }
  }

  return {
    blocking,
    nonBlocking,
    humanReviewRequired: blocking.length > 0,
    publishable: true,
  };
}

function storyIdentity(story = {}) {
  return String(story.sourceUrl || story.eventKey || `${story.eraKey || ''}|${story.publication || ''}|${story.title || ''}`);
}

function mergeVerified(base = {}, supplement = {}) {
  const map = new Map();
  for (const story of [...(base.verifiedStories || []), ...(supplement.verifiedStories || [])]) {
    const key = storyIdentity(story);
    const existing = map.get(key);
    if (!existing || Number(story.confidence || 0) > Number(existing.confidence || 0)) {
      map.set(key, story);
    }
  }

  return {
    ...base,
    verifiedStories: [...map.values()],
    rejectedCandidates: [...(base.rejectedCandidates || []), ...(supplement.rejectedCandidates || [])],
    discrepancies: [...(base.discrepancies || []), ...(supplement.discrepancies || [])],
    confidence: Math.max(Number(base.confidence || 0), Number(supplement.confidence || 0)),
  };
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
    sourceDesk: story.sourceDesk || '',
    coverageScope: story.coverageScope || '',
    nationalImportance: confidence(story.nationalImportance),
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

function sourceDesk(story = {}) {
  return String(story.sourceDesk || '').toLowerCase();
}
function isBlackVoice(story = {}) {
  return sourceDesk(story) === 'black_press' ||
    /black|african/i.test(String(story.community || ''));
}
function isCommunityVoice(story = {}) {
  const desk = sourceDesk(story);
  if (desk === 'black_press' || desk === 'community_press') return true;
  const community = String(story.community || '').toLowerCase();
  return /black|african|latino|spanish|hispanic|german|british|anglo|irish|chinese|italian|jewish|yiddish|japanese|indigenous|native|tribal|caribbean|filipino|south asian|armenian|greek|polish/.test(community);
}
function isMajorPress(story = {}) {
  const desk = sourceDesk(story);
  if (desk === 'major_press') return true;
  if (desk === 'black_press' || desk === 'community_press') return false;
  return /major|mainstream|national/i.test(String(story.community || ''));
}
function importance(story = {}) {
  const value = Number(story.nationalImportance ?? story.nationalImportanceScore ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
function distinctVoiceCount(stories = []) {
  const keys = new Set();
  for (const story of stories) {
    if (!isCommunityVoice(story)) continue;
    const key = String(story.community || story.sourceDesk || story.publication || '').toLowerCase().trim();
    if (key) keys.add(key);
  }
  return keys.size;
}
function chooseNationalLeadCluster(stories = []) {
  const y100 = stories.filter(story => story?.eraKey === 'y100' && story?.eventKey);
  const groups = new Map();
  for (const story of y100) {
    const key = String(story.eventKey);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(story);
  }

  const candidates = [];
  for (const [eventKey, cluster] of groups.entries()) {
    const majors = cluster.filter(isMajorPress).sort((a,b) => {
      const importanceDiff = importance(b) - importance(a);
      if (importanceDiff) return importanceDiff;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    });
    if (!majors.length) continue;

    const major = majors[0];
    const nationalScore = importance(major);
    const scope = String(major.coverageScope || '').toLowerCase();
    if (nationalScore < 0.60 && !['national','multi_state'].includes(scope)) continue;

    const voices = cluster.filter(isCommunityVoice);
    const voiceCount = distinctVoiceCount(voices);
    const scopeBonus = scope === 'national' ? 18 : scope === 'multi_state' ? 10 : 0;
    const score = (nationalScore * 100) + scopeBonus + (Math.min(voiceCount,5) * 12) +
      (Number(major.confidence || 0) * 10);

    candidates.push({eventKey,cluster,major,voices,voiceCount,score});
  }

  if (!candidates.length) return null;
  const withVoices = candidates.filter(item => item.voiceCount > 0);
  const pool = withVoices.length ? withVoices : candidates;
  return pool.sort((a,b) => b.score - a.score)[0];
}

function deterministicEdition(context, safeStories, discrepancy = {}) {
  const y200 = chooseEraStory(safeStories, 'y200');
  const y76 = chooseEraStory(safeStories, 'y76');
  const leadCluster = chooseNationalLeadCluster(safeStories);
  const leadEventKey = leadCluster?.eventKey || '';
  const y100Major = leadCluster?.major || null;

  const matchedVoices = leadCluster
    ? leadCluster.cluster
        .filter(story => isCommunityVoice(story) && String(story.eventKey) === leadEventKey)
        .sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    : [];

  const y100Black = matchedVoices.find(isBlackVoice) || null;
  const communityTiles = matchedVoices
    .filter(story => story !== y100Black)
    .slice(0,10)
    .map(publicStory);

  const usedUrls = new Set(
    [y100Major, y100Black, ...matchedVoices]
      .filter(Boolean)
      .map(story => story.sourceUrl)
      .filter(Boolean)
  );

  // Different-event y100 stories can be retained as secondary/archive content.
  // They are never presented as a lens on the lead.
  const secondary = safeStories
    .filter(story =>
      story?.eraKey === 'y100' &&
      String(story.eventKey || '') !== leadEventKey &&
      !usedUrls.has(story.sourceUrl)
    )
    .slice(0,6)
    .map(publicStory);

  return {
    editionDate: context.editionDate,
    leadHeadline: y100Major?.title || y200?.title || y76?.title || '',
    leadEventKey,
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
    communityTiles,
    visuals: [],
    sourceSummary: safeStories.slice(0,20).map(story => ({
      publication: story.publication || '',
      archive: story.archive || '',
      sourceUrl: story.sourceUrl || '',
      eventKey: story.eventKey || '',
    })),
    publishedStoryKeys: safeStories.map(story => story.eventKey || story.sourceUrl).filter(Boolean),
    heldForReview: Array.isArray(discrepancy.blocking) ? discrepancy.blocking : [],
    publicationStatus: y100Major || y200 || y76 ? 'published' : 'needs_human',
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
      error: 'Superseded by a new national-headline same-event newsroom run.',
      finished_at: now(),
    }).catch(() => {});
    await update('agent_jobs', `run_id=eq.${old.id}&status=eq.running`, {
      status: 'failed',
      error: 'Superseded by a new national-headline same-event newsroom run.',
      finished_at: now(),
    }).catch(() => {});
  }

  const [run] = await insert('agent_runs', {
    edition_date: context.editionDate,
    status: 'running',
    trigger,
    agent_version: '2026-08-30.same-event.1',
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

  // Completed jobs are idempotent and never rerun.
  const existing = await completedOutput(runId, agentKey);
  if (existing) return { ok: true, reused: true, output: existing, continue: true };

  // A browser refresh/resume must never launch a duplicate expensive AI call.
  // Recent work is polled; genuinely stale work is failed and may be retried.
  const alreadyRunning = await clearStaleRunningJob(runId, agentKey);
  if (alreadyRunning) {
    return {
      ok: true,
      inProgress: true,
      continue: false,
      jobId: alreadyRunning.id,
      output: null,
    };
  }

  const { run, context } = await contextForRun(runId);
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const verifyModel = process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra';
  const job = await createJob(runId, agentKey);

  try {
    let output;

    if (agentKey === 'editor_opening') {
      output = await modelJson(
        editorOpeningPrompt(context),
        { model: verifyModel, webSearch: false, reasoning: 'low', maxOutputTokens: 1800 }
      );
    } else if (RESEARCH_KEYS.includes(agentKey)) {
      const opening = await completedOutput(runId, 'editor_opening') || {};
      const majorDiscovery = agentKey === 'major_press'
        ? null
        : await completedOutput(runId, 'major_press');
      const anchorCandidates = Array.isArray(majorDiscovery?.candidates)
        ? majorDiscovery.candidates
            .filter(item => item?.eraKey === 'y100')
            .sort((a,b) => Number(b?.nationalImportance || 0) - Number(a?.nationalImportance || 0))
            .slice(0,5)
        : [];

      output = await modelJson(
        researchPrompt(agentKey, context, opening.agenda || {}, anchorCandidates),
        { model, webSearch: true, reasoning: 'low', maxOutputTokens: 3800 }
      );
    } else {
      const opening = await completedOutput(runId, 'editor_opening') || {};
      const researchOut = await researchOutputs(runId);
      const research = flattenResearch(researchOut);
      const visualOutput = await completedOutput(runId, 'visual_archive') || { candidates: [] };
      const visuals = visualOutput;

      if (agentKey === 'historical_context') {
        output = await modelJson(contextPrompt(context, research), { model, webSearch: true, reasoning: 'low', maxOutputTokens: 3000 });
      } else if (agentKey === 'translation') {
        const translatable = research.filter(item => {
          const language = String(item?.language || '').trim().toLowerCase();
          return language && !['en','eng','english'].includes(language);
        });
        if (!translatable.length) {
          output = {
            agent: 'translation',
            status: 'complete',
            skipped: true,
            reason: 'No non-English publication candidates require translation.',
            translations: [],
            needsHuman: [],
            discrepancies: [],
            confidence: 1,
          };
        } else {
          output = await modelJson(
            translationPrompt(context, translatable),
            { model, webSearch: false, reasoning: 'low', maxOutputTokens: 2600 }
          );
        }
      } else if (agentKey === 'source_verification') {
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        if (!research.length) throw new Error('No completed research candidates are available for source verification.');

        output = await modelJson(
          verificationPrompt(context, research, { contextual, translation }),
          { model: verifyModel, webSearch: true, reasoning: 'medium', maxOutputTokens: 5200 }
        );

        // ROLLING PUBLISH:
        // As soon as core stories pass Source Verification, publish original
        // text summaries + source links. Rights/visual/social work may continue
        // without holding the public site empty.
        const verificationGate = verificationOnlyGate(output);
        const rollingSafe = safeVerifiedStories(output, verificationGate);

        if (rollingSafe.length) {
          const rollingOutput = {
            agent: 'source_verification',
            status: 'complete',
            edition: deterministicEdition(context, rollingSafe, verificationGate),
            confidence: Math.min(
              ...rollingSafe.map(story => confidence(story.confidence)).filter(Number.isFinite),
              0.75
            ),
            rollingPublish: true,
          };

          const rolling = await persistEditionCore(
            run,
            context,
            rollingOutput,
            output,
            verificationGate
          );

          output = {
            ...output,
            rollingPublish: {
              published: rolling.edition.publicationStatus === 'published',
              publishedStoryCount: rolling.safeStories.length,
              editionId: rolling.savedEdition.id,
              publishedAt: now(),
              mode: 'verified_text_first',
            },
          };
        }
      } else if (agentKey === 'visual_archive') {
        const verified = await completedOutput(runId, 'source_verification');
        if (!verified) throw new Error('Source Verification has not completed.');
        output = await modelJson(
          visualArchivePrompt(context, verified, opening.agenda || {}),
          { model, webSearch: true, reasoning: 'low', maxOutputTokens: 2600 }
        );
      } else if (agentKey === 'rights_review') {
        const verified = await completedOutput(runId, 'source_verification');
        if (!verified) throw new Error('Source Verification has not completed.');
        output = await modelJson(
          rightsPrompt(context, verified, chooseVisuals(visuals)),
          { model: verifyModel, webSearch: true, reasoning: 'low', maxOutputTokens: 3200 }
        );
      } else if (agentKey === 'discrepancy_exception') {
        const verified = await completedOutput(runId, 'source_verification');
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        const rights = await completedOutput(runId, 'rights_review');
        const failures = await failedJobs(runId);
        if (!verified || !rights) throw new Error('Verification and rights review must complete first.');

        const knownIssues = [
          ...(verified.discrepancies || []),
          ...(contextual.discrepancies || []),
          ...(translation.discrepancies || []),
          ...(translation.needsHuman || []),
          ...(rights.discrepancies || []),
          ...failures.filter(f => !NONFATAL_KEYS.has(f.agent_key)),
        ];

        if (!knownIssues.length) {
          output = {
            agent: 'discrepancy_exception',
            status: 'complete',
            publishable: true,
            blocking: [],
            nonBlocking: [],
            humanReviewRequired: false,
            confidence: 1,
            autoResolved: true,
            discrepancies: [],
          };
        } else {
          output = await modelJson(
            discrepancyPrompt(context, { verified, contextual, translation, rights, visuals, agentFailures: failures }),
            { model: verifyModel, webSearch: false, reasoning: 'medium', maxOutputTokens: 3200 }
          );
        }
      } else if (agentKey === 'editor_producer') {
        const coreVerified = await completedOutput(runId, 'source_verification');
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        const rights = await completedOutput(runId, 'rights_review');
        const discrepancy = await completedOutput(runId, 'discrepancy_exception');
        if (!coreVerified || !rights || !discrepancy) throw new Error('Editorial dependencies are incomplete.');

        // Supporting desks continue AFTER the first rolling publication. Verify
        // any new Regional/Community candidates now and fold them into the final
        // edition without delaying the first public stories.
        const supportingOutputs = [];
        for (const key of ['regional_local', 'community_press']) {
          const candidateOutput = await completedOutput(runId, key);
          if (candidateOutput) supportingOutputs.push(candidateOutput);
        }

        const alreadyVerified = new Set((coreVerified.verifiedStories || []).map(storyIdentity));
        const supportingCandidates = flattenResearch(supportingOutputs)
          .filter(story => !alreadyVerified.has(storyIdentity(story)));

        let verified = coreVerified;
        let finalDiscrepancy = discrepancy;

        if (supportingCandidates.length) {
          try {
            const supplemental = await modelJson(
              verificationPrompt(context, supportingCandidates, { contextual, translation }),
              { model: verifyModel, webSearch: true, reasoning: 'low', maxOutputTokens: 3400 }
            );
            verified = mergeVerified(coreVerified, supplemental);

            const supplementGate = verificationOnlyGate(supplemental);
            finalDiscrepancy = {
              ...discrepancy,
              blocking: [
                ...(discrepancy.blocking || []),
                ...(supplementGate.blocking || []),
              ],
              nonBlocking: [
                ...(discrepancy.nonBlocking || []),
                ...(supplementGate.nonBlocking || []),
              ],
              humanReviewRequired: Boolean(discrepancy.humanReviewRequired || supplementGate.blocking.length),
            };
          } catch (supplementError) {
            // Never take down the already-published core edition because a
            // supporting-desk enrichment call failed.
          }
        }

        const safeStories = safeVerifiedStories(verified, finalDiscrepancy);
        if (!safeStories.length) {
          throw new Error('No verified, undisputed stories are available to publish.');
        }

        // TIME-TO-PUBLISH RULE:
        // Put a deterministic verified edition on the public endpoint BEFORE
        // spending time on editorial prose polish or nonessential visuals.
        const immediateOutput = {
          agent: 'editor_producer',
          status: 'complete',
          edition: deterministicEdition(context, safeStories, finalDiscrepancy),
          confidence: Math.min(
            ...safeStories.map(story => confidence(story.confidence)).filter(Number.isFinite),
            0.75
          ),
          discrepancies: [],
          immediatePublish: true,
        };
        const immediate = await persistEditionCore(run, context, immediateOutput, verified, finalDiscrepancy);

        try {
          const polished = await modelJson(
            editorPrompt(
              context,
              { ...verified, verifiedStories: safeStories },
              contextual,
              rights,
              [],
              finalDiscrepancy,
              opening.agenda || {}
            ),
            { model: verifyModel, webSearch: false, reasoning: 'medium', maxOutputTokens: 3800 }
          );

          const polishedPersist = await persistEditionCore(run, context, polished, verified, finalDiscrepancy);
          output = {
            ...polished,
            edition: polishedPersist.edition,
            savedEditionId: polishedPersist.savedEdition.id,
            publishedStoryCount: polishedPersist.safeStories.length,
            immediatePublish: true,
          };
        } catch (editorError) {
          // The public site is already serving the verified deterministic edition.
          output = {
            ...immediateOutput,
            edition: immediate.edition,
            savedEditionId: immediate.savedEdition.id,
            publishedStoryCount: immediate.safeStories.length,
            discrepancies: [{
              type: 'editor_polish_fallback',
              description: `Verified edition published; optional editor polish did not complete: ${editorError.message}`,
            }],
          };
        }
      } else if (agentKey === 'social_editor' || agentKey === 'short_form_video') {
        const editor = await completedOutput(runId, 'editor_producer');
        if (!editor?.edition) throw new Error('Editor & Producer has not completed.');
        output = await modelJson(
          socialPrompt(agentKey, context, editor.edition),
          { model, reasoning: 'low', maxOutputTokens: 2400 }
        );
      } else if (agentKey === 'engagement_trends') {
        const editor = await completedOutput(runId, 'editor_producer');
        if (!editor?.edition) throw new Error('Editor & Producer has not completed.');
        const priorMetrics = await select('social_metrics', 'select=*&order=recorded_at.desc&limit=100').catch(() => []);
        output = await modelJson(
          trendsPrompt(context, editor.edition, priorMetrics),
          { model, reasoning: 'low', maxOutputTokens: 2400 }
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
