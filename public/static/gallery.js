const $ = id => document.getElementById(id);
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

let allData = [], years = [], groupedData = {};
let scrollTimeout = null;

async function loadData() {
  try {
    [allData, years] = await Promise.all([
      fetch('/json').then(r => r.json()),
      fetch('/api/years').then(r => r.json())
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
        <h2 class="year-title">${year}</h2>
        <span class="year-count">${count} 张</span>
      </div>
      ${months.map(m => {
        const items = groupedData[year][m];
        const monthNum = m.slice(4, 6);
        return `<section class="month-section" id="m${m}">
          <h3 class="month-title">${MONTHS[+monthNum-1]}</h3>
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
  const html = years.filter(y => groupedData[y]).map(year => {
    const months = Object.keys(groupedData[year]).sort().reverse();
    return `<div class="timeline-group" data-year="${year}">
      <a href="#y${year}" class="timeline-item" onclick="toggleYear('${year}'); return false;">
        <span class="timeline-dot"></span><span>${year}</span>
        <svg class="timeline-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </a>
      <div class="timeline-sub">${months.map(m => {
        const monthNum = m.slice(4, 6);
        return `<a href="#m${m}" class="timeline-sub-item" data-month="${m}" data-year="${year}" onclick="scrollToMonth('${m}', '${year}'); return false;"><span class="timeline-dot"></span><span>${MONTHS[+monthNum-1]}</span></a>`;
      }).join('')}</div>
    </div>`;
  }).join('');
  
  $('timelineSidebar').innerHTML = `<div class="timeline-scroll">${html}</div>`;
}

function toggleYear(year) {
  document.querySelectorAll('.timeline-group').forEach(g => {
    g.classList.toggle('expanded', g.dataset.year === year && !g.classList.contains('expanded'));
    if (g.dataset.year !== year) g.classList.remove('expanded');
  });
}

function scrollToMonth(month, year) {
  const el = $('m' + month);
  if (el) {
    const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
    if (group) {
      document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));
      group.classList.add('expanded');
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function initObservers() {
  const imgOpts = { rootMargin: '100px 0px', threshold: 0.01 };
  const headerOffset = 80;
  const scrollOpts = { threshold: 0, rootMargin: `-${headerOffset}px 0px -${window.innerHeight - headerOffset - 1}px 0px` };
  
  function loadImage(img) {
    if (!img.dataset.src || img.src) return;
    img.onload = () => {
      img.removeAttribute('data-src');
      img.classList.add('loaded');
    };
    img.onerror = () => {
      img.src = img.dataset.fallback;
      img.classList.add('loaded');
    };
    img.src = img.dataset.src;
  }
  
  const imgObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        loadImage(e.target);
        imgObserver.unobserve(e.target);
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
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      document.querySelectorAll('.lazy-img[data-src]').forEach(img => {
        const rect = img.getBoundingClientRect();
        if (rect.top < window.innerHeight + 100 && rect.bottom > -100) {
          loadImage(img);
        }
      });
    }, 200);
    
    const show = window.scrollY > heroHeight * 0.5;
    $('timelineSidebar').classList.toggle('visible', show);
    $('floatingInfo')?.classList.toggle('visible', show);
  }, { passive: true });
  
  const show = window.scrollY > heroHeight * 0.5;
  $('timelineSidebar').classList.toggle('visible', show);
  $('floatingInfo')?.classList.toggle('visible', show);
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
