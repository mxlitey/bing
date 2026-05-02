const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
const PREFIX = 'bing_';
const CACHE_KEY = 'cache_all_data';
const CACHE_TTL = 86400;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 
    'content-type': 'application/json; charset=UTF-8', 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
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
  const promises = keys.map(k => env.BING_KV.get(k, 'json'));
  const results = await Promise.all(promises);
  
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

async function getAllData(env) {
  const cached = await env.BING_KV.get(CACHE_KEY, 'json');
  if (cached && cached.data && cached.years) {
    return cached;
  }
  return await buildCache(env);
}

async function clearCache(env) {
  await env.BING_KV.delete(CACHE_KEY);
}

async function saveMonthData(env, key, data) {
  await env.BING_KV.put(key, JSON.stringify(data));
  await clearCache(env);
}

async function getYearData(env, year) {
  const keys = await getAllKeys(env);
  const yearKeys = keys.filter(k => k.startsWith(PREFIX + year));
  const all = [];
  for (const k of yearKeys) {
    const d = await env.BING_KV.get(k, 'json');
    if (d) all.push(...d);
  }
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

async function getYears(env) {
  const keys = await getAllKeys(env);
  const years = new Set();
  for (const k of keys) {
    const year = k.replace(PREFIX, '').substring(0, 4);
    if (year.length === 4) years.add(year);
  }
  return Array.from(years).sort().reverse();
}

async function updateBing(env) {
  const res = await fetch(BING_API);
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
}

async function handleImport(body, env) {
  const items = Array.isArray(body) ? body : body.data || [];
  if (!items.length) return { success: false, error: '无数据' };

  const monthMap = {};
  for (const item of items) {
    if (!item.date) continue;
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
    await env.BING_KV.put(key, JSON.stringify(existing));
  }

  await buildCache(env);
  return { success: true, imported, skipped, months: Object.keys(monthMap).length };
}

async function handleExport(params, env) {
  const keys = await getAllKeys(env);
  let filtered = keys;
  if (params.get('start')) filtered = filtered.filter(k => k.replace(PREFIX, '') >= params.get('start').replace('-', ''));
  if (params.get('end')) filtered = filtered.filter(k => k.replace(PREFIX, '') <= params.get('end').replace('-', ''));

  const all = [];
  for (const k of filtered) {
    const d = await env.BING_KV.get(k, 'json');
    if (d) all.push(...d);
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all;
}

function checkAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === env.AUTH_TOKEN;
}

function needAuth() {
  return new Response(JSON.stringify({ error: '需要认证' }), {
    status: 401,
    headers: { 
      'content-type': 'application/json; charset=UTF-8', 
      'WWW-Authenticate': 'Bearer',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const fields = url.searchParams.get('fields');

    if (path === '/json') {
      const cached = await getAllData(env);
      return json(filterFields(cached.data, fields));
    }
    
    if (path === '/api/latest') {
      const cached = await getAllData(env);
      return cached.data[0] ? json(cached.data[0]) : json({ error: '暂无数据' }, 404);
    }

    if (path === '/api/years') {
      const cached = await getAllData(env);
      return json(cached.years);
    }

    if (path.startsWith('/api/year/')) {
      const match = path.match(/^\/api\/year\/(\d{4})$/);
      if (match) return json(await getYearData(env, match[1]));
    }

    if (path.startsWith('/api/month/')) {
      const match = path.match(/^\/api\/month\/(\d{6})$/);
      if (match) return json(await getMonthData(env, PREFIX + match[1]));
    }

    if (path === '/api/login' && request.method === 'POST') {
      try {
        const { token } = await request.json();
        return token === env.AUTH_TOKEN ? json({ success: true, token }) : json({ success: false, error: '认证失败' }, 401);
      } catch (e) {
        return json({ success: false, error: '请求格式错误' }, 400);
      }
    }

    if (path === '/api/stats') {
      const keys = await getAllKeys(env);
      let total = 0;
      for (const k of keys) {
        const d = await env.BING_KV.get(k, 'json');
        total += d?.length || 0;
      }
      return json({ months: keys.length, total });
    }

    if (path === '/api/months') {
      const keys = await getAllKeys(env);
      const result = [];
      for (const k of keys) {
        const d = await env.BING_KV.get(k, 'json');
        result.push({ month: k.replace(PREFIX, ''), count: d?.length || 0 });
      }
      return json(result);
    }

    if (path === '/api/export') {
      const data = await handleExport(url.searchParams, env);
      const result = filterFields(data, fields);
      if (url.searchParams.get('download') === '1') {
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 
            'content-type': 'application/json; charset=UTF-8', 
            'Content-Disposition': 'attachment; filename="bing_wallpapers.json"',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      return json(result);
    }

    const protectedPaths = ['/api/import', '/update', '/api/delete-month'];
    if (protectedPaths.some(p => path.startsWith(p)) && !checkAuth(request, env)) return needAuth();

    if (path === '/update') return json(await updateBing(env));

    if (path === '/api/import' && request.method === 'POST') {
      return json(await handleImport(await request.json(), env));
    }

    if (path === '/api/delete-month' && request.method === 'POST') {
      const { month } = await request.json();
      if (!month) return json({ success: false, error: '缺少月份' }, 400);
      await env.BING_KV.delete(PREFIX + month.replace('-', ''));
      await buildCache(env);
      return json({ success: true, message: `已删除 ${month}` });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_, env, ctx) {
    ctx.waitUntil(
      updateBing(env).then(() => buildCache(env))
    );
  }
};
