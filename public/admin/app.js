const MARKET_NAMES = window.BING_MARKETS.names;

const $ = id => document.getElementById(id);

const escapeHtml = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

const getToken = () => sessionStorage.getItem('token');

const api = async (path, opts = {}) => {
  const token = getToken();
  opts.headers = { ...opts.headers };
  if (token) {
    opts.headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const response = await fetch(path, opts);
    if (!response.ok) {
      if (response.status === 401) {
        logout();
        return { error: '需要认证' };
      }
      return { error: `请求失败: ${response.status}` };
    }
    return await response.json();
  } catch (e) {
    return { error: '网络错误: ' + e.message };
  }
};

function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'sakura';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButtons(saved);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeButtons(theme);
}

function updateThemeButtons(activeTheme) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === activeTheme);
  });
}

function showMainView() {
  $('loginView').classList.add('hidden');
  $('mainView').classList.remove('hidden');
  $('headerActions').style.display = 'flex';
  refreshStats();
}

function hideMainView() {
  $('loginView').classList.remove('hidden');
  $('mainView').classList.add('hidden');
  $('headerActions').style.display = 'none';
}

async function login() {
  const token = $('tokenInput').value.trim();
  if (!token) return toast('请输入 Token', 'error');

  const btn = document.querySelector('.btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<span>验证中...</span>';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const r = await response.json();

    if (r.success) {
      sessionStorage.setItem('token', token);
      showMainView();
      toast('登录成功', 'success');
    } else {
      toast(r.error || 'Token 错误', 'error');
    }
  } catch (e) {
    toast('请求失败: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '<span>进入</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
}

function logout() {
  sessionStorage.removeItem('token');
  hideMainView();
  $('tokenInput').value = '';
}

async function checkLogin() {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const r = await response.json();
    if (r.success) {
      showMainView();
    } else {
      sessionStorage.removeItem('token');
    }
  } catch {
    sessionStorage.removeItem('token');
  }
}

let manifest = { months: {}, counts: {}, latest: {} };
let marketConfig = {};
const monthCache = new Map();   // `${market}:${ym}` -> items

function monthsOfMarket(market) {
  return (manifest.months?.[market] || []).slice().sort().reverse();
}

function countOf(market, ym) {
  return manifest.counts?.[market]?.[ym] || 0;
}

// 按月按市场拉取并缓存，避免重复请求
async function fetchMonth(ym, market) {
  const key = `${market}:${ym}`;
  if (monthCache.has(key)) return monthCache.get(key);

  const r = await api(`/api/month?ym=${ym}&market=${encodeURIComponent(market)}&full=1`);
  const items = Array.isArray(r?.data) ? r.data : [];
  monthCache.set(key, items);
  return items;
}

// 数据变更后索引与月份缓存都失效
function invalidateCache() {
  monthCache.clear();
}

async function refreshStats() {
  invalidateCache();
  const mf = await api('/api/manifest');
  if (!mf || mf.error) {
    if (mf?.error === '需要认证') return;
    toast(mf?.error || '加载失败', 'error');
    return;
  }

  manifest = {
    months: mf.months || {},
    counts: mf.counts || {},
    latest: mf.latest || {}
  };
  marketConfig = mf.market_time_config || {};

  const markets = Object.keys(manifest.months).sort();
  const allMonths = new Set();
  let total = 0;

  for (const market of markets) {
    for (const ym of manifest.months[market] || []) {
      allMonths.add(ym);
      total += countOf(market, ym);
    }
  }

  $('statsArea').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(markets.length))}</div>
      <div class="stat-label">市场数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(allMonths.size))}</div>
      <div class="stat-label">月份数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(total))}</div>
      <div class="stat-label">总记录数</div>
    </div>
  `;

  renderMonthTree();
}

// 树结构直接由索引渲染：市场 → 年 → 月（含条数），日明细在展开时按需加载
function renderMonthTree() {
  const container = $('monthTable');
  container.innerHTML = '';

  const markets = Object.keys(manifest.months || {}).sort();

  markets.forEach(market => {
    const ymList = monthsOfMarket(market);
    if (!ymList.length) return;

    const byYear = new Map();
    for (const ym of ymList) {
      const y = ym.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(ym);
    }

    const marketCount = ymList.reduce((sum, ym) => sum + countOf(market, ym), 0);
    const marketName = MARKET_NAMES[market] || market;

    const marketEl = document.createElement('div');
    marketEl.className = 'tree-market';
    marketEl.innerHTML = `
      <div class="tree-header">
        <div class="tree-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <span class="tree-label">${escapeHtml(market)}</span>
        <span class="tree-label-sub">${escapeHtml(marketName)}</span>
        <span class="tree-count">${escapeHtml(String(marketCount))} 张</span>
        <span class="tree-delete" data-market="${escapeHtml(market)}">删除</span>
      </div>
      <div class="tree-children"></div>
    `;

    const marketChildrenEl = marketEl.querySelector('.tree-children');

    [...byYear.keys()].sort((a, b) => b.localeCompare(a)).forEach(year => {
      const monthsOfYear = byYear.get(year);
      const yearCount = monthsOfYear.reduce((sum, ym) => sum + countOf(market, ym), 0);

      const yearEl = document.createElement('div');
      yearEl.className = 'tree-year';
      yearEl.innerHTML = `
        <div class="tree-header">
          <div class="tree-toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <span class="tree-label">${escapeHtml(year)} 年</span>
          <span class="tree-count">${escapeHtml(String(yearCount))} 张</span>
        </div>
        <div class="tree-children"></div>
      `;

      const yearChildrenEl = yearEl.querySelector('.tree-children');

      monthsOfYear.forEach(ym => {
        const month = ym.slice(4, 6);
        const monthEl = document.createElement('div');
        monthEl.className = 'tree-month';
        monthEl.dataset.ym = ym;
        monthEl.dataset.market = market;
        monthEl.innerHTML = `
          <div class="tree-header">
            <div class="tree-toggle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <span class="tree-label">${escapeHtml(month)} 月</span>
            <span class="tree-count">${escapeHtml(String(countOf(market, ym)))} 张</span>
            <span class="tree-delete" data-month="${escapeHtml(ym)}" data-market="${escapeHtml(market)}">删除</span>
          </div>
          <div class="tree-children"></div>
        `;

        monthEl.querySelector('.tree-header').addEventListener('click', (e) => {
          if (e.target.closest('.tree-delete')) return;
          monthEl.classList.toggle('expanded');
          if (monthEl.classList.contains('expanded')) loadMonthDays(monthEl, ym, market);
        });

        yearChildrenEl.appendChild(monthEl);
      });

      yearEl.querySelector('.tree-header').addEventListener('click', (e) => {
        if (e.target.closest('.tree-delete')) return;
        yearEl.classList.toggle('expanded');
      });

      marketChildrenEl.appendChild(yearEl);
    });

    marketEl.querySelector('.tree-header').addEventListener('click', (e) => {
      if (e.target.closest('.tree-delete')) return;
      marketEl.classList.toggle('expanded');
    });

    container.appendChild(marketEl);
  });

  container.querySelectorAll('.tree-delete').forEach(el => {
    el.addEventListener('click', handleDeleteClick);
  });
}

async function loadMonthDays(monthEl, ym, market) {
  if (monthEl.dataset.daysLoaded === '1') return;
  monthEl.dataset.daysLoaded = '1';

  const childrenEl = monthEl.querySelector('.tree-children');
  childrenEl.innerHTML = '<div class="tree-day"><span class="tree-desc">加载中...</span></div>';

  const items = await fetchMonth(ym, market);
  childrenEl.innerHTML = '';

  items.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach(item => {
    const dayEl = document.createElement('div');
    dayEl.className = 'tree-day';
    dayEl.innerHTML = `
      <span class="tree-label">${escapeHtml(item.date.slice(6, 8))} 日</span>
      <span class="tree-desc">${escapeHtml(item.copyright || item.title || '')}</span>
      <span class="tree-delete" data-date="${escapeHtml(item.date)}" data-market="${escapeHtml(market)}">删除</span>
    `;
    dayEl.querySelector('.tree-delete').addEventListener('click', handleDeleteClick);
    childrenEl.appendChild(dayEl);
  });

  if (!items.length) {
    childrenEl.innerHTML = '<div class="tree-day"><span class="tree-desc">暂无数据</span></div>';
  }
}

async function handleDeleteClick(e) {
  e.stopPropagation();
  const el = e.target;
  const month = el.dataset.month;
  const date = el.dataset.date;
  const market = el.dataset.market;

  let title = '';
  let details = [];
  let body = {};

  if (month) {
    const yearOfMonth = month.slice(0, 4);
    const monthNum = month.slice(4, 6);
    title = `删除 ${yearOfMonth} 年 ${monthNum} 月数据`;
    details = [
      `市场: ${market}`,
      `共 ${countOf(market, month)} 条记录`
    ];
    body = { month, market };
  } else if (date && market) {
    const yearOfDate = date.slice(0, 4);
    const monthOfDate = date.slice(4, 6);
    const day = date.slice(6, 8);
    const items = monthCache.get(`${market}:${date.slice(0, 6)}`) || [];
    const item = items.find(i => i.date === date);
    title = `删除 ${yearOfDate} 年 ${monthOfDate} 月 ${day} 日数据`;
    details = [
      `市场: ${market}`,
      `版权信息: ${item?.copyright || '无'}`
    ];
    body = { date, market };
  } else if (market) {
    const total = monthsOfMarket(market).reduce((sum, ym) => sum + countOf(market, ym), 0);
    title = `删除市场 ${market} 数据`;
    details = [
      `共 ${total} 条记录`
    ];
    body = { market };
  }

  if (!title) return;
  if (!await showConfirmDialog(title, details)) return;

  const r = await api('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r?.success) {
    toast(r.message, 'success');
    refreshStats();
  } else if (r?.error) {
    toast(r.error, 'error');
  }
}

function showConfirmDialog(title, details) {
  const existing = $('confirmDialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'confirmDialog';
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <div class="confirm-content">
      <div class="confirm-title">${escapeHtml(title)}</div>
      <div class="confirm-details">
        ${details.map(d => `<div class="confirm-detail">${escapeHtml(d)}</div>`).join('')}
      </div>
      <div class="confirm-actions">
        <button class="confirm-btn cancel">取消</button>
        <button class="confirm-btn confirm">确认删除</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  return new Promise(resolve => {
    dialog.querySelector('.cancel').onclick = () => {
      dialog.remove();
      resolve(false);
    };
    dialog.querySelector('.confirm').onclick = () => {
      dialog.remove();
      resolve(true);
    };
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        dialog.remove();
        resolve(false);
      }
    };
  });
}

async function triggerUpdate() {
  toast('正在更新所有市场...', 'info');
  const r = await api('/update');
  if (r?.error === '需要认证') return;

  if (Array.isArray(r?.results)) {
    const success = r.results.filter(x => x.success).length;
    const failed = r.results.filter(x => !x.success).length;
    toast(`更新完成: 成功 ${success}, 失败 ${failed}`, failed > 0 ? 'error' : 'success');
  } else if (r?.error) {
    toast(`失败: ${r.error}`, 'error');
  }
  refreshStats();
}

function groupArrayByDate(items) {
  const result = {};
  items.forEach(item => {
    if (!item?.date || !/^\d{8}$/.test(String(item.date))) return;
    const year = item.date.slice(0, 4);
    const ym = item.date.slice(0, 6);
    const market = item.belong_market || 'unknown';
    if (!result[year]) result[year] = {};
    if (!result[year][ym]) result[year][ym] = {};
    if (!result[year][ym][market]) result[year][ym][market] = [];
    result[year][ym][market].push({
      date: item.date,
      title: item.title || null,
      copyright: item.copyright || null,
      image_url: item.image_url || item.url || null,
      description: item.description || null
    });
  });
  return result;
}

async function importData(data) {
  let importBody;
  if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    importBody = data;
  } else if (Array.isArray(data)) {
    importBody = { data: groupArrayByDate(data) };
  } else if (data?.wallpaper_list) {
    importBody = { data: groupArrayByDate(data.wallpaper_list) };
  } else {
    return toast('无有效数据格式', 'error');
  }
  
  const yearCount = Object.keys(importBody.data).length;
  if (yearCount === 0) return toast('无有效数据', 'error');
  toast(`导入 ${yearCount} 年数据...`, 'info');

  const pb = $('importProgress');
  const fill = pb.querySelector('.progress-fill');
  pb.classList.add('show');
  fill.style.width = '30%';

  const r = await api('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(importBody)
  });

  fill.style.width = '100%';
  setTimeout(() => {
    pb.classList.remove('show');
    fill.style.width = '0%';
  }, 800);

  if (r?.success) {
    $('importResult').innerHTML = `<span class="success">新增 ${escapeHtml(String(r.imported))} 条</span>`;
    toast('导入成功', 'success');
    refreshStats();
  } else if (r?.error === '需要认证') {
    logout();
  } else {
    $('importResult').innerHTML = `<span class="error">${escapeHtml(r?.error || '未知错误')}</span>`;
  }
}

async function exportData(download = false) {
  const start = $('exportStart').value.trim().replace(/-/g, '');
  const end = $('exportEnd').value.trim().replace(/-/g, '');
  const market = $('exportMarket').value.trim();

  // 按索引筛出要导出的月份，再逐月拉取，避免一次性加载全量数据
  const targets = [];
  for (const [mkt, list] of Object.entries(manifest.months || {})) {
    if (market && mkt !== market) continue;
    for (const ym of list) {
      if (start && ym < start) continue;
      if (end && ym > end) continue;
      targets.push({ market: mkt, ym });
    }
  }

  if (!targets.length) {
    toast('无匹配数据', 'error');
    return;
  }

  toast(`正在导出 ${targets.length} 个月份...`, 'info');

  const filteredYearData = {};
  for (const { market: mkt, ym } of targets) {
    const items = await fetchMonth(ym, mkt);
    if (!items.length) continue;
    const year = ym.slice(0, 4);
    if (!filteredYearData[year]) filteredYearData[year] = {};
    if (!filteredYearData[year][ym]) filteredYearData[year][ym] = {};
    filteredYearData[year][ym][mkt] = items;
  }

  if (Object.keys(filteredYearData).length === 0) {
    toast('无匹配数据', 'error');
    return;
  }

  const exportResult = {
    data: filteredYearData,
    market_time_config: marketConfig
  };

  const jsonStr = JSON.stringify(exportResult, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bing_wallpapers.json';
    a.click();
    URL.revokeObjectURL(url);
    const total = Object.values(filteredYearData).reduce((sum, months) =>
      sum + Object.values(months).reduce((s, markets) =>
        s + Object.values(markets).reduce((c, items) => c + items.length, 0), 0), 0);
    toast(`导出 ${total} 条数据`, 'success');
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

async function triggerArchive() {
  const year = $('archiveYear').value.trim();
  if (!year || !/^\d{4}$/.test(year)) {
    toast('请输入有效的年份', 'error');
    return;
  }

  if (!await showConfirmDialog(`归档 ${year} 年数据`, [
    '归档后将删除原月份数据',
    '数据将保存到年度归档中'
  ])) return;

  toast(`正在归档 ${year} 年数据...`, 'info');
  const r = await api('/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year })
  });

  if (r?.success) {
    toast(r.message, 'success');
    refreshStats();
  } else if (r?.error) {
    toast(r.error, 'error');
  }
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      importData(JSON.parse(e.target.result));
    } catch {
      toast('解析失败', 'error');
    }
  };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  $('logoutBtn').addEventListener('click', logout);
  $('loginBtn').addEventListener('click', login);
  $('exportPreviewBtn').addEventListener('click', () => exportData(false));
  $('exportDownloadBtn').addEventListener('click', () => exportData(true));
  $('updateBtn').addEventListener('click', triggerUpdate);
  $('refreshBtn').addEventListener('click', refreshStats);
  $('archiveBtn').addEventListener('click', triggerArchive);

  const copyPromptBtn = $('copyPromptBtn');
  if (copyPromptBtn) {
    copyPromptBtn.addEventListener('click', () => {
      const prompt = $('convertPrompt').textContent;
      navigator.clipboard.writeText(prompt).then(() => {
        toast('提示词已复制', 'success');
      }).catch(() => {
        toast('复制失败', 'error');
      });
    });
  }

  const drop = $('dropZone');
  const input = $('fileInput');

  drop.onclick = () => input.click();

  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  };

  drop.ondragleave = () => drop.classList.remove('dragover');

  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  };

  input.onchange = (e) => {
    if (e.target.files[0]) readFile(e.target.files[0]);
  };

  $('tokenInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });

  checkLogin();
});
