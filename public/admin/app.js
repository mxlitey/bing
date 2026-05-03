const $ = (id) => document.getElementById(id);

const escapeHtml = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

const api = async (path, opts = {}) => {
  const token = localStorage.getItem('token');
  opts.headers = opts.headers || {};
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
      localStorage.setItem('token', token);
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
  localStorage.removeItem('token');
  hideMainView();
  $('tokenInput').value = '';
}

async function checkLogin() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    const response = await fetch('/api/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      showMainView();
    } else if (response.status === 401) {
      localStorage.removeItem('token');
    }
  } catch (e) {
    localStorage.removeItem('token');
  }
}

async function refreshStats() {
  const s = await api('/api/stats');
  if (!s || s.error) {
    if (s?.error === '需要认证') return;
    return;
  }
  
  $('statsArea').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(s.months)}</div>
      <div class="stat-label">月份数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(s.total)}</div>
      <div class="stat-label">总记录数</div>
    </div>
  `;

  const months = await api('/api/months');
  if (!months || months.error) return;
  
  const tbody = $('monthTable');
  tbody.innerHTML = '';
  months.forEach(m => {
    const tr = document.createElement('tr');
    const monthEscaped = escapeHtml(m.month);
    const countEscaped = escapeHtml(m.count);
    tr.innerHTML = `
      <td><span class="month-link" data-month="${monthEscaped}">${monthEscaped}</span></td>
      <td>${countEscaped}</td>
      <td><span class="delete-btn" data-month="${monthEscaped}">删除</span></td>
    `;
    tbody.appendChild(tr);
  });
  
  tbody.querySelectorAll('.month-link').forEach(el => {
    el.addEventListener('click', () => viewMonth(el.dataset.month));
  });
  tbody.querySelectorAll('.delete-btn').forEach(el => {
    el.addEventListener('click', () => deleteMonth(el.dataset.month));
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
    $('importResult').innerHTML = `<span class="success">新增 ${escapeHtml(r.imported)} 条, 跳过 ${escapeHtml(r.skipped)} 条</span>`;
    toast('导入成功', 'success');
    refreshStats();
  } else if (r?.error === '需要认证') {
    logout();
  } else {
    $('importResult').innerHTML = `<span class="error">${escapeHtml(r?.error)}</span>`;
  }
}

function exportData(download = false) {
  const start = $('exportStart').value.trim();
  const end = $('exportEnd').value.trim();
  let url = '/api/export?';
  if (start) url += `start=${encodeURIComponent(start)}&`;
  if (end) url += `end=${encodeURIComponent(end)}&`;
  if (download) url += 'download=1';
  window.open(url, '_blank');
}

function viewMonth(m) { 
  window.open('/' + encodeURIComponent(m), '_blank'); 
}

async function deleteMonth(m) {
  if (!confirm(`确定删除 ${m}？`)) return;
  const r = await api('/api/delete-month', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ month: m }) 
  });
  if (r?.success) { 
    toast(`已删除 ${m}`, 'success'); 
    refreshStats(); 
  } else if (r?.error === '需要认证') {
    logout();
  } else if (r?.error) {
    toast(r.error, 'error');
  }
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => { 
    try { 
      importData(JSON.parse(e.target.result)); 
    } catch (err) { 
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
