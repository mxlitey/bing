const DEFAULT_MARKETS = [
  'zh-CN', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP',
  'en-CA', 'fr-CA', 'en-IN', 'en-WW', 'es-ES', 'it-IT', 'pt-BR'
];

const PREFIX = 'bing_';
const ARCHIVE_PREFIX = 'archive_';
const TEMP_PREFIX = 'temp_';
const MARKET_CONFIG_KEY = 'market_time_config';
const MARKET_INDEX_KEY = 'market_index';
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8', ...CORS_HEADERS }
});

const getMonthKey = (date) => PREFIX + date.substring(0, 6);
const getArchiveKey = (year) => ARCHIVE_PREFIX + year;
const getTempKey = (market) => TEMP_PREFIX + market;
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

async function getAllData(env) {
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

  return { data, marketConfig };
}

// 列表渲染只需要这几个字段，description 占全量体积 80% 以上且前端不使用
function slimItem(item) {
  return {
    date: item.date,
    title: item.title || null,
    copyright: item.copyright || null,
    image_url: item.image_url || item.url || null
  };
}

function buildIndexFromData(data) {
  const months = {};   // market -> 有数据的月份列表（升序）
  const counts = {};   // market -> { ym: 条数 }
  const latest = {};   // market -> 最新一条记录

  // data 结构：{ year: { ym: { market: items } } }
  for (const yearMonths of Object.values(data)) {
    for (const [ym, markets] of Object.entries(yearMonths)) {
      for (const [market, items] of Object.entries(markets)) {
        if (!Array.isArray(items) || items.length === 0) continue;
        if (!months[market]) {
          months[market] = [];
          counts[market] = {};
        }
        months[market].push(ym);
        counts[market][ym] = items.length;

        const last = items[items.length - 1];
        if (!latest[market] || last.date > latest[market].date) {
          latest[market] = slimItem(last);
        }
      }
    }
  }

  for (const market of Object.keys(months)) months[market].sort();

  return { v: 2, months, counts, latest };
}

// 索引是纯派生数据，可随时重建；写入数据后调用 invalidateIndex 让它下次重建
async function invalidateIndex(env) {
  await env.BING_KV.delete(MARKET_INDEX_KEY);
}

