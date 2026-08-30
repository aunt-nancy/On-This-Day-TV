function rootUrl() {
  let base = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  return base.replace(/\/rest\/v1$/i, '');
}

function authHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

export async function ensurePublicBucket(bucket = 'illustrations') {
  const base = rootUrl();
  const existing = await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
    headers: authHeaders(),
  });

  if (existing.ok) return;

  if (existing.status !== 404) {
    const body = await existing.text();
    throw new Error(`Supabase Storage bucket check ${existing.status}: ${body}`);
  }

  const created = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
    }),
  });

  if (!created.ok && created.status !== 409) {
    const body = await created.text();
    throw new Error(`Supabase Storage bucket creation ${created.status}: ${body}`);
  }
}

export async function uploadPublicImage({
  bucket = 'illustrations',
  objectPath,
  bytes,
  contentType = 'image/png',
}) {
  await ensurePublicBucket(bucket);
  const base = rootUrl();
  const encodedPath = objectPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': contentType,
      'x-upsert': 'true',
      'cache-control': '3600',
    }),
    body: bytes,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase Storage upload ${response.status}: ${body}`);
  }

  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}
