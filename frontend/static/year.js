const $ = id => document.getElementById(id);
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const API_BASE = '__API_BASE__'.replace(/\/$/, '');

let isScrolling = false;
let scrollTimer = null;

async function loadYear() {
  const year = location.pathname.split('/')[1];
  
  if (!year || !/^\d{4}$/.test(year)) {
    return document.querySelector('.loading').textContent = '无效的年份参数';
  }
  
  try {
    const data = await fetch(`${API_BASE}/api/year/${year}`).then(r => r.json());
    if (!data.length) return document.querySelector('.loading').textContent = '暂无数据';
    
    $('yearTitle').textContent = `${year} 年`;
    document.title = `${year} - Bing Wallpaper`;
    
    renderYear(data, year);
    renderTimeline(data);
    initObservers();
  } catch (err) {
    document.querySelector('.loading').textContent = '加载失败: ' + err.message;
  }
}

function renderYear(data, year) {
  const months = data.reduce((acc, item) => {
    const m = item.date.slice(0, 6);
    (acc[m] ??= []).push(item);
    return acc;
  }, {});
  
  $('chronicle').innerHTML = Object.keys(months).sort().reverse().map(m => {
    const items = months[m];
    const monthNum = m.slice(4, 6);
    return `<section class="month-section" id="m${m}">
      <a href="/${year}/${monthNum}" class="month-title-link"><h2 class="month-title">${MONTHS[+monthNum-1]}</h2></a>
      <div class="thumb-grid">${items.map(item => 
        `<div class="thumb-item" onclick="window.open('${item.url}','_blank')">
          <img data-src="${item.url.replace('_UHD.jpg','_800x480.jpg')}" data-fallback="${item.url}" class="lazy-img">
          <div class="thumb-date">${item.date.slice(6,8)}</div>
        </div>`
      ).join('')}</div>
    </section>`;
  }).join('');
}

function renderTimeline(data) {
  const months = [...new Set(data.map(i => i.date.slice(0, 6)))].sort().reverse();
  $('timelineSidebar').innerHTML = months.map(m => 
    `<a href="#m${m}" class="timeline-item" data-month="${m}"><span class="timeline-dot"></span><span>${MONTHS[+m.slice(4,6)-1]}</span></a>`
  ).join('');
  $('timelineSidebar').classList.add('visible');
}

function initObservers() {
  const imgObserver = new IntersectionObserver(entries => {
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
        imgObserver.unobserve(img);
      }
    });
  }, { rootMargin: '50px 0px', threshold: 0.01 });
  
  document.querySelectorAll('.lazy-img').forEach(img => imgObserver.observe(img));
  
  const scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const month = e.target.id.slice(1);
        document.querySelectorAll('.timeline-item').forEach(item => {
          item.classList.toggle('active', item.dataset.month === month);
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-20% 0px -60% 0px' });
  
  document.querySelectorAll('.month-section').forEach(s => scrollObserver.observe(s));
  
  window.addEventListener('scroll', () => {
    isScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isScrolling = false;
      imgObserver.takeRecords().forEach(e => {
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
          imgObserver.unobserve(img);
        }
      });
    }, 150);
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', loadYear);