async function getMarketIndex(env) {
  const cached = await env.BING_KV.get(MARKET_INDEX_KEY, 'json');
  if (cached?.v === 2) return cached;

  const { data } = await getAllData(env);
  const index = buildIndexFromData(data);
  await env.BING_KV.put(MARKET_INDEX_KEY, JSON.stringify(index));
  return index;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatCopyright(str) {
  if (str == null) return '';
  return escapeHtml(str).replace(/([（(])/g, '<span class="nobr">$1').replace(/([）)])/g, '$1</span>');
}

// 读取单个月份中指定市场的记录（归档年份自动回退到 archive_YYYY）
async function getMonthForMarket(env, ym, market, slim = true) {
  const bucket = await getMonthBucket(env, ym);
  let items = bucket[market];
  if (!Array.isArray(items) || items.length === 0) return [];

  items = items.slice().sort((a, b) => b.date.localeCompare(a.date));
  return slim ? items.map(slimItem) : items;
}

async function getManifest(env, market) {
  const [index, marketConfig] = await Promise.all([getMarketIndex(env), getMarketConfig(env)]);

  const months = market ? (index.months[market] || []) : index.months;
  const counts = market ? (index.counts?.[market] || {}) : (index.counts || {});
  const latest = market ? (index.latest[market] || null) : index.latest;

  return {
    months,
    counts,
    latest,
    market_time_config: marketConfig
  };
}

// 当天日期按北京时间计算，避免 UTC 与本地日期错位
function getTodayYmd() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

async function getMonthBucket(env, ym) {
  const archiveData = await getArchiveData(env, ym.slice(0, 4));
  if (archiveData[ym]) return archiveData[ym];
  return await getMonthData(env, PREFIX + ym);
}

// 优先取当天，当天还没抓到时依次回退到本月、上月最新一条
async function findWallpaper(env, market) {
  const today = getTodayYmd();
  const thisMonth = today.slice(0, 6);
  const lastMonthDate = new Date(Date.UTC(+today.slice(0, 4), +today.slice(4, 6) - 2, 1));
  const lastMonth =
    lastMonthDate.getUTCFullYear().toString() +
    String(lastMonthDate.getUTCMonth() + 1).padStart(2, '0');

  for (const ym of [thisMonth, lastMonth]) {
    const items = (await getMonthBucket(env, ym))[market];
    if (!Array.isArray(items) || items.length === 0) continue;
    return items.find(i => i.date === today) || items[items.length - 1];
  }

  return null;
}

const IMAGE_HEADERS = {
  'cache-control': 'public, max-age=600, s-maxage=600',
  'access-control-allow-origin': '*'
};

// 直接代理图片二进制，与常见「随机壁纸」接口一致的返回形式
async function imageResponse(item, market, request) {
  const src = (item.image_url || item.url || '').replace('_UHD.jpg', '_1920x1080.jpg');
  if (!src) return json({ success: false, error: '该壁纸缺少图片地址' }, 404);

  const upstream = await fetch(src, { cf: { cacheEverything: true, cacheTtl: 86400 } });
  if (!upstream.ok) {
    return json({ success: false, error: '壁纸下载失败: ' + upstream.status }, 502);
  }

  const headers = {
    ...IMAGE_HEADERS,
    'content-type': upstream.headers.get('content-type') || 'image/jpeg',
    'x-wallpaper-date': item.date,
    'x-wallpaper-market': market
  };
  const length = upstream.headers.get('content-length');
  if (length) headers['content-length'] = length;

  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(upstream.body, { headers });
}

// 首屏只注入轻量索引（各市场月份列表 + 最新一条），不再内联全量数据
async function injectHeroData(env, html) {
  const manifest = await getManifest(env);

  const globalLatest = Object.values(manifest.latest || {})
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const inlineData = `<script>window.__BING_MANIFEST__=${JSON.stringify(manifest)};</script>`;
  html = html.replace('</head>', inlineData + '</head>');

  if (!globalLatest) return html;

  const dateFormatted = `${globalLatest.date.slice(0, 4)}-${globalLatest.date.slice(4, 6)}-${globalLatest.date.slice(6, 8)}`;

  try {
    const imgUrl = new URL(globalLatest.image_url);
    const preconnect = `<link rel="preconnect" href="${imgUrl.origin}">`;
    html = html.replace('</head>', preconnect + '</head>');
  } catch {}

  return html
    .replace('id="heroDate"></div>', `id="heroDate">${dateFormatted}</div>`)
    .replace('id="heroTitle"></h1>', `id="heroTitle">${formatCopyright(globalLatest.copyright)}</h1>`);
}

function updateMarketConfigInMemory(config, market, ym) {
  if (!config[market]) {
    config[market] = { start_ym: ym, end_ym: ym };
    return;
  }
  if (ym < config[market].start_ym) config[market].start_ym = ym;
  if (ym > config[market].end_ym) config[market].end_ym = ym;
}

async function updateBingForMarket(env, market) {
  try {
    const bingDomain = market === 'zh-CN' ? 'cn.bing.com' : 'www.bing.com';
    const bingApi = `https://${bingDomain}/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${market}`;
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

    await env.BING_KV.put(getTempKey(market), JSON.stringify(entry));

    return { success: true, market, date: entry.date };
  } catch (e) {
    return { success: false, market, error: '更新失败: ' + e.message };
  }
}

async function verifyYesterdayData(env, markets) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.getFullYear().toString() + 
    String(yesterday.getMonth() + 1).padStart(2, '0') + 
    String(yesterday.getDate()).padStart(2, '0');
  
  const key = getMonthKey(yesterdayStr);
  const monthData = await getMonthData(env, key);
  
  const tempData = {};
  for (const market of markets) {
    const data = await env.BING_KV.get(getTempKey(market), 'json');
    if (data && data.date === yesterdayStr) {
      tempData[market] = data;
    }
  }
  
  const missingMarkets = [];
  const mismatchedMarkets = [];
  
  for (const market of Object.keys(tempData)) {
    const temp = tempData[market];
    const final = monthData[market]?.find(item => item.date === yesterdayStr);
    
    if (!final) {
      missingMarkets.push(market);
    } else if (temp.image_url !== final.image_url || temp.copyright !== final.copyright) {
      mismatchedMarkets.push(market);
    }
  }
  
  return { 
    verified: missingMarkets.length === 0 && mismatchedMarkets.length === 0, 
    missingMarkets, 
    mismatchedMarkets,
    yesterdayStr 
  };
}

