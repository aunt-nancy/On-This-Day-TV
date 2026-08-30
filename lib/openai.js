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

function parseJson(text) {
  if (!text) throw new Error('Agent returned an empty response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate.trim()); } catch {}
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
  throw new Error(`Agent response was not valid JSON: ${text.slice(0, 300)}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelayMs(response, data, attempt) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 500), 15000);
  }

  const message = JSON.stringify(data || {});
  const match = message.match(/try again in\s+([\d.]+)\s*(ms|s)/i);
  if (match) {
    const amount = Number(match[1]);
    const ms = match[2].toLowerCase() === 's' ? amount * 1000 : amount;
    return Math.min(Math.max(ms + 350, 500), 15000);
  }

  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

function outputLimit(reasoning) {
  // Prevent several simultaneous agents from reserving the model's very large
  // default output allowance and exhausting the project's token-per-minute limit.
  if (reasoning === 'high') return 12000;
  if (reasoning === 'medium') return 9000;
  return 6000;
}

export async function runModel({
  instructions,
  input,
  model,
  webSearch = false,
  reasoning = 'low',
  maxOutputTokens,
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

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OTD_OPENAI_KEY || process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

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

    if (response.status !== 429 || attempt === 3) {
      throw lastError;
    }

    // Respect rate-limit recovery rather than failing the whole research lane.
    const jitter = Math.floor(Math.random() * 350);
    await sleep(retryDelayMs(response, data, attempt) + jitter);
  }

  throw lastError || new Error('OpenAI request failed');
}
