import { json, requireCron } from '../http.js';
import { select, update } from '../supabase.js';
import { createQueuedRun, runQueuedStage } from '../queued-pipeline.js';
import { siteDateISO, SITE_TIME_ZONE } from '../site-date.js';

const EDITION_WINDOWS = [
  { hour: 0,  slot: 'morning',       label: 'Morning Edition' },
  { hour: 12, slot: 'afternoon',     label: 'Afternoon Edition' },
  { hour: 18, slot: 'evening',       label: 'Evening Edition' },
  { hour: 22, slot: 'late_breaking', label: 'Late Breaking Edition' },
];

// This preserves the approved bounded-parallel/nonblocking architecture.
// Each cron invocation advances only the current eligible wave.
const WAVES = [
  { name: 'Opening Desk', agents: ['editor_opening'], concurrency: 1 },
  {
    name: 'Research Desk',
    agents: ['black_press','major_press','regional_local','community_press'],
    concurrency: 2,
  },
  {
    name: 'Context + Translation',
    agents: ['historical_context','translation'],
    concurrency: 2,
  },
  { name: 'Source Verification', agents: ['source_verification'], concurrency: 1 },
  { name: 'Rights Review', agents: ['rights_review'], concurrency: 1 },
  { name: 'Exception Control', agents: ['discrepancy_exception'], concurrency: 1 },
  { name: 'Closing Desk / Publisher', agents: ['editor_producer'], concurrency: 1 },
  {
    name: 'Post-Publish Features',
    agents: [
      'then_now',
      'archive_recipe',
      'visual_archive',
      'social_editor',
      'short_form_video',
      'engagement_trends',
    ],
    concurrency: 3,
  },
  { name: 'Illustration Placement', agents: ['illustrator'], concurrency: 1 },
  { name: 'Social Distribution', agents: ['social_distribution'], concurrency: 1 },
];

const NONCRITICAL = new Set([
  'editor_opening',
  'black_press',
  'major_press',
  'regional_local',
  'community_press',
  'historical_context',
  'translation',
  'visual_archive',
  'illustrator',
  'then_now',
  'archive_recipe',
  'social_editor',
  'short_form_video',
  'engagement_trends',
  'social_distribution',
]);

function localClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return {
    hour: Number(map.hour),
    minute: Number(map.minute),
    isoDate: `${map.year}-${map.month}-${map.day}`,
  };
}

function currentWindow(clock) {
  // Cron wakes every 2 minutes. A 10-minute opening makes the trigger resilient
  // to a delayed invocation while idempotency prevents duplicates.
  if (clock.minute >= 10) return null;
  return EDITION_WINDOWS.find(item => item.hour === clock.hour) || null;
}

async function windowAlreadyCreated(date, slot) {
  const rows = await select(
    'agent_runs',
    `select=id,trigger,status,started_at&edition_date=eq.${encodeURIComponent(date)}&order=started_at.desc&limit=50`
  ).catch(() => []);

  return rows.some(row => String(row.trigger || '') === `cron:${slot}`);
}

async function ensureScheduledRun(clock) {
  const window = currentWindow(clock);
  if (!window) return null;

  if (await windowAlreadyCreated(clock.isoDate, window.slot)) {
    return null;
  }

  const created = await createQueuedRun({
    date: clock.isoDate,
    trigger: `cron:${window.slot}`,
  });

  return {
    runId: created?.run?.id,
    slot: window.slot,
    label: window.label,
    created: true,
  };
}

async function activeAutomaticRun(date) {
  const rows = await select(
    'agent_runs',
    `select=*&edition_date=eq.${encodeURIComponent(date)}&status=eq.running&order=started_at.desc&limit=20`
  ).catch(() => []);

  return rows.find(row => String(row.trigger || '').startsWith('cron:')) || null;
}

async function jobsForRun(runId) {
  return select(
    'agent_jobs',
    `select=*&run_id=eq.${runId}&order=created_at.desc&limit=500`
  ).catch(() => []);
}

