function baseUrl() {
  let base = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  base = base.replace(/\/rest\/v1$/i, '');
  return base;
}

function headers(prefer='') {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function request(url, options={}) {
  const response = await fetch(url, { ...options, headers: { ...headers(options.prefer), ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

function rest(path='') { return `${baseUrl()}/rest/v1/${String(path).replace(/^\/+/, '')}`; }

export async function select(table, query='') {
  return request(`${rest(table)}${query ? `?${query}` : ''}`, { method:'GET' });
}
export async function insert(table, rows, {returning=true}={}) {
  return request(rest(table), { method:'POST', body:JSON.stringify(Array.isArray(rows)?rows:[rows]), prefer:returning?'return=representation':'return=minimal' });
}
export async function update(table, query, patch) {
  return request(`${rest(table)}?${query}`, { method:'PATCH', body:JSON.stringify(patch), prefer:'return=representation' });
}
export async function upsert(table, rows, onConflict, {returning=true}={}) {
  const q = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  return request(`${rest(table)}${q}`, { method:'POST', body:JSON.stringify(Array.isArray(rows)?rows:[rows]), prefer:`resolution=merge-duplicates,${returning?'return=representation':'return=minimal'}` });
}
export async function remove(table, query) {
  return request(`${rest(table)}?${query}`, { method:'DELETE', prefer:'return=representation' });
}
export async function rpc(name, args={}) {
  return request(`${baseUrl()}/rest/v1/rpc/${name}`, { method:'POST', body:JSON.stringify(args) });
}
