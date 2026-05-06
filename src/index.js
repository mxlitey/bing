const DEFAULT_MARKETS = [
  'zh-CN', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP',
  'en-CA', 'fr-CA', 'en-IN', 'en-WW', 'es-ES', 'it-IT', 'pt-BR'
];

const PREFIX = 'bing_';
const ARCHIVE_PREFIX = 'archive_';
const MARKET_CONFIG_KEY = 'market_time_config';
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
const getArchiveKey = (year) => ARCHIVE_PREFIX + year;
const getYearFromKey = (key) => key.replace(PREFIX, '').substring(0, 4);

async function getMarketConfig(env) {
  const config = await env.BING_KV.get(MARKET_CONFIG_KEY, 'json');
  if (config) return config;
  const defaultConfig = {};
  const currentYm = getCurrentYm();
  for (const market of DEFAULT_MARKETS) {
    defaultConfig[market] = { start_ym: currentYm, end_ym: currentYm };
  }
  await env.BING_KV.put(MARKET_CONFIG_KEY, JSON.stringify(defaultConfig));
  return defaultConfig;
}

async function saveMarketConfig(env, config) {
  await env.BING_KV.put(MARKET_CONFIG_KEY, JSON.stringify(config));
}

function getCurrentYm() {
  const now = new Date();
  return now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0');
}

async function getMonthData(env, key) {
  return await env.BING_KV.get(key, 'json') || {};
}

async function saveMonthData(env, key, data) {
  await env.BING_KV.put(key, JSON.stringify(data));
  await clearCache(env);
}

async function getArchiveData(env, year) {
  return await env.BING_KV.get(getArchiveKey(year), 'json') || {};
}

async function saveArchiveData(env, year, data) {
  await env.BING_KV.put(getArchiveKey(year), JSON.stringify(data));
}

async function getAllMonthKeys(env) {
  const list = await env.BING_KV.list({ prefix: PREFIX });
  return list.keys.map(k => k.name).sort().reverse();
}

async function getAllArchiveKeys(env) {
  const list = await env.BING_KV.list({ prefix: ARCHIVE_PREFIX });
  return list.keys.map(k => k.name).sort().reverse();
}

async function buildCache(env) {
  const monthKeys = await getAllMonthKeys(env);
  const archiveKeys = await getAllArchiveKeys(env);
  const marketConfig = await getMarketConfig(env);

  const data = {};

  for (const key of monthKeys) {
    const monthData = await env.BING_KV.get(key, 'json');
    if (monthData && Object.keys(monthData).length > 0) {
      const ym = key.replace(PREFIX, '');
      const year = ym.substring(0, 4);
      if (!data[year]) data[year] = {};
      data[year][ym] = monthData;
    }
  }

  for (const key of archiveKeys) {
    const archiveData = await env.BING_KV.get(key, 'json');
    if (archiveData && Object.keys(archiveData).length > 0) {
      const year = key.replace(ARCHIVE_PREFIX, '');
      if (!data[year]) data[year] = {};
      Object.assign(data[year], archiveData);
    }
  }

  const cacheData = {
    data,
    marketConfig
  };
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
  if (cached?.data) return cached;
  return buildCache(env);
}

async function getRecentData(env, monthCount = 2) {
  const recentMonths = getRecentMonths(monthCount);
  const marketConfig = await getMarketConfig(env);
  const data = {};

  for (const ym of recentMonths) {
    const key = PREFIX + ym;
    const monthData = await env.BING_KV.get(key, 'json');
    if (monthData && Object.keys(monthData).length > 0) {
      const year = ym.substring(0, 4);
      if (!data[year]) data[year] = {};
      data[year][ym] = monthData;
    }
  }

  return {
    data,
    market_time_config: marketConfig
  };
}

function flattenData(data) {
  const all = [];
  for (const [year, months] of Object.entries(data)) {
    for (const [ym, markets] of Object.entries(months)) {
      for (const [market, items] of Object.entries(markets)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            all.push({ ...item, belong_market: market });
          }
        }
      }
    }
  }
  all.sort((a, b) => b.date.localeCompare(a.date));
  return all;
}