function latestByAgent(jobs) {
  const map = new Map();
  for (const job of jobs) {
    if (!map.has(job.agent_key)) map.set(job.agent_key, job);
  }
  return map;
}

function attemptCount(jobs, agentKey) {
  return jobs.filter(job => job.agent_key === agentKey).length;
}

function terminal(job, agentKey) {
  if (!job) return false;
  if (job.status === 'complete') return true;
  if (job.status === 'failed' && NONCRITICAL.has(agentKey)) return true;
  return false;
}

async function advanceRun(run) {
  const jobs = await jobsForRun(run.id);
  const latest = latestByAgent(jobs);

  for (const wave of WAVES) {
    const priorDone = WAVES
      .slice(0, WAVES.indexOf(wave))
      .every(previous =>
        previous.agents.every(agentKey => terminal(latest.get(agentKey), agentKey))
      );

    if (!priorDone) {
      return {
        advanced: false,
        waitingFor: 'prior_wave',
        wave: wave.name,
      };
    }

    const unresolved = wave.agents.filter(agentKey => {
      const job = latest.get(agentKey);
      return !terminal(job, agentKey);
    });

    if (!unresolved.length) continue;

    // Critical failures get one automatic retry. After two failed attempts,
    // the run stays failed instead of looping forever.
    for (const agentKey of unresolved) {
      const job = latest.get(agentKey);
      if (
        job?.status === 'failed' &&
        !NONCRITICAL.has(agentKey) &&
        attemptCount(jobs, agentKey) >= 2
      ) {
        await update('agent_runs', `id=eq.${run.id}`, {
          status: 'failed',
          error: `${agentKey} failed twice during automatic publishing.`,
          finished_at: new Date().toISOString(),
        }).catch(() => {});

        return {
          advanced: false,
          stopped: true,
          criticalAgent: agentKey,
          reason: 'critical_agent_failed_twice',
        };
      }
    }

    const runnable = unresolved
      .filter(agentKey => {
        const job = latest.get(agentKey);
        return !job || ['queued','failed','running'].includes(job.status);
      })
      .slice(0, wave.concurrency);

    if (!runnable.length) {
      return {
        advanced: false,
        waitingFor: 'current_wave',
        wave: wave.name,
      };
    }

    const results = await Promise.allSettled(
      runnable.map(agentKey => runQueuedStage(run.id, agentKey))
    );

    return {
      advanced: true,
      wave: wave.name,
      agents: runnable,
      results: results.map((result, index) => ({
        agent: runnable[index],
        ok: result.status === 'fulfilled' && result.value?.ok === true,
        inProgress:
          result.status === 'fulfilled' && result.value?.inProgress === true,
        error:
          result.status === 'rejected'
            ? result.reason?.message
            : result.value?.error || null,
      })),
    };
  }

  return {
    advanced: false,
    complete: true,
  };
}

export default async function handler(req, res) {
  if (!requireCron(req, res)) return;

  try {
    const clock = localClock();
    const siteDate = siteDateISO();

    // 1. Create a scheduled run only at the four daily local windows.
    const scheduled = await ensureScheduledRun({
      ...clock,
      isoDate: siteDate,
    });

    // 2. On every two-minute wake-up, advance any active automatic run.
    const run = await activeAutomaticRun(siteDate);

    if (!run) {
      return json(res, 200, {
        ok: true,
        automatic: true,
        siteDate,
        siteTimeZone: SITE_TIME_ZONE,
        scheduled,
        activeRun: false,
        message: scheduled
          ? 'Scheduled newsroom run created; worker will advance it on subsequent cron invocations.'
          : 'No automatic newsroom run currently needs work.',
      });
    }

    const progress = await advanceRun(run);

    return json(res, 200, {
      ok: true,
      automatic: true,
      siteDate,
      siteTimeZone: SITE_TIME_ZONE,
      scheduled,
      activeRun: true,
      runId: run.id,
      trigger: run.trigger,
      progress,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      automatic: true,
      error: error.message,
    });
  }
}
