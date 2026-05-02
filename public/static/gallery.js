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
        <a href="/${year}" class="year-title-link">
          <h2 class="year-title">${year}</h2>
        </a>
        <span class="year-count">${totalCount} 张</span>
      </div>`;
    
    months.forEach(monthKey => {
      const monthNum = parseInt(monthKey.substring(4, 6));
      const items = yearData[monthKey];
      
      html += `<section class="month-section" id="m${monthKey}">
        <a href="/${monthKey}" class="month-title-link">
          <h3 class="month-title">${monthNames[monthNum - 1]}</h3>
        </a>
        <div class="thumb-grid">`;
      
      items.forEach(item => {
        html += `<div class="thumb-item" data-url="${item.url}" data-date="${item.date}" onclick="openImage('${item.url}')">
          <img data-src="${item.thumbUrl || item.url.replace('_UHD.jpg', '_800x480.jpg')}" data-fallback="${item.url}" alt="${item.copyright}" class="lazy-img">
          <div class="thumb-date">${item.date.substring(6, 8)}</div>
        </div>`;
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
    rootMargin: '200px 0px',
    threshold: 0.01
  };
  
  imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src && !img.src) {
          const thumbUrl = img.dataset.src;
          const fallbackUrl = img.dataset.fallback;
          
          img.onload = () => {
            img.removeAttribute('data-src');
            img.removeAttribute('data-fallback');
          };
          
          img.onerror = () => {
            if (img.src === thumbUrl && fallbackUrl) {
              img.src = fallbackUrl;
            } else {
              img.style.display = 'none';
            }
          };
          
          img.src = thumbUrl;
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
  const yearSections = document.querySelectorAll('.year-section');
  const monthSections = document.querySelectorAll('.month-section');
  const sidebar = $('timelineSidebar');
  const floatingInfo = $('floatingInfo');
  
  if (!sidebar) return;
  
  let currentYear = '';
  let currentMonth = '';
  let heroHeight = $('hero')?.offsetHeight || 0;
  
  const yearObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const year = entry.target.id.replace('y', '');
        currentYear = year;
        updateFloatingInfo(currentYear, currentMonth);
        updateTimeline(year);
      }
    });
  }, { threshold: 0, rootMargin: '-50% 0px -50% 0px' });
  
  const monthObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const monthKey = entry.target.id.replace('m', '');
        currentMonth = monthKey;
        const year = monthKey.substring(0, 4);
        currentYear = year;
        updateFloatingInfo(currentYear, currentMonth);
        updateTimeline(year, monthKey);
      }
    });
  }, { threshold: 0, rootMargin: '-50% 0px -50% 0px' });
  
  yearSections.forEach(section => yearObserver.observe(section));
  monthSections.forEach(section => monthObserver.observe(section));
  
  function handleScroll() {
    const scrollTop = window.scrollY;
    
    if (scrollTop > heroHeight * 0.5) {
      sidebar.classList.add('visible');
      if (floatingInfo) floatingInfo.classList.add('visible');
    } else {
      sidebar.classList.remove('visible');
      if (floatingInfo) floatingInfo.classList.remove('visible');
    }
  }
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

function updateTimeline(year, month) {
  document.querySelectorAll('.timeline-group').forEach(group => {
    const isActive = group.dataset.year === year;
    group.classList.toggle('active', isActive);
    
    if (isActive && month) {
      group.classList.add('expanded');
      group.querySelectorAll('.timeline-sub-item').forEach(item => {
        item.classList.toggle('active', item.dataset.month === month);
      });
    } else {
      group.classList.remove('expanded');
    }
  });
}

function updateFloatingInfo(year, month) {
  const floatingInfo = $('floatingInfo');
  if (!floatingInfo) return;
  
  const yearEl = floatingInfo.querySelector('.floating-year');
  const monthEl = floatingInfo.querySelector('.floating-month');
  
  if (yearEl) yearEl.textContent = year + ' 年';
  if (monthEl && month) {
    const monthNum = parseInt(month.substring(4, 6));
    monthEl.textContent = monthNames[monthNum - 1];
  }
}

function openImage(url) {
  window.open(url, '_blank');
}

document.addEventListener('DOMContentLoaded', loadData);
