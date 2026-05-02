const $ = (id) => document.getElementById(id);
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

let imageObserver = null;

async function loadMonth() {
  const params = new URLSearchParams(window.location.search);
  const month = params.get('m');
  
  if (!month || !/^\d{6}$/.test(month)) {
    document.querySelector('.loading').textContent = '无效的月份参数';
    return;
  }
  
  const year = month.substring(0, 4);
  const monthNum = parseInt(month.substring(4, 6));
  
  try {
    const res = await fetch(`/api/month/${month}`);
    const data = await res.json();
    
    if (!data.length) {
      document.querySelector('.loading').textContent = '暂无数据';
      return;
    }
    
    $('yearLink').href = `/year/?y=${year}`;
    $('yearLink').textContent = `${year}年`;
    $('monthTitle').textContent = monthNames[monthNum - 1];
    $('photoCount').textContent = `${data.length} 张`;
    document.title = `${year}年${monthNames[monthNum - 1]} - Bing Wallpaper`;
    
    renderGrid(data);
    initImageObserver();
  } catch (err) {
    document.querySelector('.loading').textContent = '加载失败: ' + err.message;
  }
}

function renderGrid(data) {
  const grid = $('monthGrid');
  grid.innerHTML = data.map(item => {
    const thumbUrl = item.url.replace('_UHD.jpg', '_800x480.jpg');
    return `<a href="/${item.date}" class="thumb-item" data-date="${item.date}">
      <img data-src="${thumbUrl}" alt="${item.copyright}" class="lazy-img">
      <div class="thumb-overlay">
        <div class="thumb-date-full">${item.date}</div>
        <div class="thumb-copyright">${item.copyright}</div>
      </div>
    </a>`;
  }).join('');
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

document.addEventListener('DOMContentLoaded', loadMonth);