async function updateAllMarkets(env) {
  const config = await getMarketConfig(env);
  const markets = Object.keys(config);
  
  const verification = await verifyYesterdayData(env, markets);
  
  const retryMarkets = [...verification.missingMarkets, ...verification.mismatchedMarkets];
  let retryResults = [];
  
  if (retryMarkets.length > 0) {
    const yesterdayKey = getMonthKey(verification.yesterdayStr);
    const monthData = await getMonthData(env, yesterdayKey);
    
    for (const market of retryMarkets) {
      const tempData = await env.BING_KV.get(getTempKey(market), 'json');
      if (tempData && tempData.date === verification.yesterdayStr) {
        if (!monthData[market]) {
          monthData[market] = [];
        }
        const existingIndex = monthData[market].findIndex(item => item.date === verification.yesterdayStr);
        if (existingIndex >= 0) {
          monthData[market][existingIndex] = tempData;
        } else {
          monthData[market].push(tempData);
          monthData[market].sort((a, b) => a.date.localeCompare(b.date));
        }
        retryResults.push({ market, action: 'retry_success' });
      }
    }
    
    await saveMonthData(env, yesterdayKey, monthData);
  }
  
  const results = await Promise.all(markets.map(m => updateBingForMarket(env, m)));
  
  const tempData = {};
  for (const market of markets) {
    const data = await env.BING_KV.get(getTempKey(market), 'json');
    if (data) {
      tempData[market] = data;
    }
  }
  
  const monthDataMap = {};
  const updatedMarkets = [];
  
  for (const [market, entry] of Object.entries(tempData)) {
    const key = getMonthKey(entry.date);
    if (!monthDataMap[key]) {
      monthDataMap[key] = await getMonthData(env, key);
    }
    const monthData = monthDataMap[key];
    
    if (!monthData[market]) {
      monthData[market] = [];
    }
    
    if (!monthData[market].some(item => item.date === entry.date)) {
      monthData[market].push(entry);
      monthData[market].sort((a, b) => a.date.localeCompare(b.date));
      updatedMarkets.push({ market, ym: entry.date.substring(0, 6) });
    }
  }
  
  for (const [key, data] of Object.entries(monthDataMap)) {
    await saveMonthData(env, key, data);
  }
  
  if (updatedMarkets.length > 0) {
    const config = await getMarketConfig(env);
    for (const { market, ym } of updatedMarkets) {
      updateMarketConfigInMemory(config, market, ym);
    }
    await saveMarketConfig(env, config);
  }
  
  return { results, verification, retryResults };
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

  // 归档年份写入 archive_YYYY，当年写入 bing_YYYYMM，其余处理完全一致
  for (const [year, months] of Object.entries(yearMonthMap)) {
    for (const [ym, markets] of Object.entries(months)) {
      const isArchived = archivedYears.has(year) || year !== currentYear;
      const monthKey = isArchived ? null : PREFIX + ym;

      if (!isArchived && !monthDataMap[monthKey]) {
        monthDataMap[monthKey] = await getMonthData(env, monthKey);
      }

      let bucket;
      if (isArchived) {
        if (!archiveDataMap[year]) archiveDataMap[year] = {};
        const archiveData = archiveDataMap[year];
        if (!archiveData[ym]) archiveData[ym] = {};
        bucket = archiveData[ym];
      } else {
        bucket = monthDataMap[monthKey];
      }

      for (const [market, newItems] of Object.entries(markets)) {
        if (!Array.isArray(newItems)) continue;
        if (!bucket[market]) bucket[market] = [];
        const existingMap = new Map(bucket[market].map(i => [i.date, i]));
        for (const item of newItems) {
          if (!validateEntry(item)) continue;
          if (!existingMap.has(item.date)) imported++;
          existingMap.set(item.date, cleanItem(item));
          updateMarketConfigInMemory(marketConfigUpdates, market, ym);
        }
        bucket[market] = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));
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
      updateMarketConfigInMemory(config, market, range.start_ym);
      updateMarketConfigInMemory(config, market, range.end_ym);
    }
    writeOps.push(env.BING_KV.put(MARKET_CONFIG_KEY, JSON.stringify(config)));
  }

  await Promise.all(writeOps);

  const archivedCount = Object.keys(archiveDataMap).filter(y => !archivedYears.has(y)).length;
  
  return { 
    success: true, 
    imported, 
    years: Object.keys(yearMonthMap),
    archivedYears: Object.keys(archiveDataMap),
    newArchivedYears: archivedCount
  };
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

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

