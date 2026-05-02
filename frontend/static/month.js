const $ = id => document.getElementById(id);
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const API_BASE = '__API_BASE__'.replace(/\/$/, '');

let isScrolling = false;
let scrollTimer = null;

async function loadMonth() {
  const pathParts = location.pathname.split('/').filter(Boolean);
  const year = pathParts[0];
  const month = pathParts[1];
  
  if (!year || !/^\d{4}$/.test(year) || !month || !/^\d{2}$/.test(month)) {
    return document.querySelector('.loading').textContent = '无效的路径参数';
  }
  
  const monthKey = year + month;
  const monthNum = +month;
  
  try {
    const data = await fetch(`${API_BASE}/api/month/${monthKey}`).then(r => r.json());
    if (!data.length) return document.querySelector('.loading').textContent = '暂无数据';
    
    $('yearLink').href = `/${year}`;
    $('yearLink').textContent = `${year}年`;
    $('monthTitle').textContent = MONTHS[monthNum - 1];
    $('photoCount').textContent = `${data.length} 张`;
    document.title = `${year}年${MONTHS[monthNum - 1]} - Bing Wallpaper`;
    
    renderGrid(data);
    initObserver();
  } catch (err) {
    document.querySelector('.loading').textContent = '加载失败: ' + err.message;
  }
}

function renderGrid(data) {
  $('monthGrid').innerHTML = data.map(item => 
    `<div class="thumb-item" onclick="window.open('${item.url}','_blank')">
      <img data-src="${item.url.replace('_UHD.jpg','_800x480.jpg')}" data-fallback="${item.url}" class="lazy-img">
      <div class="thumb-overlay">
        <div class="thumb-date-full">${item.date}</div>
        <div class="thumb-copyright">${item.copyright}</div>
      </div>
    </div>`
  ).join('');
}

function initObserver() {
  const observer = new IntersectionObserver(entries => {
    if (isScrolling) return;
    entries.forEach(e => {
      if (e.isIntersecting && e.target.dataset.src && !e.target.src) {
        const img = e.target;
        img.onload = () => {
          img.removeAttribute('data-src');
          img.classList.add('loaded');
        };
        img.onerror = () => {
          img.src = img.dataset.fallback;
          img.classList.add('loaded');
        };
        img.src = img.dataset.src;
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '50px 0px', threshold: 0.01 });
  
  document.querySelectorAll('.lazy-img').forEach(img => observer.observe(img));
  
  window.addEventListener('scroll', () => {
    isScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isScrolling = false;
      observer.takeRecords().forEach(e => {
        if (e.isIntersecting && e.target.dataset.src && !e.target.src) {
          const img = e.target;
          img.onload = () => {
            img.removeAttribute('data-src');
            img.classList.add('loaded');
          };
          img.onerror = () => {
            img.src = img.dataset.fallback;
            img.classList.add('loaded');
          };
          img.src = img.dataset.src;
          observer.unobserve(img);
        }
      });
    }, 150);
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', loadMonth);
