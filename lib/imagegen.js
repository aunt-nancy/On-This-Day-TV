function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryableStatus(status) {
  return status === 429 || status >= 500;
}

function errorMessage(data, fallback) {
  return data?.error?.message || data?.message || fallback;
}

export async function generateHistoricalIllustration({ story, eraLabel }) {
  if (!story?.title) throw new Error('Illustration requires a verified story headline.');

  const apiKey = process.env.OTD_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OTD_OPENAI_KEY is missing; image generation cannot start.');

  const prompt = [
    'Create a restrained editorial historical illustration for the On This Day American history news site.',
    `Historical window: ${eraLabel}.`,
    `Verified headline/topic: ${story.title}.`,
    story.summary ? `Verified context: ${story.summary}` : '',
    story.publication ? `Source publication: ${story.publication}.` : '',
    'Style: period-inspired pen-and-ink newspaper engraving with a restrained sepia wash.',
    'Historically plausible clothing, architecture, transportation, tools, and setting for the era.',
    'This is an EDITORIAL ILLUSTRATION, not an archival photograph and not documentary evidence.',
    'No readable text. No logos. No watermarks. No dates. No fake newspaper mastheads.',
    'Do not depict specific factual details that are not supported by the verified headline/context.',
    'Landscape composition for a narrow newspaper side-story illustration area.',
    'Leave visual breathing room around the principal subject so cropping remains safe.',
  ].filter(Boolean).join('\n');

  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OTD_IMAGE_MODEL || 'gpt-image-2',
          prompt,
          size: '1536x1024',
          quality: 'low',
          n: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      lastError = error?.name === 'AbortError'
        ? new Error('GPT-Image-2 request timed out after 150 seconds.')
        : error;

      if (attempt === 1) {
        await sleep(1200);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      lastError = new Error(
        `GPT-Image-2 ${response.status}: ${errorMessage(data, 'Image generation failed')}`
      );

      if (attempt === 1 && retryableStatus(response.status)) {
        await sleep(response.status === 429 ? 2500 : 1200);
        continue;
      }
      throw lastError;
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      lastError = new Error(
        `GPT-Image-2 returned HTTP 200 but no image payload. Response id: ${data?.id || 'unknown'}`
      );
      if (attempt === 1) {
        await sleep(800);
        continue;
      }
      throw lastError;
    }

    return {
      bytes: Buffer.from(b64, 'base64'),
      contentType: 'image/png',
      model: process.env.OTD_IMAGE_MODEL || 'gpt-image-2',
      responseId: data?.id || null,
    };
  }

  throw lastError || new Error('GPT-Image-2 generation failed.');
}
