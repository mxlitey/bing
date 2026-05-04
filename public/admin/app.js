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

let allData = [];
let yearsList = [];

async function refreshStats() {
  const cached = await api('/json');
  if (!cached || cached.error) {
    if (cached?.error === '需要认证') return;
    return;
  }

  allData = cached.data || cached;
  yearsList = cached.years || [...new Set(allData.map(i => i.date.slice(0, 4)))].sort().reverse();

  const monthMap = {};
  allData.forEach(item => {
    const month = item.date.slice(0, 6);
    monthMap[month] = (monthMap[month] || 0) + 1;
  });

  const monthsArr = Object.entries(monthMap)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.month.localeCompare(a.month));

  const monthCount = monthsArr.length;
  const total = allData.length;

  $('statsArea').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(monthCount))}</div>
      <div class="stat-label">月份数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(String(total))}</div>
      <div class="stat-label">总记录数</div>
    </div>
  `;

  const tree = {};
  monthsArr.forEach(m => {
    const year = m.month.slice(0, 4);
    const month = m.month.slice(4, 6);
    if (!tree[year]) tree[year] = { count: 0, months: [] };
    tree[year].count += m.count;
    tree[year].months.push({ month, count: m.count, full: m.month });
  });

  const container = $('monthTable');
  container.innerHTML = '';

  Object.keys(tree).sort((a, b) => b.localeCompare(a)).forEach(year => {
    const yearData = tree[year];
    const yearEl = document.createElement('div');
    yearEl.className = 'tree-year';
    yearEl.innerHTML = `
      <div class="tree-header">
        <div class="tree-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <span class="tree-label">${escapeHtml(year)} 年</span>
        <span class="tree-count">${escapeHtml(String(yearData.count))} 张</span>
        <span class="tree-delete" data-year="${escapeHtml(year)}">删除</span>
      </div>
      <div class="tree-children"></div>
    `;

    const childrenEl = yearEl.querySelector('.tree-children');
    yearData.months.sort((a, b) => b.month.localeCompare(a.month)).forEach(m => {
      const monthEl = document.createElement('div');
      monthEl.className = 'tree-month';
      monthEl.innerHTML = `
        <div class="tree-header">
          <div class="tree-toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <span class="tree-label">${escapeHtml(m.month)} 月</span>
          <span class="tree-count">${escapeHtml(String(m.count))} 张</span>
          <span class="tree-delete" data-month="${escapeHtml(m.full)}">删除</span>
        </div>
        <div class="tree-children"></div>
      `;

      childrenEl.appendChild(monthEl);
    });

    container.appendChild(yearEl);
  });

  container.querySelectorAll('.tree-year > .tree-header').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tree-delete')) return;
      el.parentElement.classList.toggle('expanded');
    });
  });

  container.querySelectorAll('.tree-month > .tree-header').forEach(el => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.tree-delete')) return;
      const monthEl = el.parentElement;
      if (monthEl.classList.contains('loaded')) {
        monthEl.classList.toggle('expanded');
        return;
      }

      const monthKey = el.querySelector('.tree-delete').dataset.month;
      const data = allData.filter(item => item.date.startsWith(monthKey));
      if (!data.length) return;

      const childrenEl = monthEl.querySelector('.tree-children');
      childrenEl.innerHTML = '';

      data.forEach(item => {
        const dayEl = document.createElement('div');
        dayEl.className = 'tree-day';
        dayEl.innerHTML = `
          <span class="tree-label">${escapeHtml(item.date.slice(6, 8))} 日</span>
          <span class="tree-desc">${escapeHtml(item.copyright || '')}</span>
          <span class="tree-delete" data-date="${escapeHtml(item.date)}">删除</span>
        `;
        childrenEl.appendChild(dayEl);
      });

      monthEl.classList.add('loaded', 'expanded');
    });
  });

  container.querySelectorAll('.tree-delete').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const year = el.dataset.year;
      const month = el.dataset.month;
      const date = el.dataset.date;

      if (year) {
        if (!confirm(`确定删除 ${year} 年的所有数据？`)) return;
        const r = await api('/api/delete', {
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
      } else if (month) {
        if (!confirm(`确定删除 ${month} 的数据？`)) return;
        const r = await api('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month })
        });
        if (r?.success) {
          toast(r.message, 'success');
          refreshStats();
        } else if (r?.error) {
          toast(r.error, 'error');
        }
      } else if (date) {
        if (!confirm(`确定删除 ${date} 的数据？`)) return;
        const r = await api('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date })
        });
        if (r?.success) {
          toast(r.message, 'success');
          refreshStats();
        } else if (r?.error) {
          toast(r.error, 'error');
        }
      }
    });
  });
}

async function triggerUpdate() {
  toast('正在更新...', 'info');
  const r = await api('/update');
  if (r?.error === '需要认证') return;
  r?.success ? toast(`${r.message} (${r.date})`, 'success') : toast(`失败: ${r?.error}`, 'error');
  refreshStats();
}

async function importData(data) {
  if (!Array.isArray(data)) return toast('格式错误', 'error');
  toast(`导入 ${data.length} 条...`, 'info');

  const pb = $('importProgress');
  const fill = pb.querySelector('.progress-fill');
  pb.classList.add('show');
  fill.style.width = '30%';

  const r = await api('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
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
  if (!allData.length) {
    toast('暂无数据', 'error');
    return;
  }

  const start = $('exportStart').value.trim().replace(/-/g, '');
  const end = $('exportEnd').value.trim().replace(/-/g, '');

  let filtered = allData;
  if (start) {
    filtered = filtered.filter(item => item.date.slice(0, 6) >= start);
  }
  if (end) {
    filtered = filtered.filter(item => item.date.slice(0, 6) <= end);
  }

  if (!filtered.length) {
    toast('无匹配数据', 'error');
    return;
  }

  filtered.sort((a, b) => a.date.localeCompare(b.date));

  if (download) {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bing_wallpapers.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(`导出 ${filtered.length} 条数据`, 'success');
  } else {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
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