async function writeArchiveOrDelete(env, year, data) {
  if (isEmpty(data)) {
    await env.BING_KV.delete(getArchiveKey(year));
  } else {
    await saveArchiveData(env, year, data);
  }
}

async function writeMonthOrDelete(env, key, data) {
  if (isEmpty(data)) {
    await env.BING_KV.delete(key);
  } else {
    await saveMonthData(env, key, data);
  }
}

// 在单个月份对象上执行删除：keepDate 优先（按日期），其次按市场，最后整月
function removeFromMonth(monthData, market, keepDate) {
  const targets = market ? [market] : Object.keys(monthData);

  for (const mkt of targets) {
    const items = monthData[mkt];
    if (!Array.isArray(items)) continue;

    if (keepDate) {
      monthData[mkt] = items.filter(item => item.date !== keepDate);
      if (monthData[mkt].length === 0) delete monthData[mkt];
    } else {
      delete monthData[mkt];
    }
  }
}

// 从年度归档中删除；months 为 null 表示该年份所有月份
async function deleteFromArchive(env, year, months, market, keepDate) {
  const archiveData = await getArchiveData(env, year);
  const targets = months || Object.keys(archiveData);
  let changed = false;

  for (const ym of targets) {
    if (!archiveData[ym]) continue;
    changed = true;
    removeFromMonth(archiveData[ym], market, keepDate);
    if (isEmpty(archiveData[ym])) delete archiveData[ym];
  }

  if (changed) await writeArchiveOrDelete(env, year, archiveData);
}

async function deleteFromMonthly(env, months, market, keepDate) {
  for (const ym of months) {
    const key = PREFIX + ym;

    if (!market && !keepDate) {
      await env.BING_KV.delete(key);
      continue;
    }

    const monthData = await getMonthData(env, key);
    if (isEmpty(monthData)) continue;

    removeFromMonth(monthData, market, keepDate);
    await writeMonthOrDelete(env, key, monthData);
  }
}

function yearMonths(year) {
  return Array.from({ length: 12 }, (_, i) => year + String(i + 1).padStart(2, '0'));
}

// 按「年/月/日」删除，自动判断数据落在归档键还是月度键
async function deleteScope(env, { year, months, market, keepDate }) {
  const archiveKeys = await getAllArchiveKeys(env);
  if (archiveKeys.includes(getArchiveKey(year))) {
    await deleteFromArchive(env, year, months, market, keepDate);
  } else {
    await deleteFromMonthly(env, months, market, keepDate);
  }
}

async function deleteMarketEverywhere(env, market) {
  const archiveKeys = await getAllArchiveKeys(env);
  for (const archiveKey of archiveKeys) {
    await deleteFromArchive(env, archiveKey.slice(ARCHIVE_PREFIX.length), null, market, null);
  }

  const monthKeys = await getAllMonthKeys(env);
  for (const key of monthKeys) {
    const monthData = await getMonthData(env, key);
    if (!monthData[market]) continue;
    delete monthData[market];
    await writeMonthOrDelete(env, key, monthData);
  }

  const config = await getMarketConfig(env);
  delete config[market];
  await saveMarketConfig(env, config);
}