async function injectHeroData(env, html) {
  const cached = await getAllData(env);
  const allData = flattenData(cached.data);
  const latest = allData[0];
  if (!latest) return html;

  const dateFormatted = `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`;

  try {
    const imgUrl = new URL(latest.url || latest.image_url);
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

async function updateMarketConfigRange(env, market, newYm) {
  const config = await getMarketConfig(env);
  if (!config[market]) {
    config[market] = { start_ym: newYm, end_ym: newYm };
  } else {
    if (newYm < config[market].start_ym) {
      config[market].start_ym = newYm;
    }
    if (newYm > config[market].end_ym) {
      config[market].end_ym = newYm;
    }
  }
  await saveMarketConfig(env, config);
}

async function updateBingForMarket(env, market, sharedMonthData) {
  try {
    const bingApi = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${market}`;
    const res = await fetch(bingApi);
    if (!res.ok) return { success: false, market, error: 'Bing API 请求失败: ' + res.status };

    const data = await res.json();
    if (!data.images?.length) return { success: false, market, error: '获取失败: 无图片数据' };

    const img = data.images[0];
    const entry = {
      date: String(img.enddate),
      title: img.title || null,
      copyright: img.copyright || null,
      image_url: `https://www.bing.com${img.urlbase}_UHD.jpg`,
      description: null
    };

    if (!/^\d{8}$/.test(entry.date)) {
      return { success: false, market, error: '日期格式错误: ' + entry.date };
    }

    const key = getMonthKey(entry.date);
    
    if (!sharedMonthData[key]) {
      sharedMonthData[key] = await getMonthData(env, key);
    }
    const monthData = sharedMonthData[key];

    if (!monthData[market]) {
      monthData[market] = [];
    }

    const existingIndex = monthData[market].findIndex(i => i.date === entry.date);
    if (existingIndex >= 0) {
      return { success: true, market, message: '已存在', date: entry.date };
    }

    monthData[market].push(entry);
    monthData[market].sort((a, b) => a.date.localeCompare(b.date));

    return { success: true, market, message: '更新成功', date: entry.date, key, needClearCache: true };
  } catch (e) {
    return { success: false, market, error: '更新失败: ' + e.message };
  }
}

async function updateAllMarkets(env) {
  const config = await getMarketConfig(env);
  const markets = Object.keys(config);
  const sharedMonthData = {};
  
  const results = await Promise.all(markets.map(m => updateBingForMarket(env, m, sharedMonthData)));
  
  const writeOps = [];
  const updatedMarkets = new Set();
  
  for (const key of Object.keys(sharedMonthData)) {
    writeOps.push(env.BING_KV.put(key, JSON.stringify(sharedMonthData[key])));
  }
  
  for (const result of results) {
    if (result.success && result.key && result.message === '更新成功') {
      updatedMarkets.add(result.market);
    }
  }
  
  if (updatedMarkets.size > 0) {
    for (const market of updatedMarkets) {
      const result = results.find(r => r.market === market);
      if (result && result.date) {
        await updateMarketConfigRange(env, market, result.date.substring(0, 6));
      }
    }
    await clearCache(env);
  }
  
  await Promise.all(writeOps);
  
  return results;
}

async function archiveYear(env, year) {
  const monthKeys = [];
  for (let m = 1; m <= 12; m++) {
    const ym = year + String(m).padStart(2, '0');
    monthKeys.push(PREFIX + ym);
  }

  const archiveData = {};
  const archivedMonths = [];

  for (const key of monthKeys) {
    const data = await env.BING_KV.get(key, 'json');
    if (data && Object.keys(data).length > 0) {
      const ym = key.replace(PREFIX, '');
      archiveData[ym] = data;
      archivedMonths.push(ym);
    }
  }

  if (Object.keys(archiveData).length === 0) {
    return { success: false, error: `${year}年没有数据需要归档` };
  }

  await saveArchiveData(env, year, archiveData);

  for (const key of monthKeys) {
    await env.BING_KV.delete(key);
  }

  const config = await getMarketConfig(env);
  const nextYear = String(parseInt(year) + 1);
  const nextYearStart = nextYear + '01';

  for (const market of Object.keys(config)) {
    if (config[market].start_ym.startsWith(year)) {
      config[market].start_ym = nextYearStart;
    }
  }
  await saveMarketConfig(env, config);

  await clearCache(env);

  return {
    success: true,
    year,
    archivedMonths,
    message: `已归档${year}年数据，共${archivedMonths.length}个月`
  };
}

async function checkAndArchive(env) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const date = now.getDate();

  if (month === 1 && date === 1) {
    const lastYear = now.getFullYear() - 1;
    return await archiveYear(env, String(lastYear));
  }

  return { success: true, message: '无需归档' };
}

function validateEntry(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.date || !/^\d{8}$/.test(String(item.date))) return false;
  return true;
}

