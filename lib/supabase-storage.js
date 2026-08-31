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

function storageTimeoutMs() {
  const configured = Number(process.env.OTD_STORAGE_TIMEOUT_MS || 15000);
  return Math.max(5000, Math.min(configured, 30000));
}

async function storageFetch(url, options = {}) {
  const controller = new AbortController();
  const ms = storageTimeoutMs();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Supabase Storage request timed out after ${Math.round(ms / 1000)} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function responseBody(response) {
  const raw = await response.text();
  if (!raw) return { raw: '', json: null };

  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

function missingBucket(response, body) {
  if (response.status === 404) return true;

  const raw = String(body?.raw || '');
  const json = body?.json || {};
  const code = String(json.code || '');
  const statusCode = String(json.statusCode || '');
  const message = String(json.message || '');

  // Supabase Storage may report a missing bucket as HTTP 400 while the JSON
  // payload contains statusCode 404 / NoSuchBucket. Treat that as missing.
  return response.status === 400 && (
    statusCode === '404' ||
    code === 'NoSuchBucket' ||
    /NoSuchBucket|Bucket not found/i.test(raw) ||
    /Bucket not found/i.test(message)
  );
}

function alreadyExists(response, body) {
  if (response.status === 409) return true;

  const raw = String(body?.raw || '');
  const json = body?.json || {};
  return response.status === 400 && (
    /already exists|duplicate/i.test(raw) ||
    /already exists|duplicate/i.test(String(json.message || ''))
  );
}

export async function ensurePublicBucket(bucket = 'illustrations') {
  const base = rootUrl();
  if (!base) throw new Error('SUPABASE_URL is missing');

  const check = await storageFetch(
    `${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
    { headers: authHeaders() }
  );

  if (check.ok) {
    const body = await responseBody(check);
    const isPublic = body?.json?.public;

    // If an existing bucket is private, make it public so the public site can
    // actually render the generated image URL.
    if (isPublic === false) {
      const makePublic = await storageFetch(
        `${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
        {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ public: true }),
        }
      );

      if (!makePublic.ok) {
        const updateBody = await responseBody(makePublic);
        throw new Error(
          `Supabase Storage could not make bucket public (${makePublic.status}): ${updateBody.raw}`
        );
      }
    }

    return { bucket, created: false, public: true };
  }

  const checkBody = await responseBody(check);
  if (!missingBucket(check, checkBody)) {
    throw new Error(
      `Supabase Storage bucket check ${check.status}: ${checkBody.raw}`
    );
  }

  const created = await storageFetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: null,
      allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'],
    }),
  });

  if (!created.ok) {
    const createBody = await responseBody(created);
    if (!alreadyExists(created, createBody)) {
      throw new Error(
        `Supabase Storage bucket creation ${created.status}: ${createBody.raw}`
      );
    }
  }

  return { bucket, created: true, public: true };
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

  const response = await storageFetch(
    `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': contentType,
        'x-upsert': 'true',
        'cache-control': '3600',
      }),
      body: bytes,
    }
  );

  if (!response.ok) {
    const body = await responseBody(response);
    throw new Error(`Supabase Storage upload ${response.status}: ${body.raw}`);
  }

  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}
