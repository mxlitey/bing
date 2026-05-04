const DEFAULT_BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
const PREFIX = 'bing_';
const CACHE_KEY = 'cache_all_data';
const CACHE_TTL = 86400;
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8', ...CORS_HEADERS }
});

const getMonthKey = (date) => PREFIX + date.substring(0, 6);
const getMonthData = async (env, key) => await env.BING_KV.get(key, 'json') || [];
const getAllKeys = async (env) => (await env.BING_KV.list({ prefix: PREFIX })).keys.map(k => k.name).filter(k => !k.startsWith('cache_')).sort().reverse();

function filterFields(data, fields) {
  if (!fields) return data;
  const fieldList = fields.split(',').map(f => f.trim()).filter(Boolean);
  if (!fieldList.length) return data;

  if (Array.isArray(data)) {
    return data.map(item => {
      const filtered = {};
      for (const f of fieldList) if (item[f] !== undefined) filtered[f] = item[f];
      return filtered;
    });
  }

  const filtered = {};
  for (const f of fieldList) if (data[f] !== undefined) filtered[f] = data[f];
  return filtered;
}

async function buildCache(env) {
  const keys = await getAllKeys(env);
  const results = await Promise.all(keys.map(k => env.BING_KV.get(k, 'json')));

  const all = [];
  const years = new Set();

  for (const d of results) {
    if (d) {
      all.push(...d);
      if (d[0]) years.add(d[0].date.substring(0, 4));
    }
  }

  all.sort((a, b) => b.date.localeCompare(a.date));
  const yearsArr = Array.from(years).sort().reverse();

  const cacheData = { data: all, years: yearsArr };
  await env.BING_KV.put(CACHE_KEY, JSON.stringify(cacheData), { expirationTtl: CACHE_TTL });

  return cacheData;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getAllData(env) {
  const cached = await env.BING_KV.get(CACHE_KEY, 'json');
  if (cached?.data?.years) return cached;
  return buildCache(env);
}

async function injectHeroData(env, html) {
  const cached = await getAllData(env);
  const latest = cached.data?.[0];
  if (!latest) return html;

  const dateFormatted = `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`;

  try {
    const imgUrl = new URL(latest.url);
    const preconnect = `<link rel="preconnect" href="${imgUrl.origin}">`;
    html = html.replace('</head>', preconnect + '</head>');
  } catch {}

  const inlineData = `<script>window.__BING_DATA__=${JSON.stringify(cached)};</script>`;
  html = html.replace('</head>', inlineData + '</head>');

  return html
    .replace('id="heroDate"></div>', `id="heroDate">${dateFormatted}</div>`)
    .replace('id="heroTitle"></h1>', `id="heroTitle">${escapeHtml(latest.copyright)}</h1>`);
}

async function clearCache(env) {
  await env.BING_KV.delete(CACHE_KEY);
}

async function saveMonthData(env, key, data) {
  await env.BING_KV.put(key, JSON.stringify(data));
  await clearCache(env);
}

function validateEntry(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.date || !/^\d{8}$/.test(String(item.date))) return false;
  if (item.url && typeof item.url !== 'string') return false;
  if (item.copyright && typeof item.copyright !== 'string') return false;
  return true;
}

async function updateBing(env) {
  try {
    const bingApi = env.BING_API || DEFAULT_BING_API;
    const res = await fetch(bingApi);
    if (!res.ok) return { success: false, error: 'Bing API 请求失败' };

    const data = await res.json();
    if (!data.images?.length) return { success: false, error: '获取失败' };

    const img = data.images[0];
    const entry = {
      date: img.enddate,
      copyright: img.copyright || '',
      url: `https://cn.bing.com${img.urlbase}_UHD.jpg`
    };

    const key = getMonthKey(entry.date);
    const monthData = await getMonthData(env, key);

    if (monthData.some(i => i.date === entry.date)) {
      return { success: true, message: '已存在', date: entry.date };
    }

    monthData.push(entry);
    monthData.sort((a, b) => a.date.localeCompare(b.date));
    await saveMonthData(env, key, monthData);

    return { success: true, message: '更新成功', data: entry, total: monthData.length };
  } catch (e) {
    return { success: false, error: '更新失败: ' + e.message };
  }
}

async function handleImport(body, env) {
  const items = Array.isArray(body) ? body : body?.data || [];
  if (!items.length) return { success: false, error: '无数据' };

  const validItems = items.filter(validateEntry);
  if (!validItems.length) return { success: false, error: '无有效数据' };

  const monthMap = {};
  for (const item of validItems) {
    const key = getMonthKey(item.date);
    (monthMap[key] ??= []).push(item);
  }

  let imported = 0, skipped = 0;
  for (const [key, newItems] of Object.entries(monthMap)) {
    const existing = await getMonthData(env, key);
    const dates = new Set(existing.map(i => i.date));
    for (const item of newItems) {
      if (dates.has(item.date)) { skipped++; continue; }
      existing.push(item);
      imported++;
    }
    existing.sort((a, b) => a.date.localeCompare(b.date));
    await saveMonthData(env, key, existing);
  }

  await buildCache(env);
  return { success: true, imported, skipped, months: Object.keys(monthMap).length };
}

