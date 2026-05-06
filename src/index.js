const DEFAULT_BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
const PREFIX = 'bing_';
const CACHE_KEY = 'cache_all_data';
const CONFIG_KEY = 'market_time_config';
const CACHE_TTL = 86400;
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

const MARKET_API_MAP = {
  'zh-CN': 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN',
  'en-US': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US',
  'en-GB': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-GB',
  'en-AU': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-AU',
  'en-CA': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-CA',
  'ja-JP': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ja-JP',
  'de-DE': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=de-DE',
  'fr-FR': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=fr-FR',
  'zh-TW': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-TW',
  'zh-HK': 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-HK',
};

const MARKET_NAMES = {
  'zh-CN': '中国',
  'en-US': '美国',
  'en-GB': '英国',
  'en-AU': '澳大利亚',
  'en-CA': '加拿大',
  'ja-JP': '日本',
  'de-DE': '德国',
  'fr-FR': '法国',
  'zh-TW': '台湾',
  'zh-HK': '香港',
};

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
const getMonthData = async (env, key) => await env.BING_KV.get(key, 'json') || { market_time_config: [], wallpaper_list: [] };
const getConfig = async (env) => {
  const config = await env.BING_KV.get(CONFIG_KEY, 'json');
  return config || { market_time_config: [], wallpaper_list: [] };
};
const getAllKeys = async (env) => (await env.BING_KV.list({ prefix: PREFIX })).keys.map(k => k.name).filter(k => !k.startsWith('cache_') && k !== CONFIG_KEY).sort().reverse();

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
  const marketSet = new Set();
  const years = new Set();

  for (const d of results) {
    if (d?.wallpaper_list) {
      all.push(...d.wallpaper_list);
      d.wallpaper_list.forEach(item => {
        if (item.belong_market) marketSet.add(item.belong_market);
        if (item.date) years.add(item.date.substring(0, 4));
      });
    }
  }

  all.sort((a, b) => b.date.localeCompare(a.date));
  const yearsArr = Array.from(years).sort().reverse();
  const markets = Array.from(marketSet).sort();

  const cacheData = { data: all, years: yearsArr, markets };
  await env.BING_KV.put(CACHE_KEY, JSON.stringify(cacheData), { expirationTtl: CACHE_TTL });

  return cacheData;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatCopyright(str) {
  if (str == null) return '';
  return escapeHtml(str).replace(/([（(])/g, '<span class="nobr">$1').replace(/([）)])/g, '$1</span>');
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
    .replace('id="heroTitle"></h1>', `id="heroTitle">${formatCopyright(latest.copyright)}</h1>`);
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

async function fetchMarketWallpaper(env, marketCode) {
  const apiUrl = MARKET_API_MAP[marketCode];
  if (!apiUrl) return { success: false, error: `不支持的市场: ${marketCode}` };

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return { success: false, error: `Bing API 请求失败 (${marketCode})` };

    const data = await res.json();
    if (!data.images?.length) return { success: false, error: `获取壁纸失败 (${marketCode})` };

    const img = data.images[0];
    const entry = {
      belong_market: MARKET_NAMES[marketCode] || marketCode,
      date: img.enddate,
      copyright: img.copyright || '',
      url: `https://cn.bing.com${img.urlbase}_UHD.jpg`
    };

    const key = getMonthKey(entry.date);
    const monthData = await getMonthData(env, key);

    const existingIndex = monthData.wallpaper_list?.findIndex(i => i.date === entry.date && i.belong_market === entry.belong_market);
    if (existingIndex !== undefined && existingIndex >= 0) {
      monthData.wallpaper_list[existingIndex] = entry;
    } else {
      if (!monthData.wallpaper_list) monthData.wallpaper_list = [];
      monthData.wallpaper_list.push(entry);
    }

    monthData.wallpaper_list.sort((a, b) => a.date.localeCompare(b.date));
    await saveMonthData(env, key, monthData);

    return { success: true, market: marketCode, marketName: entry.belong_market, data: entry, total: monthData.wallpaper_list.length };
  } catch (e) {
    return { success: false, error: `采集失败 (${marketCode}): ${e.message}` };
  }
}