function cleanItem(item) {
  return {
    date: item.date,
    title: item.title || null,
    copyright: item.copyright || null,
    image_url: item.image_url || item.url || null,
    description: item.description || null
  };
}

function validateImportFormat(body) {
  if (!body || typeof body !== 'object') return { valid: false, error: '无效的数据格式' };
  const data = body.data;
  if (!data || typeof data !== 'object') return { valid: false, error: '缺少 data 字段' };
  const years = Object.keys(data);
  if (years.length === 0) return { valid: false, error: 'data 字段为空' };
  return { valid: true };
}

async function handleImport(body, env) {
  const validation = validateImportFormat(body);
  if (!validation.valid) return { success: false, error: validation.error };

  const yearMonthMap = body.data;
  const currentYear = String(new Date().getFullYear());
  
  const archiveKeys = await getAllArchiveKeys(env);
  const archivedYears = new Set(archiveKeys.map(k => k.replace(ARCHIVE_PREFIX, '')));

  const archiveDataMap = {};
  const monthDataMap = {};
  const marketConfigUpdates = {};

  for (const year of archivedYears) {
    archiveDataMap[year] = await getArchiveData(env, year);
  }

  let imported = 0;

  for (const [year, months] of Object.entries(yearMonthMap)) {
    const isArchived = archivedYears.has(year) || year !== currentYear;
    
    if (isArchived) {
      if (!archiveDataMap[year]) {
        archiveDataMap[year] = {};
      }
      const archiveData = archiveDataMap[year];
      
      for (const [ym, markets] of Object.entries(months)) {
        if (!archiveData[ym]) archiveData[ym] = {};
        for (const [market, newItems] of Object.entries(markets)) {
          if (!Array.isArray(newItems)) continue;
          if (!archiveData[ym][market]) archiveData[ym][market] = [];
          const existingMap = new Map(archiveData[ym][market].map(i => [i.date, i]));
          for (const item of newItems) {
            if (!validateEntry(item)) continue;
            existingMap.set(item.date, cleanItem(item));
            imported++;
            updateMarketConfigInMemory(marketConfigUpdates, market, ym);
          }
          archiveData[ym][market] = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        }
      }
    } else {
      for (const [ym, markets] of Object.entries(months)) {
        const key = PREFIX + ym;
        if (!monthDataMap[key]) {
          monthDataMap[key] = await getMonthData(env, key);
        }
        const monthData = monthDataMap[key];
        
        for (const [market, newItems] of Object.entries(markets)) {
          if (!Array.isArray(newItems)) continue;
          if (!monthData[market]) monthData[market] = [];
          const existingMap = new Map(monthData[market].map(i => [i.date, i]));
          for (const item of newItems) {
            if (!validateEntry(item)) continue;
            existingMap.set(item.date, cleanItem(item));
            imported++;
            updateMarketConfigInMemory(marketConfigUpdates, market, ym);
          }
          monthData[market] = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        }
      }
    }
  }

  const writeOps = [];

  for (const [year, data] of Object.entries(archiveDataMap)) {
    if (Object.keys(data).length > 0) {
      writeOps.push(env.BING_KV.put(getArchiveKey(year), JSON.stringify(data)));
    }
  }

  for (const [key, data] of Object.entries(monthDataMap)) {
    if (Object.keys(data).length > 0) {
      writeOps.push(env.BING_KV.put(key, JSON.stringify(data)));
    }
  }

  if (Object.keys(marketConfigUpdates).length > 0) {
    const config = await getMarketConfig(env);
    for (const [market, range] of Object.entries(marketConfigUpdates)) {
      if (!config[market]) {
        config[market] = { start_ym: range.start_ym, end_ym: range.end_ym };
      } else {
        if (range.start_ym < config[market].start_ym) {
          config[market].start_ym = range.start_ym;
        }
        if (range.end_ym > config[market].end_ym) {
          config[market].end_ym = range.end_ym;
        }
      }
    }
    writeOps.push(env.BING_KV.put(MARKET_CONFIG_KEY, JSON.stringify(config)));
  }

  await Promise.all(writeOps);

  await clearCache(env);

  const archivedCount = Object.keys(archiveDataMap).filter(y => !archivedYears.has(y)).length;
  
  return { 
    success: true, 
    imported, 
    years: Object.keys(yearMonthMap),
    archivedYears: Object.keys(archiveDataMap),
    newArchivedYears: archivedCount
  };
}

