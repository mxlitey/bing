(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

  const MARKET_FLAGS = window.BING_MARKETS.flags;
  const MARKET_NAMES = window.BING_MARKETS.names;

  let marketConfig = {};
  let manifest = { months: [], counts: {}, latest: {} };
  let marketMonths = [];          // 当前市场有数据的月份（降序）
  const monthCache = new Map();   // `${market}:${ym}` -> items
  const pendingMonths = new Map(); // 进行中的请求，避免重复拉取
  let currentMarket = localStorage.getItem('bing_market') || 'zh-CN';
  let currentYear = '';
  let currentMonth = '';
  let viewportObserver = null;
  let yearObserver = null;
  let monthObserver = null;
  let monthLoadObserver = null;
  let scrollEndTimer = null;
  let timelineClickHandler = null;
  let scrollHandlerBound = false;
  let marketSelectorBound = false;
  let idleTask = null;

  function monthsOfMarket(market) {
    const all = manifest.months || {};
    const list = Array.isArray(all) ? all : (all[market] || []);
    return list.slice().sort().reverse();
  }

  function countOf(market, ym) {
    const counts = manifest.counts || {};
    const perMarket = Array.isArray(counts) ? {} : (counts[market] || {});
    return perMarket[ym] || 0;
  }

  function cacheKey(market, ym) {
    return `${market}:${ym}`;
  }

  // 按月按市场拉取，命中缓存则直接返回
  function fetchMonth(ym, market = currentMarket) {
    const key = cacheKey(market, ym);
    if (monthCache.has(key)) return Promise.resolve(monthCache.get(key));
    if (pendingMonths.has(key)) return pendingMonths.get(key);

    const p = fetch(`/api/month?ym=${ym}&market=${encodeURIComponent(market)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(body => {
        const items = Array.isArray(body?.data) ? body.data : [];
        monthCache.set(key, items);
        return items;
      })
      .catch(() => [])
      .finally(() => pendingMonths.delete(key));

    pendingMonths.set(key, p);
    return p;
  }

  // 先渲染时间线骨架（依赖 manifest，不依赖月份数据）
  function renderForMarket() {
    marketMonths = monthsOfMarket(currentMarket);
    const latest = manifest.latest;   // 单市场时是一条记录，全量时是 map
    const heroItem = latest && typeof latest === 'object' && !latest.date
      ? latest[currentMarket]
      : latest;
    if (heroItem) renderHero(heroItem);
    renderChronicle();
    renderTimeline();
    initObservers();
  }

  async function loadData() {
    // 服务端已内联 manifest，首屏可直接渲染时间线与占位
    const inline = window.__BING_MANIFEST__;
    if (inline) {
      applyManifest(inline);
      removeSkeleton();
      loadVisibleMonths();
      return;
    }

    try {
      const res = await fetch(`/api/manifest?market=${encodeURIComponent(currentMarket)}`);
      if (!res.ok) throw new Error('请求失败');
      applyManifest(await res.json());
    } catch (err) {
      removeSkeleton();
      $('chronicle').innerHTML = `<div class="loading-error">加载失败: ${escapeHtml(err.message)}</div>`;
      return;
    }

    removeSkeleton();
    loadVisibleMonths();
  }

  function applyManifest(data) {
    manifest = {
      months: data.months || {},
      counts: data.counts || {},
      latest: data.latest || {}
    };
    marketConfig = data.market_time_config || {};
    renderForMarket();
    initMarketSelector();
  }

  function removeSkeleton() {
    const skeleton = $('skeleton');
    if (skeleton) skeleton.remove();
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function renderHero(latest) {
    const hero = $('hero');
    const loader = $('heroLoader');
    $('heroDate').textContent = `${latest.date.slice(0,4)}-${latest.date.slice(4,6)}-${latest.date.slice(6,8)}`;
    $('heroTitle').innerHTML = formatCopyright(latest.copyright);

    const imgUrl = latest.image_url || latest.url;
    if (!imgUrl) {
      if (loader) loader.classList.add('hidden');
      return;
    }

    const img = new Image();
    img.onload = () => {
      const heroUrl = imgUrl.replace('_UHD.jpg', '_1920x1080.jpg');
      hero.style.backgroundImage = `url("${heroUrl.replace(/"/g, '\\"')}")`;
      if (loader) loader.classList.add('hidden');
    };
    img.onerror = () => { if (loader) loader.classList.add('hidden'); };
    img.src = imgUrl.replace('_UHD.jpg', '_1920x1080.jpg');
  }

  function formatCopyright(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/([（(])/g, '<span class="nobr">$1').replace(/([）)])/g, '$1</span>');
  }

  // 只依赖 manifest 渲染全部年份/月份骨架，缩略图按月异步填入
  function renderChronicle() {
    currentYear = '';
    currentMonth = '';

    if (!marketMonths.length) {
      $('chronicle').innerHTML = '<div class="loading-error">暂无壁纸数据</div>';
      return;
    }

    const byYear = new Map();
    for (const ym of marketMonths) {
      const y = ym.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(ym);
    }

    const chronicle = $('chronicle');
    chronicle.innerHTML = '';

    for (const year of [...byYear.keys()].sort().reverse()) {
      const months = byYear.get(year).slice().sort().reverse();
      const total = months.reduce((sum, ym) => sum + countOf(currentMarket, ym), 0);

      const section = document.createElement('section');
      section.className = 'year-section';
      section.id = `y${year}`;
      section.innerHTML = `
        <div class="year-header">
          <h2 class="year-title">${escapeHtml(year)}</h2>
          <span class="year-count">${escapeHtml(String(total))} 张</span>
        </div>
      `;

      for (const ym of months) {
        const monthNum = ym.slice(4, 6);
        const monthSection = document.createElement('section');
        monthSection.className = 'month-section';
        monthSection.id = `m${ym}`;
        monthSection.dataset.ym = ym;
        monthSection.dataset.loaded = '0';
        monthSection.innerHTML = `<h3 class="month-title">${MONTHS[+monthNum - 1]}</h3>`;

        const grid = document.createElement('div');
        grid.className = 'thumb-grid';
        // 先用索引里的条数铺占位，保持滚动高度稳定，避免加载时跳动
        grid.innerHTML = placeholderBlocks(countOf(currentMarket, ym));
        monthSection.appendChild(grid);
        section.appendChild(monthSection);
      }

      chronicle.appendChild(section);
    }

    // 视口附近的月份优先加载，其余空闲时补
    observeMonthSections();
  }

  function placeholderBlocks(count) {
    return new Array(Math.min(count, 31))
      .fill('<div class="thumb-item skeleton-shimmer"></div>')
      .join('');
  }

  function fillMonth(monthSection, items) {
    const grid = monthSection.querySelector('.thumb-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (const item of items) {
      const imgUrl = item.image_url || item.url;
      const thumbItem = document.createElement('div');
      thumbItem.className = 'thumb-item';
      if (imgUrl) {
        thumbItem.onclick = () => window.open(imgUrl, '_blank', 'noopener');
      }

      const img = document.createElement('img');
      img.className = 'lazy-img';
      img.decoding = 'async';
      if (imgUrl) {
        img.dataset.src = imgUrl.replace('_UHD.jpg', '_400x240.jpg');
        img.dataset.fallback = imgUrl.replace('_UHD.jpg', '_800x480.jpg');
      }
      img.alt = item.copyright || '';

      const dateDiv = document.createElement('div');
      dateDiv.className = 'thumb-date';
      dateDiv.textContent = item.date.slice(6, 8);

      thumbItem.appendChild(img);
      thumbItem.appendChild(dateDiv);
      frag.appendChild(thumbItem);
    }

    grid.appendChild(frag);
    monthSection.dataset.loaded = '1';
  }

  async function loadMonthSection(monthSection) {
    const ym = monthSection.dataset.ym;
    if (!ym || monthSection.dataset.loaded === '1' || monthSection.dataset.loading === '1') return;

    monthSection.dataset.loading = '1';
    const items = await fetchMonth(ym);
    fillMonth(monthSection, items);
    delete monthSection.dataset.loading;

    // 新插入的图片交给观察器
    monthSection.querySelectorAll('.thumb-item').forEach(el => {
      viewportObserver?.observe(el);
    });
  }

  // 时间线直接由 manifest 的月份索引生成，打开页面即完整显示全部月份
  function renderTimeline() {
    const byYear = new Map();
    for (const ym of marketMonths) {
      const y = ym.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(ym);
    }

    const html = [...byYear.keys()].sort().reverse().map(year => {
      const months = byYear.get(year).slice().sort().reverse();
      return `<div class="timeline-group" data-year="${escapeHtml(year)}">
        <a href="#y${escapeHtml(year)}" class="timeline-item">
          <span class="timeline-dot"></span><span>${escapeHtml(year)}</span>
          <svg class="timeline-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
        </a>
        <div class="timeline-sub">${months.map(m => {
          const monthNum = m.slice(4, 6);
          return `<a href="#m${escapeHtml(m)}" class="timeline-sub-item" data-month="${escapeHtml(m)}" data-year="${escapeHtml(year)}"><span class="timeline-dot"></span><span>${MONTHS[+monthNum-1]}</span></a>`;
        }).join('')}</div>
      </div>`;
    }).join('');

    const sidebar = $('timelineSidebar');
    sidebar.innerHTML = `<div class="timeline-scroll">${html}</div>`;

    if (timelineClickHandler) {
      sidebar.removeEventListener('click', timelineClickHandler);
    }
    
    timelineClickHandler = (e) => {
      const item = e.target.closest('.timeline-item');
      const subItem = e.target.closest('.timeline-sub-item');
      if (subItem) {
        e.preventDefault();
        scrollToMonth(subItem.dataset.month, subItem.dataset.year);
      } else if (item) {
        e.preventDefault();
        toggleYear(item.closest('.timeline-group').dataset.year);
      }
    };
    
    sidebar.addEventListener('click', timelineClickHandler);
  }

  function toggleYear(year) {
    const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
    if (!group) return;

    const isExpanded = group.classList.contains('expanded');
    document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));

    if (!isExpanded) {
      group.classList.add('expanded');
      scrollTimelineToYear(year);
    }
  }

  function scrollTimelineToYear(year) {
    const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
    if (!group) return;
    const scroll = document.querySelector('.timeline-scroll');
    if (!scroll) return;
    
    const groupRect = group.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const scrollTop = scroll.scrollTop;
    const groupTop = groupRect.top - scrollRect.top + scrollTop;
    const groupHeight = groupRect.height;
    const scrollHeight = scrollRect.height;
    
    const targetScroll = groupTop - (scrollHeight / 2) + (groupHeight / 2);
    scroll.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }

  function scrollToElement(elementId, year, month) {
    const el = $(elementId);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 跳转后重新校准时间线高亮
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => updateUI(year, month), 400);
  }

  function scrollToMonth(month, year) {
    const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
    if (group) {
      document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));
      group.classList.add('expanded');
    }
    scrollToElement(`m${month}`, year, month);
  }

  function loadImage(img) {
    if (!img.dataset.src || img.src) return;

    const src = img.dataset.src;
    const fallback = img.dataset.fallback;

    img.onload = () => {
      img.removeAttribute('data-src');
      img.classList.add('loaded');
    };

    img.onerror = () => {
      if (fallback && img.src !== fallback) {
        img.dataset.src = fallback;
        img.dataset.fallback = '';
        img.src = fallback;
      } else {
        img.classList.add('loaded');
      }
    };

    // 直接交给浏览器加载，可命中 HTTP 缓存；不再走 fetch+blob（会绕过缓存并长期占用内存）
    img.src = src;
  }

  function updateUI(year, month) {
    if (year === currentYear && month === currentMonth) return;
    currentYear = year;
    currentMonth = month;

    document.querySelectorAll('.timeline-group').forEach(g => {
      const active = g.dataset.year === year;
      g.classList.toggle('active', active);
      g.classList.toggle('expanded', active);
      if (active) {
        g.querySelectorAll('.timeline-sub-item').forEach(item => {
          item.classList.toggle('active', item.dataset.month === month);
        });
      }
    });
  }

  function initObservers() {
    viewportObserver?.disconnect();
    yearObserver?.disconnect();
    monthObserver?.disconnect();

    const headerOffset = 80;
    const scrollOpts = { threshold: 0, rootMargin: `-${headerOffset}px 0px -${window.innerHeight - headerOffset - 1}px 0px` };

    // 单阈值即可：之前用 6 档阈值，1900 张图滚动一遍会产生上万次回调。
    // 观察 .thumb-item 而不是内部 img：content-visibility 会跳过屏幕外子树，
    // 其内部的 img 没有布局盒，直接观察它可能不触发回调。
    viewportObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target.querySelector('img.lazy-img:not(.loaded)');
        if (img) loadImage(img);
        viewportObserver.unobserve(e.target);
      });
    }, { rootMargin: '300px 0px', threshold: 0 });

    document.querySelectorAll('.thumb-item:not(.skeleton-shimmer)').forEach(el => {
      viewportObserver.observe(el);
    });

    yearObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          updateUI(entry.target.id.slice(1), currentMonth);
          break;
        }
      }
    }, scrollOpts);

    monthObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const m = entry.target.id.slice(1);
          updateUI(m.slice(0, 4), m);
          break;
        }
      }
    }, scrollOpts);

    document.querySelectorAll('.year-section').forEach(s => yearObserver.observe(s));
    document.querySelectorAll('.month-section').forEach(s => monthObserver.observe(s));

    initScrollHandler();
  }

  function initScrollHandler() {
    if (scrollHandlerBound) return;
    scrollHandlerBound = true;

    let lastScrollY = 0;
    let sidebarVisible = false;
    let heroHeight = 0;

    // 只负责侧边栏显隐；图片加载全部交给 IntersectionObserver
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      if (Math.abs(scrollY - lastScrollY) < 50) return;
      lastScrollY = scrollY;

      if (!heroHeight) heroHeight = $('hero')?.offsetHeight || 0;
      const show = currentYear && scrollY > heroHeight * 0.5;
      if (show !== sidebarVisible) {
        sidebarVisible = show;
        $('timelineSidebar').classList.toggle('visible', show);
      }
    }, { passive: true });
  }

  // 先加载视口附近的月份，剩下的在浏览器空闲时逐个补齐
  function observeMonthSections() {
    monthLoadObserver?.disconnect();
    monthLoadObserver = new IntersectionObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          loadMonthSection(entry.target);
          monthLoadObserver.unobserve(entry.target);
          changed = true;
        }
      }
      if (changed) scheduleIdlePrefetch();
    }, { rootMargin: '600px 0px', threshold: 0 });

    document.querySelectorAll('.month-section').forEach(s => monthLoadObserver.observe(s));
  }

  // 优先把当前视口内的月份拉完，再用空闲时间预取相邻月份
  async function loadVisibleMonths() {
    const sections = [...document.querySelectorAll('.month-section')];
    const near = sections.filter(s => {
      const rect = s.getBoundingClientRect();
      return rect.bottom >= -600 && rect.top <= window.innerHeight + 600;
    });

    await Promise.all(near.map(loadMonthSection));
    scheduleIdlePrefetch();
  }

  function scheduleIdlePrefetch() {
    if (idleTask) return;
    const run = () => {
      idleTask = null;
      const next = [...document.querySelectorAll('.month-section')]
        .filter(s => s.dataset.loaded !== '1');
      if (!next.length) return;

      // 每次只补一个月，避免长时间占用主线程
      loadMonthSection(next[0]).then(() => {
        if (document.querySelector('.month-section[data-loaded="0"]')) scheduleIdlePrefetch();
      });
    };

    idleTask = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run, { timeout: 2000 })
      : setTimeout(run, 300);
  }

  function initMarketSelector() {
    const dropdown = $('marketDropdown');
    const btn = $('marketBtn');

    const markets = Object.keys(marketConfig);
    if (!markets.length) return;

    dropdown.innerHTML = markets.map(market => {
      const flagCode = MARKET_FLAGS[market] || 'un';
      const name = MARKET_NAMES[market] || market;
      const activeClass = market === currentMarket ? ' active' : '';
      return `<button class="market-option${activeClass}" data-market="${escapeHtml(market)}">
        <span class="fi fi-${flagCode} fis square-flag"></span>
        <span>${escapeHtml(name)}</span>
      </button>`;
    }).join('');

    if (!marketSelectorBound) {
      marketSelectorBound = true;

      btn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      };

      dropdown.onclick = (e) => {
        const option = e.target.closest('.market-option');
        if (!option) return;
        const market = option.dataset.market;
        if (market === currentMarket) {
          dropdown.classList.remove('show');
          return;
        }

        currentMarket = market;
        localStorage.setItem('bing_market', market);

        updateMarketButton();
        dropdown.querySelectorAll('.market-option').forEach(opt => {
          opt.classList.toggle('active', opt.dataset.market === market);
        });
        dropdown.classList.remove('show');

        const loader = $('heroLoader');
        if (loader) loader.classList.remove('hidden');
        $('hero').style.backgroundImage = '';

        renderForMarket();
        loadVisibleMonths();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      document.addEventListener('click', () => {
        dropdown.classList.remove('show');
      });
    }

    updateMarketButton();
  }

  function updateMarketButton() {
    const btn = $('marketBtn');
    const flagCode = MARKET_FLAGS[currentMarket] || 'un';
    btn.innerHTML = `<span class="fi fi-${flagCode} fis square-flag"></span>`;
    const name = MARKET_NAMES[currentMarket] || currentMarket;
    btn.title = `当前市场: ${name}`;
  }

  window.scrollTo(0, 0);
  loadData();
})();