async function updateAllMarkets(env) {
  const config = await getConfig(env);
  const marketConfigs = config.market_time_config || [];
  
  if (marketConfigs.length === 0) {
    const marketCodes = Object.keys(MARKET_API_MAP);
    const results = await Promise.all(marketCodes.map(code => fetchMarketWallpaper(env, code)));
    const successCount = results.filter(r => r.success).length;
    return { success: true, message: `采集完成,成功 ${successCount}/${marketCodes.length} 个市场`, results };
  }

  const currentYM = new Date().toISOString().substring(0, 7).replace('-', '');
  const results = [];

  for (const marketConfig of marketConfigs) {
    const { country_market, start_ym, end_ym } = marketConfig;
    if (currentYM < start_ym || currentYM > end_ym) {
      results.push({ success: true, skipped: true, market: country_market, message: `不在时间范围内 (${start_ym} - ${end_ym})` });
      continue;
    }

    const marketCode = Object.keys(MARKET_NAMES).find(k => MARKET_NAMES[k] === country_market);
    if (!marketCode) {
      results.push({ success: false, error: `未找到市场代码: ${country_market}` });
      continue;
    }

    const result = await fetchMarketWallpaper(env, marketCode);
    results.push(result);
  }

  const successCount = results.filter(r => r.success && !r.skipped).length;
  return { success: true, message: `采集完成,成功 ${successCount}/${marketConfigs.length} 个市场`, results };
}

async function updateBing(env) {
  return updateAllMarkets(env);
}

