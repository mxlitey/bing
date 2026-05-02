const $ = id => document.getElementById(id);
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

let allData = [], years = [], groupedData = {};
let isScrollingToTarget = false;
let currentYear = '', currentMonth = '';
let viewportObserver, preloadObserver;
let scrollEndTimer = null;

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
        <svg class="timeline-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
      </a>
      <div class="timeline-sub">${months.map(m => {
        const monthNum = m.slice(4, 6);
        return `<a href="#m${m}" class="timeline-sub-item" data-month="${m}" data-year="${year}" onclick="scrollToMonth('${m}', '${year}'); return false;"><span class="timeline-dot"></span><span>${MONTHS[+monthNum-1]}</span></a>`;
      }).join('')}</div>
    </div>`;
  }).join('');
  
  $('timelineSidebar').innerHTML = `<div class="timeline-scroll">${html}</div>`;
}

// ✅ 新增：点击年份直接跳转（保留原展开/折叠逻辑）
function toggleYear(year) {
  const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
  if (!group) return;

  // 原逻辑：展开/折叠年份
  const isExpanded = group.classList.contains('expanded');
  document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));
  
  if (!isExpanded) {
    group.classList.add('expanded');
    // ✅ 新增：展开后平滑跳转到对应年份
    scrollToElement(`y${year}`, year, '');
  }
}

// ✅ 通用跳转函数（月份/年份共用所有加载优化）
function scrollToElement(elementId, year, month) {
  const el = $(elementId);
  if (!el) return;

  // 步骤1：立即取消所有非视口的正在进行的请求
  cancelNonViewportRequests();
  
  // 步骤2：标记为程序滚动，全程禁用懒加载直到滚动结束
  isScrollingToTarget = true;
  
  // 步骤3：平滑滚动到目标元素
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  // 步骤4：滚动完全结束后恢复懒加载并按优先级加载
  const handleScrollEnd = () => {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    
    isScrollingToTarget = false;
    loadByViewportPriority();
    updateUI(year, month);
    
    window.removeEventListener('scrollend', handleScrollEnd);
  };

  window.addEventListener('scrollend', handleScrollEnd);
  // 平滑滚动兜底：1.5秒后强制恢复
  scrollEndTimer = setTimeout(handleScrollEnd, 1500);
}

// ✅ 月份跳转函数（复用通用逻辑）
function scrollToMonth(month, year) {
  const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
  if (group) {
    document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));
    group.classList.add('expanded');
  }
  
  scrollToElement(`m${month}`, year, month);
}

// 带AbortController的图片加载函数（保留原错误处理）
function loadImage(img) {
  if (!img.dataset.src || img.src) return;
  
  // 取消该图片之前未完成的请求
  if (img.abortController) {
    img.abortController.abort();
    delete img.abortController;
  }

  const controller = new AbortController();
  img.abortController = controller;
  const src = img.dataset.src;
  const fallback = img.dataset.fallback;

  img.onload = () => {
    img.removeAttribute('data-src');
    img.classList.add('loaded');
    delete img.abortController;
  };
  
  img.onerror = () => {
    img.src = fallback;
    img.classList.add('loaded');
    delete img.abortController;
  };

  // 使用fetch加载图片，支持中断
  fetch(src, { 
    signal: controller.signal,
    priority: img.fetchPriority || 'auto'
  })
    .then(res => {
      if (!res.ok) throw new Error('Image load failed');
      return res.blob();
    })
    .then(blob => {
      img.src = URL.createObjectURL(blob);
    })
    .catch(err => {
      if (err.name !== 'AbortError') {
        // 降级处理：直接赋值src
        img.src = src;
      }
    });
}

// 按视口优先级加载图片
function loadByViewportPriority() {
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  const PRELOAD_MARGIN = window.innerHeight; // 预加载上下各1屏

  // 分类所有待加载图片
  const viewportImages = [];
  const preloadImages = [];
  const allLazyImages = document.querySelectorAll('img.lazy-img:not(.loaded)');

  allLazyImages.forEach(img => {
    const rect = img.getBoundingClientRect();
    const imgTop = rect.top + viewportTop;
    const imgBottom = rect.bottom + viewportTop;

    if (imgBottom >= viewportTop && imgTop <= viewportBottom) {
      viewportImages.push(img);
    } else if (imgBottom >= viewportTop - PRELOAD_MARGIN && imgTop <= viewportBottom + PRELOAD_MARGIN) {
      preloadImages.push(img);
    }
  });

  // 最高优先级：当前视口图片
  viewportImages.forEach(img => {
    img.fetchPriority = 'high';
    loadImage(img);
    viewportObserver.unobserve(img);
    preloadObserver.unobserve(img);
  });

  // 次优先级：预加载区域图片（延迟200ms）
  setTimeout(() => {
    preloadImages.forEach(img => {
      img.fetchPriority = 'low';
      loadImage(img);
      viewportObserver.unobserve(img);
      preloadObserver.unobserve(img);
    });
  }, 200);
}

// 取消所有非视口的正在进行的请求
function cancelNonViewportRequests() {
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  
  document.querySelectorAll('img.lazy-img:not(.loaded)').forEach(img => {
    if (!img.abortController) return;
    
    const rect = img.getBoundingClientRect();
    const imgTop = rect.top + viewportTop;
    const imgBottom = rect.bottom + viewportTop;
    
    // 取消不在当前视口内的请求
    if (imgBottom < viewportTop || imgTop > viewportBottom) {
      img.abortController.abort();
      delete img.abortController;
    }
  });
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

// 修复后的Observer初始化
function initObservers() {
  const headerOffset = 80;
  const scrollOpts = { threshold: 0, rootMargin: `-${headerOffset}px 0px -${window.innerHeight - headerOffset - 1}px 0px` };
  
  // 视口内图片加载Observer（添加程序滚动判断）
  viewportObserver = new IntersectionObserver(entries => {
    entries.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    entries.forEach(e => {
      // 只有非程序滚动且元素真正可见时才加载
      if (!isScrollingToTarget && e.isIntersecting) {
        loadImage(e.target);
        viewportObserver.unobserve(e.target);
        preloadObserver.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
  
  // 预加载Observer（添加程序滚动判断，减小预加载边距）
  preloadObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      // 只有非程序滚动且元素真正可见时才加载
      if (!isScrollingToTarget && e.isIntersecting && !e.target.src) {
        loadImage(e.target);
        viewportObserver.unobserve(e.target);
        preloadObserver.unobserve(e.target);
      }
    });
  }, { rootMargin: '50px 0px', threshold: 0.01 }); // 从200px减小到50px
  
  document.querySelectorAll('.lazy-img').forEach(img => {
    viewportObserver.observe(img);
    preloadObserver.observe(img);
  });
  
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