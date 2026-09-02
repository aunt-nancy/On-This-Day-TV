export const EXPECTED_AGENT_COUNT = 19;
export const AGENT_ROSTER_VERSION = '2026-09-01.three-era-editorial-identity.1';

export const AGENTS = [
  { key: 'editor_opening', name: 'Editor & Producer — Opening Desk', group: 'editorial', phase: 'assignment', priority: 1, automatic: true },
  { key: 'black_press', name: 'African American / Black Press Research Agent', group: 'research', phase: 'core_research', priority: 2, automatic: true },
  { key: 'major_press', name: 'Major American Press Research Agent', group: 'research', phase: 'core_research', priority: 3, automatic: true },
  { key: 'source_verification', name: 'Source Verification Agent', group: 'verification', phase: 'verification', priority: 4, automatic: true },
  { key: 'discrepancy_exception', name: 'Discrepancy & Exception Agent', group: 'verification', phase: 'exception_control', priority: 5, automatic: true },
  { key: 'regional_local', name: 'Regional & Local Press Agent', group: 'research', phase: 'supporting_research', priority: 6, automatic: true },
  { key: 'community_press', name: 'Community Press Voices Agent', group: 'research', phase: 'supporting_research', priority: 7, automatic: true },
  { key: 'historical_context', name: 'Historical Context Agent', group: 'analysis', phase: 'context', priority: 8, automatic: true },
  { key: 'rights_review', name: 'Rights & Reuse Agent', group: 'verification', phase: 'reuse_review', priority: 9, automatic: true },
  { key: 'translation', name: 'Historical Translation Agent', group: 'analysis', phase: 'conditional_translation', priority: 10, automatic: true },
  { key: 'visual_archive', name: 'Visual Archive Agent', group: 'production', phase: 'verified_visuals', priority: 11, automatic: true },
  { key: 'editor_producer', name: 'Editor & Producer — Closing Desk', group: 'editorial', phase: 'publish', priority: 12, automatic: true },
  { key: 'then_now', name: 'Then & Now Context Agent', group: 'editorial', phase: 'post_publish_context', priority: 13, automatic: true },
  { key: 'archive_recipe', name: 'Recipe From the Archives Agent', group: 'editorial', phase: 'archive_feature', priority: 14, automatic: true },
  { key: 'illustrator', name: 'Illustrator / Visual Placement Agent', group: 'production', phase: 'post_publish_illustration', priority: 15, automatic: true },
  { key: 'social_editor', name: 'Social Editor Agent', group: 'social', phase: 'social_creation', priority: 16, automatic: true },
  { key: 'short_form_video', name: 'Short-Form Video Agent', group: 'social', phase: 'social_creation', priority: 17, automatic: true },
  { key: 'engagement_trends', name: 'Engagement & Trends Agent', group: 'social', phase: 'optimization', priority: 18, automatic: true },
  { key: 'social_distribution', name: 'Social Distribution Agent', group: 'social', phase: 'distribution', priority: 19, automatic: true },
];

export const COMMUNITY_PRIORITY = [
  'african_american',
  'latino_spanish_language',
  'german_american',
  'british_american',
  'irish_american',
  'chinese_american',
  'italian_american',
  'jewish_american',
  'japanese_american',
  'indigenous_native',
  'caribbean',
  'south_asian',
  'filipino_american',
  'armenian_american',
  'greek_american',
  'polish_american',
];

