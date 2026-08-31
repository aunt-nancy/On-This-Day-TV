export const SITE_TIME_ZONE =
  process.env.OTD_TIME_ZONE || 'America/Los_Angeles';

function partsFor(date = new Date(), timeZone = SITE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

export function siteDateParts(date = new Date()) {
  return partsFor(date, SITE_TIME_ZONE);
}

export function siteDateISO(date = new Date()) {
  const { year, month, day } = siteDateParts(date);
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function parseExplicitDate(inputDate) {
  const match = String(inputDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Invalid date; expected YYYY-MM-DD');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const validation = new Date(Date.UTC(year, month - 1, day));
  if (
    validation.getUTCFullYear() !== year ||
    validation.getUTCMonth() + 1 !== month ||
    validation.getUTCDate() !== day
  ) {
    throw new Error('Invalid calendar date');
  }

  return {
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    year,
    month,
    day,
  };
}

export function monthName(month) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, month - 1, 1)));
}
