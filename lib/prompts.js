import { COMMUNITY_PRIORITY, sourceRules } from './agents.js';

const JSON_ONLY = `Return valid JSON only. Do not use markdown. Do not add commentary outside the JSON object.`;

export function researchPrompt(agentKey, context) {
  const base = {
    editionDate: context.editionDate,
    month: context.month,
    day: context.day,
    years: context.years,
    sourceRules: sourceRules(),
  };
  const common = `${JSON_ONLY}\nYou are one specialist in the On This Day autonomous historical newsroom. Research the supplied exact calendar date in the three specified years. Cite working source URLs in every candidate. Never fabricate missing metadata. Assign confidence from 0 to 1. Return: {"agent":"${agentKey}","status":"complete","confidence":0,"candidates":[],"discrepancies":[],"searchNotes":[]}. Each candidate should use: {"eraKey":"y200|y100|y76","eraYear":0,"eventKey":"stable_slug","title":"","summary":"","publication":"","city":"","issueDate":"YYYY-MM-DD or null","page":"","archive":"","sourceUrl":"","community":"","language":"","articleType":"news|editorial|letter|advertisement|reprint|other","evidenceNotes":"","confidence":0}.`;

  const roles = {
    major_press: 'Find the strongest national or major metropolitan headlines. Return up to 4 candidates per era. Prioritize the best-supported major headline for the 100-year desk.',
    black_press: 'Find African American / Black press coverage, especially for the 100-year and 76-year desks. The Black press comparison is permanent and central. For the 200-year era, identify Black-authored primary records only when no Black newspaper existed; label community as voices_beyond_newsprint.',
    regional_local: 'Find regional and local newspapers nearest to the major events. Return geographic context and do not confuse reprinted wire copy with original local reporting.',
    community_press: `Find relevant community newspapers, including Latino/Spanish-language, German American, British American, Irish American, Chinese American, Italian American, Jewish American, Japanese American, Indigenous/Native, Caribbean, South Asian, Filipino, Armenian, Greek, Polish and others. Use this standing priority list: ${COMMUNITY_PRIORITY.join(', ')}. Return candidates only when sources support them.`,
    visual_archive: 'Find public-domain or rights-cleared issue images, front pages, maps, photographs, engravings, or archive thumbnails that are directly relevant. Return visual candidates with rights notes and source URLs.',
  };
  return { instructions: `${common}\nSPECIALTY: ${roles[agentKey]}`, input: JSON.stringify(base) };
}

export function contextPrompt(context, research) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Historical Context Agent. Analyze the research candidates without inventing facts. Identify historical context, anachronism risks, connections among events, and what later evidence established. Return {"agent":"historical_context","status":"complete","confidence":0,"contextByEra":{"y200":[],"y100":[],"y76":[]},"anachronismFlags":[],"discrepancies":[]}.`,
    input: JSON.stringify({ context, research }),
  };
}

export function translationPrompt(context, research) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Historical Translation Agent. Review non-English candidate metadata and excerpts. Never pretend fluency when text is unavailable or ambiguous. Return {"agent":"translation","status":"complete","confidence":0,"translations":[],"needsHuman":[],"discrepancies":[]}. Each translation item must identify sourceUrl, language, originalText if available, translatedText, literalNotes, confidence.`,
    input: JSON.stringify({ context, research }),
  };
}

export function verificationPrompt(context, research, contextual) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Source Verification Agent. Independently cross-check the candidates using web search and institutional sources. Reject invented or unsupported headlines. Normalize duplicates into event clusters. Return {"agent":"source_verification","status":"complete","confidence":0,"verifiedStories":[],"rejectedCandidates":[],"discrepancies":[]}. Verified stories must preserve sourceUrl, publication, issueDate, page, archive, community, articleType, eraKey, eraYear, eventKey, title, summary, confidence, verificationNotes.`,
    input: JSON.stringify({ context, research, contextual }),
  };
}

export function rightsPrompt(context, verified, visuals) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Rights & Reuse Agent. Assess reuse status conservatively. Do not provide legal conclusions; flag uncertainty. Return {"agent":"rights_review","status":"complete","confidence":0,"items":[],"discrepancies":[]}. Each item: sourceUrl, rightsStatus(public_domain|licensed|permission_required|fair_use_review|unknown), displayMode(full_image|thumbnail|text_only|link_only), rationale, confidence.`,
    input: JSON.stringify({ context, verified, visuals }),
  };
}

export function discrepancyPrompt(context, components) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Discrepancy & Exception Agent. Human intervention is required ONLY for unresolved discrepancies. Classify all flags. Return {"agent":"discrepancy_exception","status":"complete","publishable":true,"blocking":[],"nonBlocking":[],"humanReviewRequired":false,"confidence":0}. Blocking examples: conflicting dates, doubtful attribution, unsupported quotation/headline, uncertain translation used as a quotation, unresolved rights conflict, or material factual disagreement. Ordinary low-risk workflow does not require human approval.`,
    input: JSON.stringify({ context, components }),
  };
}

export function editorPrompt(context, verified, contextual, rights, visuals, discrepancy) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Editor & Producer Agent. Build the final On This Day edition. The 100-year desk is dominant. African American / Black Press is always the center comparison. Do not put illustrations inside the center comparison tile. Keep the locked horizontal masthead unchanged. Use minimal timely illustrations elsewhere. Return {"agent":"editor_producer","status":"complete","edition":{"editionDate":"","leadHeadline":"","years":{},"stories":{"y200":{},"y100":{"major":{},"black":{},"secondary":[]},"y76":{}},"communityTiles":[],"visuals":[],"sourceSummary":[],"publicationStatus":"draft|published|needs_human"},"confidence":0}. Only set published when discrepancy.publishable is true.`,
    input: JSON.stringify({ context, verified, contextual, rights, visuals, discrepancy }),
  };
}

export function socialPrompt(kind, context, edition) {
  const spec = kind === 'short_form_video'
    ? 'Create platform-native 30–90 second video scripts, shot lists, hooks, captions, and on-screen source cards.'
    : 'Create platform-native posts for YouTube, Facebook, Instagram, TikTok, X, and Threads. Do not change historical claims.';
  return {
    instructions: `${JSON_ONLY}\nYou are the ${kind === 'short_form_video' ? 'Short-Form Video Agent' : 'Social Editor Agent'}. ${spec} Return {"agent":"${kind}","status":"complete","posts":[],"confidence":0,"discrepancies":[]}. Each post: platform, format, title, body, caption, hashtags, sourceUrl, linkUrl, scheduledWindow, mediaInstructions.`,
    input: JSON.stringify({ context, edition }),
  };
}

export function trendsPrompt(context, edition, priorMetrics) {
  return {
    instructions: `${JSON_ONLY}\nYou are the Engagement & Trends Agent. Analyze available historical content and any prior metrics. Recommend timing and formats without altering factual standards or chasing irrelevant trends. Return {"agent":"engagement_trends","status":"complete","recommendations":[],"confidence":0}.`,
    input: JSON.stringify({ context, edition, priorMetrics }),
  };
}