const PUBLIC_ROUTES = {
  // 全量数据，仅用于导出兜底；首页与管理面板均按需走 manifest/month 接口
  '/json': async ({ env }) => {
    const cached = await getAllData(env);
    return json({
      data: cached.data,
      market_time_config: cached.marketConfig
    });
  },
  // 轻量清单：各市场有数据的月份列表 + 最新一条，用于渲染时间线与首屏
  '/api/manifest': async ({ env, url }) => {
    const market = url.searchParams.get('market');
    return json(await getManifest(env, market));
  },
  // 按月按市场拉取，默认剔除 description
  '/api/month': async ({ env, url }) => {
    const ym = (url.searchParams.get('ym') || '').replace(/-/g, '');
    const market = url.searchParams.get('market');

    if (!/^\d{6}$/.test(ym)) {
      return json({ success: false, error: '月份格式错误，应为 YYYYMM 格式' }, 400);
    }
    if (!market) {
      return json({ success: false, error: '缺少 market 参数' }, 400);
    }

    const full = url.searchParams.get('full') === '1';
    const items = await getMonthForMarket(env, ym, market, !full);
    return json({ ym, market, count: items.length, data: items });
  },
  '/api/today': async ({ env, url, request }) => {
    const market = url.searchParams.get('market') || 'zh-CN';
    const item = await findWallpaper(env, market);

    if (!item) {
      return json({ success: false, error: `${market} 暂无壁纸数据` }, 404);
    }

    return imageResponse(item, market, request);
  }
};

const PROTECTED_ROUTES = {
  '/update': async ({ env }) => {
    const result = await updateAllMarkets(env);
    await invalidateIndex(env);
    return json(result);
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
      await deleteMarketEverywhere(env, market);
      return json({ success: true, message: `已删除 ${market} 的所有数据` });
    }

    if (date) {
      const normalizedDate = String(date).replace(/-/g, '');
      if (!/^\d{8}$/.test(normalizedDate)) {
        return json({ success: false, error: '日期格式错误，应为 YYYYMMDD 格式' }, 400);
      }
      const ym = normalizedDate.slice(0, 6);

      await deleteScope(env, {
        year: normalizedDate.slice(0, 4),
        months: [ym],
        market,
        keepDate: normalizedDate
      });

      return json({
        success: true,
        message: market
          ? `已删除 ${normalizedDate} 的 ${market} 数据`
          : `已删除 ${normalizedDate} 所有市场数据`
      });
    }

    if (month) {
      const normalizedMonth = String(month).replace(/-/g, '');
      if (!/^\d{6}$/.test(normalizedMonth)) {
        return json({ success: false, error: '月份格式错误，应为 YYYYMM 格式' }, 400);
      }

      await deleteScope(env, {
        year: normalizedMonth.slice(0, 4),
        months: [normalizedMonth],
        market,
        keepDate: null
      });

      return json({
        success: true,
        message: market
          ? `已删除 ${normalizedMonth} 的 ${market} 数据`
          : `已删除 ${normalizedMonth} 所有市场数据`
      });
    }

    if (year) {
      const normalizedYear = String(year);
      if (!/^\d{4}$/.test(normalizedYear)) {
        return json({ success: false, error: '年份格式错误，应为 YYYY 格式' }, 400);
      }

      if (market) {
        await deleteScope(env, {
          year: normalizedYear,
          months: yearMonths(normalizedYear),
          market,
          keepDate: null
        });
        return json({ success: true, message: `已删除 ${normalizedYear} 年的 ${market} 数据` });
      }

      await env.BING_KV.delete(getArchiveKey(normalizedYear));
      const monthKeys = await getAllMonthKeys(env);
      const yearKeys = monthKeys.filter(k => getYearFromKey(k) === normalizedYear);
      for (const k of yearKeys) {
        await env.BING_KV.delete(k);
      }

      return json({ success: true, message: `已删除 ${normalizedYear} 年所有市场数据` });
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
      const res = await PROTECTED_ROUTES[path](ctx_);
      // 所有写操作统一让索引失效，下次请求时重建
      if (request.method === 'POST') await invalidateIndex(env);
      return res;
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
        await invalidateIndex(env);
      })()
    );
  }
};
