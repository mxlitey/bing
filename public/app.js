const $ = (id) => document.getElementById(id);
const api = async (path, opts = {}) => {
  const token = localStorage.getItem('token');
  if (token && !opts.skipAuth) {
    opts.headers = { ...opts.headers, 'Authorization': `Bearer ${token}` };
  }
  return (await fetch(path, opts)).json();
};

function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function login() {
  const token = $('tokenInput').value.trim();
  if (!token) return toast('请输入 Token', 'error');
  const r = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), skipAuth: true });
  if (r.success) {
    localStorage.setItem('token', token);
    $('loginBox').style.display = 'none';
    $('mainBox').style.display = 'block';
    refreshStats();
    toast('登录成功', 'success');
  } else {
    toast('Token 错误', 'error');
  }
}

function logout() {
  localStorage.removeItem('token');
  $('loginBox').style.display = 'block';
  $('mainBox').style.display = 'none';
}

function checkLogin() {
  const token = localStorage.getItem('token');
  if (token) {
    $('loginBox').style.display = 'none';
    $('mainBox').style.display = 'block';
    refreshStats();
  }
}

async function refreshStats() {
  const s = await api('/api/stats');
  if (!s) return;
  $('stats').innerHTML = `<div class="stat-item"><div class="num">${s.months}</div><div class="label">月份数</div></div><div class="stat-item"><div class="num">${s.total}</div><div class="label">总记录数</div></div>`;

  const months = await api('/api/months');
  if (!months) return;
  $('monthTable').innerHTML = months.map(m => `<tr><td><span class="month-link" onclick="viewMonth('${m.month}')">${m.month}</span></td><td>${m.count}</td><td><span class="delete-btn" onclick="deleteMonth('${m.month}')">删除</span></td></tr>`).join('');
}

async function triggerUpdate() {
  toast('正在更新...', 'info');
  const r = await api('/api/update');
  r.success ? toast(`${r.message} (${r.date})`, 'success') : toast(`失败: ${r.error}`, 'error');
  refreshStats();
}

async function importData(data) {
  if (!Array.isArray(data)) return toast('格式错误', 'error');
  toast(`导入 ${data.length} 条...`, 'info');
  const pb = $('importProgress'), fill = pb.querySelector('.fill');
  pb.style.display = 'block';
  fill.style.width = '30%';

  const r = await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  fill.style.width = '100%';
  setTimeout(() => { pb.style.display = 'none'; fill.style.width = '0%'; }, 1000);

  if (r.success) {
    $('importResult').innerHTML = `<span style="color:#10b981">✅ 新增 ${r.imported} 条, 跳过 ${r.skipped} 条</span>`;
    toast('导入成功', 'success');
    refreshStats();
  } else if (r.error === '需要认证') {
    logout();
  } else {
    $('importResult').innerHTML = `<span style="color:#ef4444">❌ ${r.error}</span>`;
  }
}

function exportData(download = false) {
  const start = $('exportStart').value, end = $('exportEnd').value;
  let url = '/api/export?';
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  if (download) url += 'download=1';
  window.open(url, '_blank');
}

function viewMonth(m) { window.open('/' + m, '_blank'); }

async function deleteMonth(m) {
  if (!confirm(`确定删除 ${m}？`)) return;
  const r = await api('/api/delete-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: m }) });
  if (r.success) { toast(`已删除 ${m}`, 'success'); refreshStats(); }
  else if (r.error === '需要认证') logout();
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => { try { importData(JSON.parse(e.target.result)); } catch (err) { toast('解析失败', 'error'); } };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  const drop = $('dropZone'), input = $('fileInput');
  drop.onclick = () => input.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('dragover'); };
  drop.ondragleave = () => drop.classList.remove('dragover');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  input.onchange = (e) => { if (e.target.files[0]) readFile(e.target.files[0]); };
  checkLogin();
});
