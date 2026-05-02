const $ = id => document.getElementById(id);
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const API_BASE = '__API_BASE__'.replace(/\/$/, '');
if (API_BASE === '__API_BASE__') {
  console.error('API_BASE not configured. Please set API_BASE_URL in GitHub Variables.');
}

let allData = [], years = [], groupedData = {};

async function loadData() {
  try {
    [allData, years] = await Promise.all([
      fetch(`${API_BASE}/json`).then(r => r.json()),
      fetch(`${API_BASE}/api/years`).then(r => r.json())
    ]);
    if (allData.length) renderHero(allData[0]);
    groupData();
    renderChronicle();
    renderTimeline();
    initObservers();
  } catch (err) {
    $('loading').textContent = '加载失败: ' + err.message;
  }
}

function groupData() {
  groupedData = {};
  allData.forEach(item => {
    const y = item.date.slice(0, 4);
    const m = item.date.slice(0, 6);
    if (!groupedData[y]) groupedData[y] = {};
    if (!groupedData[y][m]) groupedData[y][m] = [];
    groupedData[y][m].push(item);
  });
}

function renderHero(latest) {
  $('hero').style.backgroundImage = `url('${latest.url}')`;
  $('heroDate').textContent = `${latest.date.slice(0,4)}-${latest.date.slice(4,6)}-${latest.date.slice(6,8)}`;
  $('heroTitle').textContent = latest.copyright;
}

function renderChronicle() {
  if (!allData.length) return $('loading').textContent = '暂无壁纸数据';
  $('loading').remove();
  
  $('chronicle').innerHTML = years.filter(y => groupedData[y]).map(year => {
    const months = Object.keys(groupedData[year]).sort().reverse();
    const count = months.reduce((sum, m) => sum + groupedData[year][m].length, 0);
    
    return `<section class="year-section" id="y${year}">
      <div class="year-header">
        <a href="/${year}" class="year-title-link"><h2 class="year-title">${year}</h2></a>
        <span class="year-count">${count} 张</span>
      </div>
      ${months.map(m => {
        const items = groupedData[year][m];
        const monthNum = m.slice(4, 6);
        return `<section class="month-section" id="m${m}">
          <a href="/${year}/${monthNum}" class="month-title-link"><h3 class="month-title">${MONTHS[+monthNum-1]}</h3></a>
          <div class="thumb-grid">${items.map(item => 
            `<div class="thumb-item" onclick="window.open('${item.url}','_blank')">
              <img data-src="${item.url.replace('_UHD.jpg','_800x480.jpg')}" data-fallback="${item.url}" class="lazy-img">
              <div class="thumb-date">${item.date.slice(6,8)}</div>
            </div>`
          ).join('')}</div>
        </section>`;
      }).join('')}
    </section>`;
  }).join('');
}

function renderTimeline() {
  $('timelineSidebar').innerHTML = years.filter(y => groupedData[y]).map(year => {
    const months = Object.keys(groupedData[year]).sort().reverse();
    return `<div class="timeline-group" data-year="${year}">
      <div class="timeline-item" onclick="toggleYear('${year}')">
        <span class="timeline-dot"></span><span>${year}</span>
        <svg class="timeline-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="timeline-sub">${months.map(m => 
        `<a href="#m${m}" class="timeline-sub-item" data-month="${m}"><span class="timeline-dot"></span><span>${MONTHS[+m.slice(4,6)-1]}</span></a>`
      ).join('')}</div>
    </div>`;
  }).join('');
}

function toggleYear(year) {
  document.querySelectorAll('.timeline-group').forEach(g => {
    g.classList.toggle('expanded', g.dataset.year === year && !g.classList.contains('expanded'));
    if (g.dataset.year !== year) g.classList.remove('expanded');
  });
}

function initObservers() {
  const imgOpts = { rootMargin: '50px 0px', threshold: 0.01 };
  const scrollOpts = { threshold: 0, rootMargin: '-50% 0px -50% 0px' };
  
  const imgObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const img = e.target;
        if (img.dataset.src && !img.src) {
          img.onload = () => {
            img.removeAttribute('data-src');
            img.classList.add('loaded');
          };
          img.onerror = () => {
            img.src = img.dataset.fallback;
            img.classList.add('loaded');
          };
          img.src = img.dataset.src;
          imgObserver.unobserve(img);
        }
      }
    });
  }, imgOpts);
  
  document.querySelectorAll('.lazy-img').forEach(img => imgObserver.observe(img));
  
  let currentYear = '', currentMonth = '';
  const heroHeight = $('hero')?.offsetHeight || 0;
  
  const yearObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        currentYear = e.target.id.slice(1);
        updateUI(currentYear, currentMonth);
      }
    });
  }, scrollOpts);
  
  const monthObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        currentMonth = e.target.id.slice(1);
        currentYear = currentMonth.slice(0, 4);
        updateUI(currentYear, currentMonth);
      }
    });
  }, scrollOpts);
  
  document.querySelectorAll('.year-section').forEach(s => yearObserver.observe(s));
  document.querySelectorAll('.month-section').forEach(s => monthObserver.observe(s));
  
  const onScroll = () => {
    const show = window.scrollY > heroHeight * 0.5;
    $('timelineSidebar').classList.toggle('visible', show);
    $('floatingInfo')?.classList.toggle('visible', show);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function updateUI(year, month) {
  document.querySelectorAll('.timeline-group').forEach(g => {
    const active = g.dataset.year === year;
    g.classList.toggle('active', active);
    g.classList.toggle('expanded', active && month);
    g.querySelectorAll('.timeline-sub-item').forEach(item => {
      item.classList.toggle('active', item.dataset.month === month);
    });
  });
  
  const info = $('floatingInfo');
  if (info) {
    info.querySelector('.floating-year').textContent = year + ' 年';
    info.querySelector('.floating-month').textContent = month ? MONTHS[+month.slice(4,6)-1] : '';
  }
}

document.addEventListener('DOMContentLoaded', loadData);