async function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.length !== bBuf.length) return false;
  const key = crypto.getRandomValues(new Uint8Array(aBuf.length));
  const aXor = new Uint8Array(aBuf.length);
  const bXor = new Uint8Array(bBuf.length);
  for (let i = 0; i < aBuf.length; i++) {
    aXor[i] = aBuf[i] ^ key[i];
    bXor[i] = bBuf[i] ^ key[i];
  }
  const aHash = await crypto.subtle.digest('SHA-256', aXor);
  const bHash = await crypto.subtle.digest('SHA-256', bXor);
  const aArr = new Uint8Array(aHash);
  const bArr = new Uint8Array(bHash);
  let result = 0;
  for (let i = 0; i < aArr.length; i++) result |= aArr[i] ^ bArr[i];
  return result === 0;
}

async function checkAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  return safeCompare(auth.slice(7), env.AUTH_TOKEN);
}

function needAuth() {
  return new Response(JSON.stringify({ error: '需要认证' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'WWW-Authenticate': 'Bearer', ...CORS_HEADERS }
  });
}

const PUBLIC_ROUTES = {
  '/json': async ({ env, fields }) => {
    const cached = await getAllData(env);
    return json(filterFields(cached.data, fields));
  }
};

const PROTECTED_ROUTES = {
  '/update': async ({ env }) => {
    return json(await updateBing(env));
  },
  '/api/import': async ({ env, request }) => {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return json({ success: false, error: 'Content-Type 必须为 application/json' }, 400);
    }
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMPORT_SIZE) {
      return json({ success: false, error: '数据量过大，最大允许 5MB' }, 413);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: '请求格式错误' }, 400);
    }
    return json(await handleImport(body, env));
  },
  '/api/delete': async ({ env, request }) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: '请求格式错误' }, 400);
    }
    const { year, month, date } = body;

    if (date) {
      const normalizedDate = String(date).replace(/-/g, '');
      if (!/^\d{8}$/.test(normalizedDate)) {
        return json({ success: false, error: '日期格式错误，应为 YYYYMMDD 格式' }, 400);
      }
      const monthKey = PREFIX + normalizedDate.slice(0, 6);
      const monthData = await env.BING_KV.get(monthKey, 'json') || [];
      const newData = monthData.filter(item => item.date !== normalizedDate);
      if (newData.length === 0) {
        await env.BING_KV.delete(monthKey);
      } else {
        await env.BING_KV.put(monthKey, JSON.stringify(newData));
      }
      await buildCache(env);
      return json({ success: true, message: `已删除 ${normalizedDate}` });
    }

    if (month) {
      const normalizedMonth = String(month).replace(/-/g, '');
      if (!/^\d{6}$/.test(normalizedMonth)) {
        return json({ success: false, error: '月份格式错误，应为 YYYYMM 格式' }, 400);
      }
      await env.BING_KV.delete(PREFIX + normalizedMonth);
      await buildCache(env);
      return json({ success: true, message: `已删除 ${normalizedMonth}` });
    }

    if (year) {
      const normalizedYear = String(year);
      if (!/^\d{4}$/.test(normalizedYear)) {
        return json({ success: false, error: '年份格式错误，应为 YYYY 格式' }, 400);
      }
      const keys = await getAllKeys(env);
      const yearKeys = keys.filter(k => k.replace(PREFIX, '').startsWith(normalizedYear));
      for (const k of yearKeys) {
        await env.BING_KV.delete(k);
      }
      await buildCache(env);
      return json({ success: true, message: `已删除 ${normalizedYear} 年的 ${yearKeys.length} 个月份数据` });
    }

    return json({ success: false, error: '请指定 year、month 或 date 参数' }, 400);
  }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const fields = url.searchParams.get('fields');
    const ctx_ = { env, url, fields, request };

    if (path === '/api/login' && request.method === 'POST') {
      try {
        const { token } = await request.json();
        const valid = await safeCompare(token, env.AUTH_TOKEN);
        return valid ? json({ success: true }) : json({ success: false, error: '认证失败' }, 401);
      } catch {
        return json({ success: false, error: '请求格式错误' }, 400);
      }
    }

    if (PUBLIC_ROUTES[path]) {
      return PUBLIC_ROUTES[path](ctx_);
    }

    if (PROTECTED_ROUTES[path]) {
      if (!(await checkAuth(request, env))) return needAuth();
      return PROTECTED_ROUTES[path](ctx_);
    }

    const assetsRes = await env.ASSETS.fetch(request);
    if (path === '/' && assetsRes.status === 200) {
      const html = await assetsRes.text();
      const injectedHtml = await injectHeroData(env, html);
      return new Response(injectedHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=UTF-8' }
      });
    }
    return assetsRes;
  },

  async scheduled(_, env, ctx) {
    ctx.waitUntil(
      updateBing(env).then(() => buildCache(env))
    );
  }
};
