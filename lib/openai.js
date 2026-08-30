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

export async function runModel({ instructions, input, model, webSearch = false, reasoning = 'low' }) {
  const body = {
    model: model || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    instructions,
    input,
    reasoning: { effort: reasoning },
    store: false,
  };
  if (webSearch) body.tools = [{ type: 'web_search' }];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(data)}`);
  const text = outputText(data);
  return { data, text, json: parseJson(text), responseId: data.id || null };
}
