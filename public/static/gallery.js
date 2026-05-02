const $ = (id) => document.getElementById(id);
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

let allData = [];
let years = [];

async function loadData() {
  try {
    const [dataRes, yearsRes] = await Promise.all([
      fetch('/json'),
      fetch('/api/years')
    ]);
    allData = await dataRes.json();
    years = await yearsRes.json();
    renderChronicle();
    renderTimeline();
    initScrollObserver();
  } catch (err) {
    $('loading').textContent = '加载失败: ' + err.message;
  }
}

function renderChronicle() {
  const container = $('chronicle');
  const loading = $('loading');
  
  if (!allData.length) {
    loading.textContent = '暂无壁纸数据';
    return;
  }
  
  loading.remove();
  
  const grouped = {};
  allData.forEach(item => {
    const year = item.date.substring(0, 4);
    const month = item.date.substring(0, 6);
    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];
    grouped[year][month].push(item);
  });
  
  let html = '';
  years.forEach(year => {
    if (!grouped[year]) return;
    
    const yearData = grouped[year];
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
        html += `<a href="/${item.date}" class="thumb-item" data-date="${item.date}" data-month="${monthKey}">
          <img src="${item.url}?w=400" alt="${item.copyright}" loading="lazy">
          <div class="thumb-date">${item.date.substring(6, 8)}</div>
        </a>`;
      });
      
      html += `</div></section>`;
    });
    
    html += `</section>`;
  });
  
  container.innerHTML = html;
}

function renderTimeline() {
  const sidebar = $('timelineSidebar');
  if (!sidebar || !years.length) return;
  
  let html = '';
  years.forEach(year => {
    html += `<a href="#y${year}" class="timeline-item" data-year="${year}">
      <span class="timeline-dot"></span>
      <span>${year}</span>
    </a>`;
  });
  
  sidebar.innerHTML = html;
}

function initScrollObserver() {
  const sections = document.querySelectorAll('.year-section');
  const sidebar = $('timelineSidebar');
  
  if (!sidebar) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const year = entry.target.id.replace('y', '');
        document.querySelectorAll('.timeline-item').forEach(item => {
          item.classList.toggle('active', item.dataset.year === year);
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-20% 0px -60% 0px' });
  
  sections.forEach(section => observer.observe(section));
  
  let lastScrollTop = 0;
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const heroHeight = document.querySelector('.hero')?.offsetHeight || 0;
    
    if (scrollTop > heroHeight * 0.5) {
      sidebar.classList.add('visible');
    } else {
      sidebar.classList.remove('visible');
    }
    
    lastScrollTop = scrollTop;
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
  const scrollHint = document.querySelector('.scroll-hint');
  if (scrollHint) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 100) {
        scrollHint.style.opacity = '0';
      } else {
        scrollHint.style.opacity = '1';
      }
    }, { passive: true });
  }
  
  loadData();
});