export function computeEditionDate(inputDate) {
  const date = inputDate ? new Date(`${inputDate}T12:00:00Z`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date; expected YYYY-MM-DD');
  const iso = date.toISOString().slice(0, 10);
  const year = date.getUTCFullYear();
  return {
    editionDate: iso,
    month: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
    day: date.getUTCDate(),
    currentYear: year,
    years: { y200: year - 200, y100: year - 100, y75: year - 75 },
  };
}

export function sourceRules() {
  return {
    preferredArchives: [
      'Library of Congress Chronicling America / historic newspaper scans',
      'American Antiquarian Society newspaper collections',
      'Readex / America’s Historical Newspapers when accessible',
      'individual newspaper historical archives and digitized backfiles',

      'Howard University Black Press Archives / Moorland-Spingarn Research Center',
      'Schomburg Center for Research in Black Culture',
      'Freedom’s Journal and other digitized Black Press collections',
      'Sequoyah National Research Center',
      'Hoji Shinbun Digital Collection',

      'California Digital Newspaper Collection — University of California, Riverside',
      'Georgia Historic Newspapers — University of Georgia Libraries',
      'Pennsylvania Newspaper Archive — Penn State University Libraries',
      'Illinois Digital Newspaper Collections — University of Illinois',
      'Hoosier State Chronicles — Indiana University',
      'Nebraska Newspapers — University of Nebraska–Lincoln',
      'Utah Digital Newspapers — University of Utah',
      'Oregon Digital Newspaper Program / Historic Oregon Newspapers — University of Oregon',
      'Florida Digital Newspaper Library — University of Florida',
      'DigitalNC / North Carolina historic newspapers — university and state partners',
      'South Carolina Digital Newspaper Program — University of South Carolina Libraries',
      'Portal to Texas History / Texas Digital Newspaper Program — University of North Texas',
      'Washington Digital Newspapers — Washington State Library / university partners',
      'Colorado Historic Newspapers Collection',
      'Arizona historical newspaper collections / state and university archives',
      'New Mexico historical newspaper collections / University of New Mexico and state partners',
      'Papakilo Database / Hawaiian-language and Hawaiʻi newspaper collections',
      'Recovering the U.S. Hispanic Literary Heritage — University of Houston',
      'Immigration History Research Center Archives — University of Minnesota',
      'American Jewish Historical Society / Center for Jewish History',
      'Library of Congress AAPI serial and newspaper research guides',
      'Los Angeles Public Library historical newspaper databases, including Los Angeles Sentinel holdings when accessible',

      'state historical society newspaper archives',
      'state library newspaper archives',
      'university libraries, university presses, special collections, and digitization projects',
      'local historical society newspaper archives',
    ],

    historicallyImportantNewspapers: {
      earlyRepublicAndAntebellum: [
        'National Intelligencer / Daily National Intelligencer',
        'New-York Evening Post / New York Evening Post',
        'Connecticut Courant / Hartford Courant',
        'New-Hampshire Gazette',
        'Providence Gazette',
        'Newport Mercury',
        'Columbian Centinel',
        'Boston Commercial Gazette',
        'Richmond Enquirer',
        'Charleston Courier',
        'Baltimore Patriot and other major Baltimore papers of the period',
        'Savannah Republican and other established Southern papers of the period',
        'Niles’ Weekly Register when newspaper coverage is sparse and it provides contemporaneous national context',
      ],

      nineteenthAndTwentiethCenturyNational: [
        'The New York Times',
        'The Washington Post',
        'The Wall Street Journal',
        'The Christian Science Monitor',
        'The Baltimore Sun',
        'The Philadelphia Inquirer',
        'Chicago Tribune',
        'Los Angeles Times',
        'Boston Globe',
        'San Francisco Chronicle',
        'Atlanta Constitution / Atlanta Journal',
        'St. Louis Post-Dispatch',
        'Cleveland Plain Dealer',
        'Detroit Free Press',
        'New Orleans Times-Picayune',
      ],
    },

    editorialIdentity: {
      y100: 'Civic center. The 100-year headline is the edition’s central national conversation and the sole anchor for Community Press Voices.',
      y200: 'Deep archive. Treat the 200-year desk as historical distance: reconstruct the older world on its own terms, explain unfamiliar institutions/language/assumptions, and avoid forcing modern judgments into the source.',
      y75: 'Living memory. Treat the 75-year desk as history close enough to be reexamined with later evidence and memory in mind. Some people who lived through the period, and many immediate family/community witnesses to its consequences, may still be alive; never claim a specific person is alive without evidence.',
    },

    leadSelectionRules: [
      'For each era, identify the newspapers with the largest documented circulation or subscriber reach in that historical year before selecting the national lead.',
      'The primary national headline must come from the exact-date issue of a highest-circulation or otherwise demonstrably widest-reach newspaper of that era, because those papers had the greatest contemporary opinion-shaping reach.',
      'Do not substitute modern prestige, present-day reputation, or archive convenience for historical circulation evidence.',
      'When several top-circulation papers lead with the same event, that shared event is the strongest national-lead signal.',
      'When top-circulation papers differ, rank by documented circulation/reach, front-page prominence, number of other leading papers carrying the same event, and national consequence.',
      'Use the actual printed newspaper headline when it can be verified from the issue scan or archival record; do not invent a modernized headline.',
      'If exact circulation numbers are unavailable, use the best documented contemporaneous proxy for reach or influence and record the limitation in evidenceNotes.',
    ],

    communityEditorialRules: [
      'Community Press Voices is part of the 100-year center feature only. Every Community Press Voices item must revolve around the selected y100 national headline through direct coverage, editorial reaction, consequences, stakes, local impact, or a clearly documented community response to that same event.',
      'A Community Press Voices story that covers the y100 headline must preserve the y100 lead eventKey and comparisonType="same_event".',
      'Do not use unrelated same-date community stories as fallback tiles in Community Press Voices. If meaningful y100 same-event community coverage cannot be verified, record "not found in the issues searched" and leave that community comparison unavailable rather than filling the category.',
      'Community framing may emphasize civil rights, labor, immigration, business, education, public safety, religion, politics, culture, neighborhood consequences, or other community-specific stakes, but the factual connection to the y100 headline must be explicit.',
      'Never imply that a community reacted to the y100 headline unless the source actually documents that relationship.',
      'Never invent a community story merely to fill a category.',
    ],

    searchRules: [
      'CIRCULATION FIRST: before choosing a national lead for y200, y100, or y75, identify the highest-circulation or widest-reach newspapers publishing in that historical year and inspect their exact-date issues.',
      'For y200/1826-era research, deliberately search newspapers that were actually publishing in the early Republic; do not rely mainly on modern newspaper brands that did not yet exist.',
      'Y200 DEEP-ARCHIVE LENS: explain the period on its own terms. Preserve historical language and institutional context, identify what would be unfamiliar to a modern reader, distinguish later labels from the newspaper’s own vocabulary, and avoid presentism.',
      'For y75 / the 75-years-ago era, search the highest-circulation national and metropolitan newspapers of that year before lower-circulation regional papers.',
      'Y75 LIVING-MEMORY LENS: after establishing the exact-date headline, deliberately identify what later evidence clarified, corrected, complicated, or revealed about the story. Where reliable sources exist, note continuing institutions, communities, witnesses, oral histories, or consequences that connect the event to living memory. Do not require a living witness for publication and never assert a specific person is alive without evidence.',
      'For y100, begin with the highest-circulation newspapers of that year and use same-day front-page prominence across those papers to identify the national story that most shaped public attention.',
      'When one archive lacks an issue, move horizontally to other top-circulation newspapers from the same date and vertically to university/state digitized newspaper collections.',
      'Do not stop after the first search engine result or first archive failure.',
      'A university library, university press archive, special collection, or state newspaper digitization project is an acceptable institutional source when it provides an identifiable original issue/page.',
      'Prefer the original issue scan or institutionally hosted page image over a later secondary summary.',
      'Cross-check nationally important stories across more than one high-circulation credible newspaper when practical.',
      'For community presses, search ONLY for coverage, reaction, consequences, or local/community stakes tied to the selected y100 national headline; do not fill Community Press Voices with an unrelated same-date story.',
    ],

    rules: [
      'Use the original issue or institutional archive as primary evidence whenever available.',
      'Never invent a newspaper, headline, issue date, page number, quotation, archive, circulation figure, or URL.',
      'A failure to find coverage is not proof that coverage did not exist.',
      'Use “not found in the issues searched” rather than “ignored” unless a methodologically sufficient search supports that conclusion.',
      'Separate what a newspaper reported from what later evidence established.',
      'National leads for y200, y100, and y75 are circulation-first: select from the era’s highest-circulation/widest-reach newspapers using the exact-date issue and front-page prominence, not modern prestige.',
      'The three eras have different editorial jobs: y200 = deep archive and historical distance; y100 = the central national conversation; y75 = living-memory reexamination with later evidence and continuing consequences in view.',
      'For the 100-year center feature, Major American Press establishes the nationally significant event. Black Press and all other Community Press Voices serve as same-event lenses on that y100 headline when verified.',
      'Do not publish an unrelated independent community lead inside Community Press Voices. A missing same-event community voice is an honest research result, not a slot that must be filled.',
      'At y75, distinguish contemporaneous reporting from what later evidence established, and surface meaningful changes in interpretation, impact, or public understanding without rewriting the original record.',
      'At y200, provide enough context to make the distant world legible while preserving the source’s period language, assumptions, and uncertainty.',
      'British American and German American press remain represented in the community source system when they provide verified y100 same-event coverage.',
    ],
  };
}

export function assertAgentRoster() {
  if (AGENTS.length !== EXPECTED_AGENT_COUNT) {
    throw new Error(
      `Agent roster mismatch: expected ${EXPECTED_AGENT_COUNT}, loaded ${AGENTS.length}. Deployment is stale or incomplete.`
    );
  }

  const priorities = new Set(AGENTS.map(agent => agent.priority));
  const keys = new Set(AGENTS.map(agent => agent.key));

  if (priorities.size !== EXPECTED_AGENT_COUNT || keys.size !== EXPECTED_AGENT_COUNT) {
    throw new Error('Agent roster contains duplicate priority numbers or duplicate agent keys.');
  }

  for (let priority = 1; priority <= EXPECTED_AGENT_COUNT; priority++) {
    if (!priorities.has(priority)) {
      throw new Error(`Agent roster is missing priority #${priority}.`);
    }
  }

  return {
    ok: true,
    expected: EXPECTED_AGENT_COUNT,
    actual: AGENTS.length,
    version: AGENT_ROSTER_VERSION,
  };
}

// Fail fast during module load. Partial/stale rosters must never silently run.
assertAgentRoster();