function updateMarketConfigInMemory(config, market, ym) {
  if (!config[market]) {
    config[market] = { start_ym: ym, end_ym: ym };
  } else {
    if (ym < config[market].start_ym) {
      config[market].start_ym = ym;
    }
    if (ym > config[market].end_ym) {
      config[market].end_ym = ym;
    }
  }
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

function getRecentMonths(count = 2) {
  const now = new Date();
  const months = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0');
    months.push(ym);
  }
  return months;
}

const PUBLIC_ROUTES = {
  '/json': async ({ env, all }) => {
    if (all === '1') {
      const cached = await getAllData(env);
      return json({
        data: cached.data,
        market_time_config: cached.marketConfig
      });
    }
    return json(await getRecentData(env, 2));
  }
};

const PROTECTED_ROUTES = {
  '/update': async ({ env }) => {
    return json(await updateAllMarkets(env));
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

    if (!year && !month && !date && !market) {
      return json({ success: false, error: '请至少指定一个参数：year、month、date 或 market' }, 400);
    }

    if (!year && !month && !date && market) {
      const archiveKeys = await getAllArchiveKeys(env);
      for (const archiveKey of archiveKeys) {
        const archiveData = await env.BING_KV.get(archiveKey, 'json');
        if (archiveData) {
          for (const ym of Object.keys(archiveData)) {
            delete archiveData[ym][market];
            if (Object.keys(archiveData[ym]).length === 0) {
              delete archiveData[ym];
            }
          }
          if (Object.keys(archiveData).length === 0) {
            await env.BING_KV.delete(archiveKey);
          } else {
            await env.BING_KV.put(archiveKey, JSON.stringify(archiveData));
          }
        }
      }

      const monthKeys = await getAllMonthKeys(env);
      for (const k of monthKeys) {
        const monthData = await getMonthData(env, k);
        delete monthData[market];
        if (Object.keys(monthData).length === 0) {
          await env.BING_KV.delete(k);
        } else {
          await saveMonthData(env, k, monthData);
        }
      }

      const config = await getMarketConfig(env);
      delete config[market];
      await saveMarketConfig(env, config);

      await clearCache(env);
      return json({ success: true, message: `已删除 ${market} 的所有数据` });
    }

    if (date) {
      const normalizedDate = String(date).replace(/-/g, '');
      if (!/^\d{8}$/.test(normalizedDate)) {
        return json({ success: false, error: '日期格式错误，应为 YYYYMMDD 格式' }, 400);
      }
      const ym = normalizedDate.slice(0, 6);
      const yearStr = normalizedDate.slice(0, 4);

      const archiveKeys = await getAllArchiveKeys(env);
      const isArchived = archiveKeys.some(k => k === ARCHIVE_PREFIX + yearStr);

      if (market) {
        if (isArchived) {
          let archiveData = await getArchiveData(env, yearStr);
          if (archiveData[ym] && archiveData[ym][market]) {
            archiveData[ym][market] = archiveData[ym][market].filter(item => item.date !== normalizedDate);
            if (archiveData[ym][market].length === 0) {
              delete archiveData[ym][market];
            }
            if (Object.keys(archiveData[ym]).length === 0) {
              delete archiveData[ym];
            }
            await saveArchiveData(env, yearStr, archiveData);
          }
        } else {
          const monthKey = PREFIX + ym;
          const monthData = await getMonthData(env, monthKey);
          if (monthData[market]) {
            monthData[market] = monthData[market].filter(item => item.date !== normalizedDate);
            if (monthData[market].length === 0) {
              delete monthData[market];
            }
            if (Object.keys(monthData).length === 0) {
              await env.BING_KV.delete(monthKey);
            } else {
              await saveMonthData(env, monthKey, monthData);
            }
          }
        }
        await clearCache(env);
        return json({ success: true, message: `已删除 ${normalizedDate} 的 ${market} 数据` });
      } else {
        if (isArchived) {
          let archiveData = await getArchiveData(env, yearStr);
          if (archiveData[ym]) {
            delete archiveData[ym];
            if (Object.keys(archiveData).length === 0) {
              await env.BING_KV.delete(ARCHIVE_PREFIX + yearStr);
            } else {
              await saveArchiveData(env, yearStr, archiveData);
            }
          }
        } else {
          await env.BING_KV.delete(PREFIX + ym);
        }
        await clearCache(env);
        return json({ success: true, message: `已删除 ${normalizedDate} 所有市场数据` });
      }
    }

    if (month) {
      const normalizedMonth = String(month).replace(/-/g, '');
      if (!/^\d{6}$/.test(normalizedMonth)) {
        return json({ success: false, error: '月份格式错误，应为 YYYYMM 格式' }, 400);
      }
      const yearStr = normalizedMonth.slice(0, 4);

      const archiveKeys = await getAllArchiveKeys(env);
      const isArchived = archiveKeys.some(k => k === ARCHIVE_PREFIX + yearStr);

      if (market) {
        if (isArchived) {
          let archiveData = await getArchiveData(env, yearStr);
          if (archiveData[normalizedMonth]) {
            delete archiveData[normalizedMonth][market];
            if (Object.keys(archiveData[normalizedMonth]).length === 0) {
              delete archiveData[normalizedMonth];
            }
            await saveArchiveData(env, yearStr, archiveData);
          }
        } else {
          const monthKey = PREFIX + normalizedMonth;
          const monthData = await getMonthData(env, monthKey);
          delete monthData[market];
          if (Object.keys(monthData).length === 0) {
            await env.BING_KV.delete(monthKey);
          } else {
            await saveMonthData(env, monthKey, monthData);
          }
        }
        await clearCache(env);
        return json({ success: true, message: `已删除 ${normalizedMonth} 的 ${market} 数据` });
      } else {
        if (isArchived) {
          let archiveData = await getArchiveData(env, yearStr);
          delete archiveData[normalizedMonth];
          if (Object.keys(archiveData).length === 0) {
            await env.BING_KV.delete(ARCHIVE_PREFIX + yearStr);
          } else {
            await saveArchiveData(env, yearStr, archiveData);
          }
        } else {
          await env.BING_KV.delete(PREFIX + normalizedMonth);
        }
        await clearCache(env);
        return json({ success: true, message: `已删除 ${normalizedMonth} 所有市场数据` });
      }
    }

    if (year) {
      const normalizedYear = String(year);
      if (!/^\d{4}$/.test(normalizedYear)) {
        return json({ success: false, error: '年份格式错误，应为 YYYY 格式' }, 400);
      }

      if (market) {
        const archiveKey = ARCHIVE_PREFIX + normalizedYear;
        const archiveData = await env.BING_KV.get(archiveKey, 'json');
        if (archiveData) {
          for (const ym of Object.keys(archiveData)) {
            delete archiveData[ym][market];
            if (Object.keys(archiveData[ym]).length === 0) {
              delete archiveData[ym];
            }
          }
          if (Object.keys(archiveData).length === 0) {
            await env.BING_KV.delete(archiveKey);
          } else {
            await saveArchiveData(env, normalizedYear, archiveData);
          }
        }

        const monthKeys = await getAllMonthKeys(env);
        const yearKeys = monthKeys.filter(k => getYearFromKey(k) === normalizedYear);
        for (const k of yearKeys) {
          const monthData = await getMonthData(env, k);
          delete monthData[market];
          if (Object.keys(monthData).length === 0) {
            await env.BING_KV.delete(k);
          } else {
            await saveMonthData(env, k, monthData);
          }
        }
        await clearCache(env);
        return json({ success: true, message: `已删除 ${normalizedYear} 年的 ${market} 数据` });
      } else {
        const archiveKey = ARCHIVE_PREFIX + normalizedYear;
        await env.BING_KV.delete(archiveKey);

        const monthKeys = await getAllMonthKeys(env);
        const yearKeys = monthKeys.filter(k => getYearFromKey(k) === normalizedYear);
        for (const k of yearKeys) {
          await env.BING_KV.delete(k);
        }

        await clearCache(env);
        return json({ success: true, message: `已删除 ${normalizedYear} 年所有市场数据` });
      }
    }

    return json({ success: false, error: '请指定 year、month、date 或 market 参数' }, 400);
  },
  '/api/archive': async ({ env, request }) => {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const { year } = body;

    if (year) {
      const normalizedYear = String(year);
      if (!/^\d{4}$/.test(normalizedYear)) {
        return json({ success: false, error: '年份格式错误，应为 YYYY 格式' }, 400);
      }
      return json(await archiveYear(env, normalizedYear));
    }

    return json(await checkAndArchive(env));
  }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const all = url.searchParams.get('all');
    const ctx_ = { env, url, all, request };

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
      (async () => {
        await checkAndArchive(env);
        await updateAllMarkets(env);
        await buildCache(env);
      })()
    );
  }
};
