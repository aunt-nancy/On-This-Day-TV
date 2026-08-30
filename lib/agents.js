export const AGENTS = [
  { key: 'date_anniversary', name: 'Date & Anniversary Agent', group: 'research', automatic: true },
  { key: 'major_press', name: 'Major American Press Research Agent', group: 'research', automatic: true },
  { key: 'black_press', name: 'African American / Black Press Research Agent', group: 'research', automatic: true },
  { key: 'regional_local', name: 'Regional & Local Press Agent', group: 'research', automatic: true },
  { key: 'community_press', name: 'Community Press Voices Agent', group: 'research', automatic: true },
  { key: 'historical_context', name: 'Historical Context Agent', group: 'analysis', automatic: true },
  { key: 'translation', name: 'Historical Translation Agent', group: 'analysis', automatic: true },
  { key: 'source_verification', name: 'Source Verification Agent', group: 'verification', automatic: true },
  { key: 'rights_review', name: 'Rights & Reuse Agent', group: 'verification', automatic: true },
  { key: 'visual_archive', name: 'Visual Archive Agent', group: 'production', automatic: true },
  { key: 'discrepancy_exception', name: 'Discrepancy & Exception Agent', group: 'verification', automatic: true },
  { key: 'editor_producer', name: 'Editor & Producer Agent', group: 'production', automatic: true },
  { key: 'social_editor', name: 'Social Editor Agent', group: 'social', automatic: true },
  { key: 'short_form_video', name: 'Short-Form Video Agent', group: 'social', automatic: true },
  { key: 'social_distribution', name: 'Social Distribution Agent', group: 'social', automatic: true },
  { key: 'engagement_trends', name: 'Engagement & Trends Agent', group: 'social', automatic: true },
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
    years: { y200: year - 200, y100: year - 100, y76: year - 76 },
  };
}

export function sourceRules() {
  return {
    preferredArchives: [
      'Library of Congress Chronicling America',
      'Howard University Black Press Archives / Moorland-Spingarn Research Center',
      'Schomburg Center for Research in Black Culture',
      'American Antiquarian Society',
      'Sequoyah National Research Center',
      'California Digital Newspaper Collection',
      'Hoji Shinbun Digital Collection',
      'state newspaper archives',
      'university special collections',
      'individual newspaper archives',
    ],
    rules: [
      'Use the original issue or institutional archive as primary evidence whenever available.',
      'Never invent a newspaper, headline, issue date, page number, quotation, archive, or URL.',
      'A failure to find coverage is not proof that coverage did not exist.',
      'Use “not found in the issues searched” rather than “ignored” unless a methodologically sufficient search supports that conclusion.',
      'Separate what a newspaper reported from what later evidence established.',
      'African American / Black Press is always the permanent center comparison for the 100-year desk.',
      'Non-Black community tiles are ranked by population significance and/or the strength of the day’s relevant headline.',
      'British American and German American press must remain represented in the community source system.',
    ],
  };
}