async function handleImport(body, env) {
  const wallpaperList = body.wallpaper_list || (Array.isArray(body) ? body : body?.data || []);
  if (!wallpaperList.length) return { success: false, error: '无数据' };

  const validItems = wallpaperList.filter(validateEntry);
  if (!validItems.length) return { success: false, error: '无有效数据' };

  const monthMap = {};
  for (const item of validItems) {
    const key = getMonthKey(item.date);
    if (!monthMap[key]) {
      monthMap[key] = { market_time_config: [], wallpaper_list: [] };
    }
    monthMap[key].wallpaper_list.push(item);
  }

  let imported = 0, skipped = 0;
  for (const [key, newItems] of Object.entries(monthMap)) {
    const existing = await getMonthData(env, key);
    if (!existing.wallpaper_list) existing.wallpaper_list = [];
    const existingDates = new Set(existing.wallpaper_list.map(i => `${i.date}_${i.belong_market}`));
    
    for (const item of newItems.wallpaper_list) {
      const itemKey = `${item.date}_${item.belong_market}`;
      if (existingDates.has(itemKey)) {
        skipped++;
        continue;
      }
      existing.wallpaper_list.push(item);
      imported++;
    }
    existing.wallpaper_list.sort((a, b) => a.date.localeCompare(b.date));
    await saveMonthData(env, key, existing);
  }

  if (body.market_time_config) {
    const config = await getConfig(env);
    config.market_time_config = body.market_time_config;
    await env.BING_KV.put(CONFIG_KEY, JSON.stringify(config));
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
  '/api/config': async ({ env, request }) => {
    if (request.method === 'GET') {
      const config = await getConfig(env);
      return json(config);
    }
    
    if (request.method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return json({ success: false, error: 'Content-Type 必须为 application/json' }, 400);
      }
      
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: '请求格式错误' }, 400);
      }
      
      const { market_time_config } = body;
      if (!Array.isArray(market_time_config)) {
        return json({ success: false, error: 'market_time_config 必须是数组' }, 400);
      }
      
      const validatedConfig = [];
      for (const item of market_time_config) {
        if (!item.country_market || typeof item.country_market !== 'string') {
          return json({ success: false, error: '每个配置项必须包含 country_market' }, 400);
        }
        if (!item.start_ym || !/^\d{6}$/.test(item.start_ym)) {
          return json({ success: false, error: 'start_ym 格式错误,应为 YYYYMM' }, 400);
        }
        if (!item.end_ym || !/^\d{6}$/.test(item.end_ym)) {
          return json({ success: false, error: 'end_ym 格式错误,应为 YYYYMM' }, 400);
        }
        if (item.start_ym > item.end_ym) {
          return json({ success: false, error: 'start_ym 不能大于 end_ym' }, 400);
        }
        
        validatedConfig.push({
          country_market: item.country_market,
          start_ym: item.start_ym,
          end_ym: item.end_ym
        });
      }
      
      const config = await getConfig(env);
      config.market_time_config = validatedConfig;
      await env.BING_KV.put(CONFIG_KEY, JSON.stringify(config));
      await buildCache(env);
      
      return json({ success: true, message: '配置已保存', config: validatedConfig });
    }
    
    return json({ success: false, error: '不支持的请求方法' }, 405);
  },
  '/api/markets': async ({ env }) => {
    const availableMarkets = Object.entries(MARKET_NAMES).map(([code, name]) => ({ code, name }));
    return json({ success: true, markets: availableMarkets });
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
    const { year, month, date, market } = body;

    if (date) {
      const normalizedDate = String(date).replace(/-/g, '');
      if (!/^\d{8}$/.test(normalizedDate)) {
        return json({ success: false, error: '日期格式错误，应为 YYYYMMDD 格式' }, 400);
      }
      const monthKey = PREFIX + normalizedDate.slice(0, 6);
      const monthData = await getMonthData(env, monthKey);
      if (!monthData.wallpaper_list) monthData.wallpaper_list = [];
      
      if (market) {
        monthData.wallpaper_list = monthData.wallpaper_list.filter(
          item => !(item.date === normalizedDate && item.belong_market === market)
        );
      } else {
        monthData.wallpaper_list = monthData.wallpaper_list.filter(item => item.date !== normalizedDate);
      }
      
      if (monthData.wallpaper_list.length === 0) {
        await env.BING_KV.delete(monthKey);
      } else {
        await saveMonthData(env, monthKey, monthData);
      }
      await buildCache(env);
      return json({ success: true, message: `已删除 ${normalizedDate}${market ? ` (${market})` : ''}` });
    }

    if (month) {
      const normalizedMonth = String(month).replace(/-/g, '');
      if (!/^\d{6}$/.test(normalizedMonth)) {
        return json({ success: false, error: '月份格式错误，应为 YYYYMM 格式' }, 400);
      }
      if (market) {
        const monthData = await getMonthData(env, PREFIX + normalizedMonth);
        if (monthData.wallpaper_list) {
          monthData.wallpaper_list = monthData.wallpaper_list.filter(item => item.belong_market !== market);
          if (monthData.wallpaper_list.length > 0) {
            await saveMonthData(env, PREFIX + normalizedMonth, monthData);
          } else {
            await env.BING_KV.delete(PREFIX + normalizedMonth);
          }
        }
      } else {
        await env.BING_KV.delete(PREFIX + normalizedMonth);
      }
      await buildCache(env);
      return json({ success: true, message: `已删除 ${normalizedMonth}${market ? ` (${market})` : ''}` });
    }

    if (year) {
      const normalizedYear = String(year);
      if (!/^\d{4}$/.test(normalizedYear)) {
        return json({ success: false, error: '年份格式错误，应为 YYYY 格式' }, 400);
      }
      const keys = await getAllKeys(env);
      const yearKeys = keys.filter(k => k.replace(PREFIX, '').startsWith(normalizedYear));
      
      if (market) {
        for (const k of yearKeys) {
          const monthData = await getMonthData(env, k);
          if (monthData.wallpaper_list) {
            monthData.wallpaper_list = monthData.wallpaper_list.filter(item => item.belong_market !== market);
            if (monthData.wallpaper_list.length > 0) {
              await saveMonthData(env, k, monthData);
            } else {
              await env.BING_KV.delete(k);
            }
          }
        }
      } else {
        for (const k of yearKeys) {
          await env.BING_KV.delete(k);
        }
      }
      
      await buildCache(env);
      return json({ success: true, message: `已删除 ${normalizedYear} 年的 ${yearKeys.length} 个月份数据${market ? ` (${market})` : ''}` });
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
