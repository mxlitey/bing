const $ = (id) => document.getElementById(id);
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

let imageObserver = null;

async function loadYear() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('y');
  
  if (!year || !/^\d{4}$/.test(year)) {
    document.querySelector('.loading').textContent = '无效的年份参数';
    return;
  }
  
  try {
    const res = await fetch(`/api/year/${year}`);
    const data = await res.json();
    
    if (!data.length) {
      document.querySelector('.loading').textContent = '暂无数据';
      return;
    }
    
    $('yearTitle').textContent = `${year} 年`;
    document.title = `${year} - Bing Wallpaper`;
    
    renderYear(data);
    renderTimeline(data);
    initImageObserver();
    initScrollObserver();
  } catch (err) {
    document.querySelector('.loading').textContent = '加载失败: ' + err.message;
  }
}

function renderYear(data) {
  const container = $('chronicle');
  container.innerHTML = '';
  
  const months = {};
  data.forEach(item => {
    const m = item.date.substring(0, 6);
    if (!months[m]) months[m] = [];
    months[m].push(item);
  });
  
  Object.keys(months).sort().reverse().forEach(monthKey => {
    const monthNum = parseInt(monthKey.substring(4, 6));
    const items = months[monthKey];
    
    const section = document.createElement('section');
    section.className = 'month-section';
    section.id = `m${monthKey}`;
    section.innerHTML = `
      <a href="/${monthKey}" class="month-title-link">
        <h2 class="month-title">${monthNames[monthNum - 1]}</h2>
      </a>
      <div class="thumb-grid">
        ${items.map(item => {
          const thumbUrl = item.url.replace('_UHD.jpg', '_800x480.jpg');
          return `<div class="thumb-item" onclick="openImage('${item.url}')">
            <img data-src="${thumbUrl}" data-fallback="${item.url}" alt="${item.copyright}" class="lazy-img">
            <div class="thumb-date">${item.date.substring(6, 8)}</div>
          </div>`;
        }).join('')}
      </div>
    `;
    container.appendChild(section);
  });
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
          const thumbUrl = img.dataset.src;
          const fallbackUrl = img.dataset.fallback;
          
          img.onload = () => {
            img.removeAttribute('data-src');
            img.removeAttribute('data-fallback');
          };
          
          img.onerror = () => {
            if (img.src === thumbUrl && fallbackUrl) {
              img.src = fallbackUrl;
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

function renderTimeline(data) {
  const sidebar = $('timelineSidebar');
  const months = [...new Set(data.map(i => i.date.substring(0, 6)))].sort().reverse();
  
  sidebar.innerHTML = months.map(m => {
    const monthNum = parseInt(m.substring(4, 6));
    return `<a href="#m${m}" class="timeline-item" data-month="${m}">
      <span class="timeline-dot"></span>
      <span>${monthNames[monthNum - 1]}</span>
    </a>`;
  }).join('');
  
  sidebar.classList.add('visible');
}

function initScrollObserver() {
  const sections = document.querySelectorAll('.month-section');
  const sidebar = $('timelineSidebar');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const month = entry.target.id.replace('m', '');
        document.querySelectorAll('.timeline-item').forEach(item => {
          item.classList.toggle('active', item.dataset.month === month);
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-20% 0px -60% 0px' });
  
  sections.forEach(section => observer.observe(section));
}

function openImage(url) {
  window.open(url, '_blank');
}

document.addEventListener('DOMContentLoaded', loadYear);
