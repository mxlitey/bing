const $ = id => document.getElementById(id);
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

let allData = [], years = [], groupedData = {};
let isScrollingToTarget = false;
let currentYear = '', currentMonth = '';

async function loadData() {
  try {
    const cached = await fetch('/json').then(r => r.json());
    allData = cached.data || cached;
    years = cached.years || [...new Set(allData.map(i => i.date.slice(0, 4)))].sort().reverse();
    
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
    isScrollingToTarget = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { isScrollingToTarget = false; }, 800);
  }
}

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

function updateUI(year, month) {
  if (year === currentYear && month === currentMonth) return;
  currentYear = year;
  currentMonth = month;
  
  const groups = document.querySelectorAll('.timeline-group');
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const active = g.dataset.year === year;
    if (active) {
      g.classList.add('active', 'expanded');
      const items = g.querySelectorAll('.timeline-sub-item');
      for (let j = 0; j < items.length; j++) {
        items[j].classList.toggle('active', items[j].dataset.month === month);
      }
    } else {
      g.classList.remove('active', 'expanded');
    }
  }
}

function initObservers() {
  const imgOpts = { rootMargin: '100px 0px', threshold: 0.01 };
  const headerOffset = 80;
  const scrollOpts = { threshold: 0, rootMargin: `-${headerOffset}px 0px -${window.innerHeight - headerOffset - 1}px 0px` };
  
  const imgObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        loadImage(e.target);
        imgObserver.unobserve(e.target);
      }
    });
  }, imgOpts);
  
  document.querySelectorAll('.lazy-img').forEach(img => imgObserver.observe(img));
  
  const heroHeight = $('hero')?.offsetHeight || 0;
  let lastScrollY = 0;
  let sidebarVisible = false;
  
  const yearObserver = new IntersectionObserver(entries => {
    if (isScrollingToTarget) return;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        updateUI(entries[i].target.id.slice(1), currentMonth);
        break;
      }
    }
  }, scrollOpts);
  
  const monthObserver = new IntersectionObserver(entries => {
    if (isScrollingToTarget) return;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        const m = entries[i].target.id.slice(1);
        updateUI(m.slice(0, 4), m);
        break;
      }
    }
  }, scrollOpts);
  
  document.querySelectorAll('.year-section').forEach(s => yearObserver.observe(s));
  document.querySelectorAll('.month-section').forEach(s => monthObserver.observe(s));
  
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (Math.abs(scrollY - lastScrollY) < 50) return;
    lastScrollY = scrollY;
    
    const show = currentYear && scrollY > heroHeight * 0.5;
    if (show !== sidebarVisible) {
      sidebarVisible = show;
      $('timelineSidebar').classList.toggle('visible', show);
    }
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
  window.scrollTo(0, 0);
  loadData();
});
