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
  if (token && !opts.skipAuth) {
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
      body: JSON.stringify({ token }),
      skipAuth: true
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

let yearData = {};
let marketConfig = {};

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
  return all;
}

async function refreshStats() {
  const cached = await api('/json?all=1');
  if (!cached || cached.error) {
    if (cached?.error === '需要认证') return;
    return;
  }

  yearData = cached.data || {};
  marketConfig = cached.market_time_config || {};

  const markets = Object.keys(marketConfig).sort();
  const allData = flattenData(yearData);

  let monthCount = 0;
  for (const [year, months] of Object.entries(yearData)) {
    monthCount += Object.keys(months).length;
  }

  const total = allData.length;
  const marketCount = markets.length;

  $('statsArea').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(marketCount))}</div>
      <div class="stat-label">市场数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(monthCount))}</div>
      <div class="stat-label">月份数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(total))}</div>
      <div class="stat-label">总记录数</div>
    </div>
  `;

  renderMonthTree(allData);
}

function renderMonthTree(allData) {
  const tree = {};
  allData.forEach(item => {
    const market = item.belong_market || 'unknown';
    const year = item.date.slice(0, 4);
    const month = item.date.slice(4, 6);
    if (!tree[market]) tree[market] = { count: 0, years: {} };
    tree[market].count++;
    if (!tree[market].years[year]) tree[market].years[year] = { count: 0, months: {} };
    tree[market].years[year].count++;
    if (!tree[market].years[year].months[month]) tree[market].years[year].months[month] = [];
    tree[market].years[year].months[month].push(item);
  });

  const container = $('monthTable');
  container.innerHTML = '';

  Object.keys(tree).sort().forEach(market => {
    const marketData = tree[market];
    const marketEl = document.createElement('div');
    marketEl.className = 'tree-market';
    marketEl.innerHTML = `
      <div class="tree-header">
        <div class="tree-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <span class="tree-label">${escapeHtml(market)}</span>
        <span class="tree-count">${escapeHtml(String(marketData.count))} 张</span>
        <span class="tree-delete" data-market="${escapeHtml(market)}">删除</span>
      </div>
      <div class="tree-children"></div>
    `;

    const marketChildrenEl = marketEl.querySelector('.tree-children');

    Object.keys(marketData.years).sort((a, b) => b.localeCompare(a)).forEach(year => {
      const yearData = marketData.years[year];
      const yearEl = document.createElement('div');
      yearEl.className = 'tree-year';
      yearEl.innerHTML = `
        <div class="tree-header">
          <div class="tree-toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <span class="tree-label">${escapeHtml(year)} 年</span>
          <span class="tree-count">${escapeHtml(String(yearData.count))} 张</span>
        </div>
        <div class="tree-children"></div>
      `;

      const yearChildrenEl = yearEl.querySelector('.tree-children');

      Object.keys(yearData.months).sort((a, b) => b.localeCompare(a)).forEach(month => {
        const monthItems = yearData.months[month];
        const monthEl = document.createElement('div');
        monthEl.className = 'tree-month';
        monthEl.innerHTML = `
          <div class="tree-header">
            <div class="tree-toggle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <span class="tree-label">${escapeHtml(month)} 月</span>
            <span class="tree-count">${escapeHtml(String(monthItems.length))} 张</span>
            <span class="tree-delete" data-month="${escapeHtml(year + month)}" data-market="${escapeHtml(market)}">删除</span>
          </div>
          <div class="tree-children"></div>
        `;

        const monthChildrenEl = monthEl.querySelector('.tree-children');
        monthItems.sort((a, b) => a.date.localeCompare(b.date)).forEach(item => {
          const dayEl = document.createElement('div');
          dayEl.className = 'tree-day';
          dayEl.innerHTML = `
            <span class="tree-label">${escapeHtml(item.date.slice(6, 8))} 日</span>
            <span class="tree-desc">${escapeHtml(item.copyright || item.title || '')}</span>
            <span class="tree-delete" data-date="${escapeHtml(item.date)}" data-market="${escapeHtml(market)}">删除</span>
          `;
          monthChildrenEl.appendChild(dayEl);
        });

        monthChildrenEl.querySelectorAll('.tree-delete').forEach(delBtn => {
          delBtn.addEventListener('click', handleDeleteClick);
        });

        monthEl.querySelector('.tree-header').addEventListener('click', (e) => {
          if (e.target.closest('.tree-delete')) return;
          monthEl.classList.toggle('expanded');
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

async function handleDeleteClick(e) {
  e.stopPropagation();
  const el = e.target;
  const year = el.dataset.year;
  const month = el.dataset.month;
  const date = el.dataset.date;
  const market = el.dataset.market;

  const allData = flattenData(yearData);

  let title = '';
  let details = [];
  let body = {};

  if (year) {
    const yearData = allData.filter(item => item.date.startsWith(year));
    const months = [...new Set(yearData.map(i => i.date.slice(0, 6)))];
    title = `删除 ${year} 年数据`;
    details = [
      `共 ${yearData.length} 条记录`,
      `涉及 ${months.length} 个月份`,
      `月份: ${months.slice(0, 6).join(', ')}${months.length > 6 ? '...' : ''}`
    ];
    body = { year };
  } else if (month) {
    const monthDataItems = allData.filter(item => item.date.startsWith(month));
    const year = month.slice(0, 4);
    const monthNum = month.slice(4, 6);
    title = `删除 ${year} 年 ${monthNum} 月数据`;
    details = [
      `共 ${monthDataItems.length} 条记录`,
      `日期范围: ${monthDataItems[monthDataItems.length - 1]?.date || ''} ~ ${monthDataItems[0]?.date || ''}`
    ];
    body = { month, market };
  } else if (date && market) {
    const item = allData.find(i => i.date === date && i.belong_market === market);
    const year = date.slice(0, 4);
    const month = date.slice(4, 6);
    const day = date.slice(6, 8);
    title = `删除 ${year} 年 ${month} 月 ${day} 日数据`;
    details = [
      `市场: ${market}`,
      `版权信息: ${item?.copyright || '无'}`
    ];
    body = { date, market };
  } else if (market) {
    const marketDataItems = allData.filter(i => i.belong_market === market);
    title = `删除市场 ${market} 数据`;
    details = [
      `共 ${marketDataItems.length} 条记录`
    ];
    body = { market };
  }

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
  const results = await api('/update');
  if (results?.error === '需要认证') return;

  if (Array.isArray(results)) {
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const skipped = results.filter(r => r.message === '已存在').length;
    toast(`更新完成: 成功 ${success}, 已存在 ${skipped}, 失败 ${failed}`, failed > 0 ? 'error' : 'success');
  } else if (results?.error) {
    toast(`失败: ${results.error}`, 'error');
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
    $('importResult').innerHTML = `<span class="success">新增 ${escapeHtml(String(r.imported))} 条, 跳过 ${escapeHtml(String(r.skipped))} 条</span>`;
    toast('导入成功', 'success');
    refreshStats();
  } else if (r?.error === '需要认证') {
    logout();
  } else {
    $('importResult').innerHTML = `<span class="error">${escapeHtml(r?.error || '未知错误')}</span>`;
  }
}

async function exportData(download = false) {
  if (!yearData || Object.keys(yearData).length === 0) {
    toast('暂无数据', 'error');
    return;
  }

  const start = $('exportStart').value.trim().replace(/-/g, '');
  const end = $('exportEnd').value.trim().replace(/-/g, '');
  const market = $('exportMarket').value.trim();

  const filteredYearData = {};
  for (const [year, months] of Object.entries(yearData)) {
    for (const [ym, markets] of Object.entries(months)) {
      if (start && ym < start) continue;
      if (end && ym > end) continue;

      const filteredMarkets = {};
      for (const [mkt, items] of Object.entries(markets)) {
        if (market && mkt !== market) continue;
        if (!filteredYearData[year]) filteredYearData[year] = {};
        filteredMarkets[mkt] = items;
      }
      if (Object.keys(filteredMarkets).length > 0) {
        filteredYearData[year][ym] = filteredMarkets;
      }
    }
  }

  if (Object.keys(filteredYearData).length === 0) {
    toast('无匹配数据', 'error');
    return;
  }

  const exportResult = {
    data: filteredYearData,
    market_time_config: marketConfig
  };

  if (download) {
    const jsonStr = JSON.stringify(exportResult, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
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
    const jsonStr = JSON.stringify(exportResult, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
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
