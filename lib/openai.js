function outputText(response) {
  const parts = [];
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

class JsonOutputError extends Error {
  constructor(message, rawText = '') {
    super(message);
    this.name = 'JsonOutputError';
    this.rawText = rawText;
  }
}

function parseJson(text) {
  if (!text) throw new JsonOutputError('Agent returned an empty JSON response', '');

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const attempts = [candidate];

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    attempts.push(candidate.slice(start, end + 1));
  }

  let lastError = null;
  for (const attempt of [...new Set(attempts)]) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }

  throw new JsonOutputError(
    `Agent returned malformed JSON: ${lastError?.message || 'unknown JSON syntax error'}`,
    candidate
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelayMs(response, data, attempt) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 500), 12000);
  }

  const message = JSON.stringify(data || {});
  const match = message.match(/try again in\s+([\d.]+)\s*(ms|s)/i);
  if (match) {
    const amount = Number(match[1]);
    const ms = match[2].toLowerCase() === 's' ? amount * 1000 : amount;
    return Math.min(Math.max(ms + 250, 500), 12000);
  }

  return Math.min(900 * Math.pow(2, attempt - 1), 5000);
}

function outputLimit(reasoning) {
  // Deliberately smaller reservations. The old 6k/9k/12k reservations made
  // parallel research unnecessarily expensive against OpenAI TPM limits.
  if (reasoning === 'high') return 6500;
  if (reasoning === 'medium') return 4500;
  return 2800;
}

export function requestTimeoutMs(override, webSearch=false) {
  const hasOverride = override !== undefined && override !== null && override !== '';
  const fallback = webSearch ? 150000 : 80000;
  const configured = Number(hasOverride
    ? override
    : (process.env.OTD_OPENAI_TIMEOUT_MS || fallback));
  const safeConfigured = Number.isFinite(configured) ? configured : fallback;

  // Explicit stage budgets are authoritative. Major Press and Source
  // Verification deliberately use 60s and 55s limits so one slow archive
  // lookup cannot consume an entire scheduler invocation. Search-backed desks
  // without a stage budget retain the longer archival-search default.
  if (hasOverride) return Math.max(20000, Math.min(safeConfigured, 110000));
  if (webSearch) return Math.max(80000, Math.min(safeConfigured, 180000));
  return Math.max(20000, Math.min(safeConfigured, 110000));
}

export async function runModel({
  instructions,
  input,
  model,
  webSearch = false,
  reasoning = 'low',
  maxOutputTokens,
  timeoutMs,
}) {
  const body = {
    model: model || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    instructions,
    input,
    reasoning: { effort: reasoning },
    max_output_tokens: maxOutputTokens || outputLimit(reasoning),
    store: false,
  };

  if (webSearch) body.tools = [{ type: 'web_search' }];

  let lastError = null;

  // OpenAI-level retries are limited to rate-limit recovery. JSON retries are
  // handled by the newsroom layer so we do not multiply retries accidentally.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const effectiveTimeoutMs = requestTimeoutMs(timeoutMs, webSearch);
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OTD_OPENAI_KEY || process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error?.name === 'AbortError') {
        throw new Error(`OpenAI request timed out after ${Math.round(effectiveTimeoutMs / 1000)} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: { message: 'OpenAI returned a non-JSON HTTP response' } };
    }

    if (response.ok) {
      const text = outputText(data);
      return {
        data,
        text,
        json: parseJson(text),
        responseId: data.id || null,
      };
    }

    lastError = new Error(`OpenAI ${response.status}: ${JSON.stringify(data)}`);

    if (response.status !== 429 || attempt === 2) {
      throw lastError;
    }

    const jitter = Math.floor(Math.random() * 250);
    await sleep(retryDelayMs(response, data, attempt) + jitter);
  }

  throw lastError || new Error('OpenAI request failed');
}
