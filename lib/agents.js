export const EXPECTED_AGENT_COUNT = 19;
export const AGENT_ROSTER_VERSION = '2026-08-31.consolidated19.1';

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

    searchRules: [
      'For y200/1826-era research, deliberately search newspapers that were actually publishing in the early Republic; do not rely mainly on modern newspaper brands that did not yet exist.',
      'For y75 / the 75-years-ago era, search national papers of record AND multiple major credible regional newspapers before concluding that no strong headline exists.',
      'When one archive lacks an issue, move horizontally to other newspapers from the same date and vertically to university/state digitized newspaper collections.',
      'Do not stop after the first search engine result or first archive failure.',
      'A university library, university press archive, special collection, or state newspaper digitization project is an acceptable institutional source when it provides an identifiable original issue/page.',
      'Prefer the original issue scan or institutionally hosted page image over a later secondary summary.',
      'Cross-check nationally important stories across more than one credible newspaper when practical.',
    ],

    rules: [
      'Use the original issue or institutional archive as primary evidence whenever available.',
      'Never invent a newspaper, headline, issue date, page number, quotation, archive, or URL.',
      'A failure to find coverage is not proof that coverage did not exist.',
      'Use “not found in the issues searched” rather than “ignored” unless a methodologically sufficient search supports that conclusion.',
      'Separate what a newspaper reported from what later evidence established.',
      'For the 100-year center feature, Major American Press establishes the nationally significant event. Black Press and other community presses are same-event lenses when verified; unrelated community stories remain clearly separate community leads.',
      'Non-Black community tiles are ranked by population significance and/or the strength of the day’s relevant headline.',
      'British American and German American press remain represented in the community source system.',
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
