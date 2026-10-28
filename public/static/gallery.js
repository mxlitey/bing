(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

  const MARKET_FLAGS = window.BING_MARKETS.flags;
  const MARKET_NAMES = window.BING_MARKETS.names;

  let yearData = {};
  let marketConfig = {};
  let groupedData = {};
  let currentMarket = localStorage.getItem('bing_market') || 'zh-CN';
  let currentYear = '';
  let currentMonth = '';
  let viewportObserver = null;
  let yearObserver = null;
  let monthObserver = null;
  let scrollEndTimer = null;
  let timelineClickHandler = null;
  let scrollHandlerBound = false;
  let marketSelectorBound = false;

  function flattenData(data, market = null) {
    const all = [];
    for (const [year, months] of Object.entries(data)) {
      for (const [ym, markets] of Object.entries(months)) {
        for (const [mkt, items] of Object.entries(markets)) {
          if (Array.isArray(items)) {
            if (market && mkt !== market) continue;
            for (const item of items) {
              all.push({ ...item, belong_market: mkt });
            }
          }
        }
      }
    }
    all.sort((a, b) => b.date.localeCompare(a.date));
    return all;
  }

  let allDataFetched = false;

  // 用轻量签名判断数据是否真的变化，避免无意义的整页重建
  function dataSignature(data) {
    const parts = [];
    for (const year of Object.keys(data).sort()) {
      for (const ym of Object.keys(data[year]).sort()) {
        for (const market of Object.keys(data[year][ym]).sort()) {
          const items = data[year][ym][market];
          if (Array.isArray(items)) parts.push(`${ym}:${market}:${items.length}`);
        }
      }
    }
    return parts.join('|');
  }

  function renderForMarket() {
    groupData();
    const allData = flattenData(yearData, currentMarket);
    if (allData.length) renderHero(allData[0]);
    renderChronicle();
    renderTimeline();
    initObservers();
  }

  function applyData(data, config) {
    const sameData = dataSignature(data) === dataSignature(yearData);
    yearData = data;
    marketConfig = config;
    if (sameData && Object.keys(groupedData).length > 0) return;

    renderForMarket();
    initMarketSelector();
  }

  async function loadData() {
    const inlineData = window.__BING_DATA__;
    if (inlineData?.data) {
      applyData(inlineData.data, inlineData.marketConfig || {});
      const skeleton = $('skeleton');
      if (skeleton) skeleton.remove();
      fetchAllData();
      return;
    }

    fetchAllData();

    try {
      const response = await fetch('/json');
      if (!response.ok) throw new Error('请求失败');
      const cached = await response.json();

      if (!allDataFetched && cached.data) {
        applyData(cached.data, cached.market_time_config || {});
      }

      const skeleton = $('skeleton');
      if (skeleton) skeleton.remove();
    } catch (err) {
      const skeleton = $('skeleton');
      if (skeleton) skeleton.remove();
      if (!Object.keys(yearData).length) {
        $('chronicle').innerHTML = `<div class="loading-error">加载失败: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  async function fetchAllData() {
    try {
      const response = await fetch('/json?all=1');
      if (!response.ok) return;
      const cached = await response.json();
      if (cached.data) {
        allDataFetched = true;
        applyData(cached.data, cached.market_time_config || {});
      }
    } catch (e) {
      console.error('Failed to fetch all data:', e);
    }
  }

  function groupData() {
    groupedData = {};
    for (const [year, months] of Object.entries(yearData)) {
      for (const [ym, markets] of Object.entries(months)) {
        for (const [market, items] of Object.entries(markets)) {
          if (!Array.isArray(items)) continue;
          if (market !== currentMarket) continue;
          const y = ym.slice(0, 4);
          if (!groupedData[y]) groupedData[y] = {};
          if (!groupedData[y][ym]) groupedData[y][ym] = [];
          groupedData[y][ym].push(...items.map(item => ({ ...item, belong_market: market })));
        }
      }
    }
    for (const y of Object.keys(groupedData)) {
      for (const m of Object.keys(groupedData[y])) {
        groupedData[y][m].sort((a, b) => b.date.localeCompare(a.date));
      }
    }
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

  function renderChronicle() {
    currentYear = '';
    currentMonth = '';
    const years = Object.keys(groupedData).sort().reverse();
    if (!years.length) {
      $('chronicle').innerHTML = '<div class="loading-error">暂无壁纸数据</div>';
      return;
    }

    const chronicle = $('chronicle');
    chronicle.innerHTML = '';

    years.forEach(year => {
      const months = Object.keys(groupedData[year]).sort().reverse();
      const count = months.reduce((sum, m) => sum + groupedData[year][m].length, 0);

      const section = document.createElement('section');
      section.className = 'year-section';
      section.id = `y${year}`;
      section.innerHTML = `
        <div class="year-header">
          <h2 class="year-title">${escapeHtml(year)}</h2>
          <span class="year-count">${escapeHtml(String(count))} 张</span>
        </div>
      `;

      months.forEach(m => {
        const items = groupedData[year][m];
        const monthNum = m.slice(4, 6);

        const monthSection = document.createElement('section');
        monthSection.className = 'month-section';
        monthSection.id = `m${m}`;
        monthSection.innerHTML = `<h3 class="month-title">${MONTHS[+monthNum-1]}</h3>`;

        const grid = document.createElement('div');
        grid.className = 'thumb-grid';

        items.forEach(item => {
          const thumbItem = document.createElement('div');
          thumbItem.className = 'thumb-item';
          const imgUrl = item.image_url || item.url;
          thumbItem.onclick = () => {
            if (imgUrl) window.open(imgUrl, '_blank', 'noopener');
          };
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
          grid.appendChild(thumbItem);
        });

        monthSection.appendChild(grid);
        section.appendChild(monthSection);
      });

      chronicle.appendChild(section);
    });
  }

  function renderTimeline() {
    const years = Object.keys(groupedData).sort().reverse();
    
    const html = years.map(year => {
      const months = Object.keys(groupedData[year] || {}).sort().reverse();
      if (months.length === 0) return '';
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

    document.querySelectorAll('.thumb-item').forEach(el => {
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

  function renderForMarket() {
    groupData();
    const allData = flattenData(yearData, currentMarket);
    if (allData.length) renderHero(allData[0]);
    renderChronicle();
    renderTimeline();
    initObservers();
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
