const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
const PREFIX = 'bing_';

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' }
});

const getMonthKey = (date) => PREFIX + date.substring(0, 6);
const getMonthData = async (env, key) => await env.BING_KV.get(key, 'json') || [];
const getAllKeys = async (env) => (await env.BING_KV.list({ prefix: PREFIX })).keys.map(k => k.name).sort().reverse();

async function saveMonthData(env, key, data) {
  await env.BING_KV.put(key, JSON.stringify(data));
  return true;
}

async function getAllData(env) {
  const keys = await getAllKeys(env);
  const all = [];
  for (const k of keys) {
    const d = await env.BING_KV.get(k, 'json');
    if (d) all.push(...d);
  }
  return all.sort((a, b) => b.date.localeCompare(a.date));
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
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(item);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/json') return json(await getAllData(env));
    if (path === '/update') return json(await updateBing(env));

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

    if (/^\/\d{6}$/.test(path)) {
      const data = await env.BING_KV.get(PREFIX + path.slice(1), 'json');
      return data ? json(data) : json({ error: '不存在' }, 404);
    }

    if (path === '/api/import' && request.method === 'POST') {
      return json(await handleImport(await request.json(), env));
    }

    if (path === '/api/export') {
      const data = await handleExport(url.searchParams, env);
      if (url.searchParams.get('download') === '1') {
        return new Response(JSON.stringify(data, null, 2), {
          headers: { 'content-type': 'application/json; charset=UTF-8', 'Content-Disposition': 'attachment; filename="bing_wallpapers.json"' }
        });
      }
      return json(data);
    }

    if (path === '/api/delete-month' && request.method === 'POST') {
      const { month } = await request.json();
      if (!month) return json({ success: false, error: '缺少月份' }, 400);
      await env.BING_KV.delete(PREFIX + month.replace('-', ''));
      return json({ success: true, message: `已删除 ${month}` });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_, env, ctx) {
    ctx.waitUntil(updateBing(env));
  }
};
