const $ = (id) => document.getElementById(id);
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

let allData = [];
let years = [];
let groupedData = {};
let imageObserver = null;

async function loadData() {
  try {
    const [dataRes, yearsRes] = await Promise.all([
      fetch('/json'),
      fetch('/api/years')
    ]);
    allData = await dataRes.json();
    years = await yearsRes.json();
    
    if (allData.length) {
      renderHero(allData[0]);
    }
    
    groupData();
    renderChronicle();
    renderTimeline();
    initImageObserver();
    initScrollObserver();
  } catch (err) {
    $('loading').textContent = '加载失败: ' + err.message;
  }
}

function groupData() {
  groupedData = {};
  allData.forEach(item => {
    const year = item.date.substring(0, 4);
    const month = item.date.substring(0, 6);
    if (!groupedData[year]) groupedData[year] = {};
    if (!groupedData[year][month]) groupedData[year][month] = [];
    groupedData[year][month].push(item);
  });
}

function renderHero(latest) {
  const hero = $('hero');
  const heroDate = $('heroDate');
  const heroTitle = $('heroTitle');
  
  hero.style.backgroundImage = `url('${latest.url}')`;
  const dateStr = latest.date;
  const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  heroDate.textContent = formattedDate;
  heroTitle.textContent = latest.copyright;
}

function renderChronicle() {
  const container = $('chronicle');
  const loading = $('loading');
  
  if (!allData.length) {
    loading.textContent = '暂无壁纸数据';
    return;
  }
  
  loading.remove();
  
  let html = '';
  years.forEach(year => {
    if (!groupedData[year]) return;
    
    const yearData = groupedData[year];
    const months = Object.keys(yearData).sort().reverse();
    let totalCount = 0;
    months.forEach(m => totalCount += yearData[m].length);
    
    html += `<section class="year-section" id="y${year}">
      <div class="year-header">
        <h2 class="year-title">${year}</h2>
        <span class="year-count">${totalCount} 张</span>
      </div>`;
    
    months.forEach(monthKey => {
      const monthNum = parseInt(monthKey.substring(4, 6));
      const items = yearData[monthKey];
      
      html += `<section class="month-section" id="m${monthKey}">
        <h3 class="month-title">${monthNames[monthNum - 1]}</h3>
        <div class="thumb-grid">`;
      
      items.forEach(item => {
        const thumbUrl = item.url.replace('_UHD.jpg', '_800x480.jpg');
        html += `<a href="/${item.date}" class="thumb-item" data-date="${item.date}" data-month="${monthKey}">
          <img data-src="${thumbUrl}" alt="${item.copyright}" class="lazy-img">
          <div class="thumb-date">${item.date.substring(6, 8)}</div>
        </a>`;
      });
      
      html += `</div></section>`;
    });
    
    html += `</section>`;
  });
  
  container.innerHTML = html;
}

function initImageObserver() {
  const options = {
    root: null,
    rootMargin: '100px 0px',
    threshold: 0.01
  };
  
  imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src && !img.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      }
    });
  }, options);
  
  document.querySelectorAll('.lazy-img').forEach(img => {
    imageObserver.observe(img);
  });
}

function renderTimeline() {
  const sidebar = $('timelineSidebar');
  if (!sidebar || !years.length) return;
  
  let html = '';
  years.forEach(year => {
    if (!groupedData[year]) return;
    
    const months = Object.keys(groupedData[year]).sort().reverse();
    const monthItems = months.map(monthKey => {
      const monthNum = parseInt(monthKey.substring(4, 6));
      return `<a href="#m${monthKey}" class="timeline-sub-item" data-month="${monthKey}">
        <span class="timeline-dot"></span>
        <span>${monthNames[monthNum - 1]}</span>
      </a>`;
    }).join('');
    
    html += `<div class="timeline-group" data-year="${year}">
      <div class="timeline-item" onclick="toggleTimelineGroup('${year}')">
        <span class="timeline-dot"></span>
        <span>${year}</span>
        <svg class="timeline-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      <div class="timeline-sub">${monthItems}</div>
    </div>`;
  });
  
  sidebar.innerHTML = html;
}

function toggleTimelineGroup(year) {
  const groups = document.querySelectorAll('.timeline-group');
  groups.forEach(group => {
    if (group.dataset.year === year) {
      group.classList.toggle('expanded');
    } else {
      group.classList.remove('expanded');
    }
  });
}

function initScrollObserver() {
  const sections = document.querySelectorAll('.year-section');
  const sidebar = $('timelineSidebar');
  
  if (!sidebar) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const year = entry.target.id.replace('y', '');
        document.querySelectorAll('.timeline-group').forEach(group => {
          group.classList.toggle('active', group.dataset.year === year);
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-20% 0px -60% 0px' });
  
  sections.forEach(section => observer.observe(section));
  
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const heroHeight = $('hero')?.offsetHeight || 0;
    
    if (scrollTop > heroHeight * 0.5) {
      sidebar.classList.add('visible');
    } else {
      sidebar.classList.remove('visible');
    }
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', loadData);
