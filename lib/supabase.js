function baseHeaders(prefer = '') {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function endpoint(path) {
  // Accept either the root Supabase Project URL or a URL that was copied
  // with /rest/v1 attached, and normalize it to exactly one /rest/v1 path.
  let base = String(process.env.SUPABASE_URL || '').trim();
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/rest\/v1$/i, '');

  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${base}/rest/v1/${cleanPath}`;
}

async function request(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: { ...baseHeaders(options.prefer), ...(options.headers || {}) },
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`
    );
  }
  return data;
}

export async function insert(table, rows, { returning = true } = {}) {
  return request(table, {
    method: 'POST',
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    prefer: returning ? 'return=representation' : 'return=minimal',
  });
}

export async function upsert(table, rows, onConflict, { returning = true } = {}) {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  return request(`${table}${suffix}`, {
    method: 'POST',
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    prefer: `resolution=merge-duplicates,${returning ? 'return=representation' : 'return=minimal'}`,
  });
}

export async function update(table, query, patch) {
  return request(`${table}?${query}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    prefer: 'return=representation',
  });
}

export async function select(table, query = '') {
  return request(`${table}${query ? `?${query}` : ''}`, { method: 'GET' });
}

export async function remove(table, query) {
  return request(`${table}?${query}`, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
}
