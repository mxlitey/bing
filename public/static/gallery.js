(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

  const MARKET_FLAGS = {
    'zh-CN': 'cn',
    'en-US': 'us',
    'en-GB': 'gb',
    'de-DE': 'de',
    'fr-FR': 'fr',
    'ja-JP': 'jp',
    'en-CA': 'ca',
    'fr-CA': 'ca',
    'en-IN': 'in',
    'en-WW': 'un',
    'es-ES': 'es',
    'it-IT': 'it',
    'pt-BR': 'br'
  };

  const MARKET_NAMES = {
    'zh-CN': '中国',
    'en-US': '美国',
    'en-GB': '英国',
    'de-DE': '德国',
    'fr-FR': '法国',
    'ja-JP': '日本',
    'en-CA': '加拿大 (英)',
    'fr-CA': '加拿大 (法)',
    'en-IN': '印度',
    'en-WW': '国际',
    'es-ES': '西班牙',
    'it-IT': '意大利',
    'pt-BR': '巴西'
  };

  let yearData = {};
  let marketConfig = {};
  let groupedData = {};
  let currentMarket = localStorage.getItem('bing_market') || 'zh-CN';
  let isScrollingToTarget = false;
  let currentYear = '';
  let currentMonth = '';
  let viewportObserver = null;
  let preloadObserver = null;
  let scrollEndTimer = null;
  let scrollPriorityTimer = null;
  let timelineClickHandler = null;
  const blobUrls = new Set();

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

  async function loadData() {
    const inlineData = window.__BING_DATA__;
    if (inlineData?.data) {
      yearData = inlineData.data;
      marketConfig = inlineData.marketConfig || {};
      initMarketSelector();
      groupData();
      const allData = flattenData(yearData, currentMarket);
      if (allData.length) renderHero(allData[0]);
      renderChronicle();
      renderTimeline();
      initObservers();
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
        yearData = cached.data;
        marketConfig = cached.market_time_config || {};
        initMarketSelector();
        const allData = flattenData(yearData, currentMarket);
        if (allData.length) renderHero(allData[0]);
        groupData();
        renderChronicle();
        renderTimeline();
        initObservers();
      }

      const skeleton = $('skeleton');
      if (skeleton) skeleton.remove();
    } catch (err) {
      const skeleton = $('skeleton');
      if (skeleton) skeleton.remove();
      if (!Object.keys(yearData).length) {
        const chronicle = $('chronicle');
        chronicle.innerHTML = `<div class="loading-error">加载失败: ${escapeHtml(err.message)}</div>`;
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
        yearData = cached.data;
        marketConfig = cached.market_time_config || {};
        initMarketSelector();
        const allData = flattenData(yearData, currentMarket);
        if (allData.length) renderHero(allData[0]);
        groupData();
        renderChronicle();
        renderTimeline();
        initObservers();
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
          if (imgUrl) {
            img.dataset.src = imgUrl.replace('_UHD.jpg','_800x480.jpg');
            img.dataset.fallback = imgUrl;
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

    cancelNonViewportRequests();
    isScrollingToTarget = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const handleScrollEnd = () => {
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      isScrollingToTarget = false;
      loadByViewportPriority();
      updateUI(year, month);
      window.removeEventListener('scrollend', handleScrollEnd);
    };

    window.addEventListener('scrollend', handleScrollEnd);
    scrollEndTimer = setTimeout(handleScrollEnd, 1500);
  }

  function scrollToMonth(month, year) {
    const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
    if (group) {
      document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));
      group.classList.add('expanded');
    }
    scrollToElement(`m${month}`, year, month);
  }

  function revokeBlobUrl(url) {
    if (blobUrls.has(url)) {
      URL.revokeObjectURL(url);
      blobUrls.delete(url);
    }
  }

  function loadImage(img) {
    if (!img.dataset.src || img.src) return;

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
      if (img.src?.startsWith('blob:')) revokeBlobUrl(img.src);
      img.src = fallback;
      img.classList.add('loaded');
      delete img.abortController;
    };

    fetch(src, { signal: controller.signal, priority: img.fetchPriority || 'auto' })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.add(blobUrl);
        img.src = blobUrl;
      })
      .catch(err => {
        if (err.name !== 'AbortError') img.src = src;
      });
  }

  function loadByViewportPriority() {
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const PRELOAD_MARGIN = window.innerHeight;

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

    viewportImages.forEach(img => {
      img.fetchPriority = 'high';
      loadImage(img);
      viewportObserver?.unobserve(img);
      preloadObserver?.unobserve(img);
    });

    setTimeout(() => {
      preloadImages.forEach(img => {
        img.fetchPriority = 'low';
        loadImage(img);
        viewportObserver?.unobserve(img);
        preloadObserver?.unobserve(img);
      });
    }, 200);
  }

  function cancelNonViewportRequests() {
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    document.querySelectorAll('img.lazy-img:not(.loaded)').forEach(img => {
      if (!img.abortController) return;

      const rect = img.getBoundingClientRect();
      const imgTop = rect.top + viewportTop;
      const imgBottom = rect.bottom + viewportTop;

      if (imgBottom < viewportTop || imgTop > viewportBottom) {
        if (img.src?.startsWith('blob:')) revokeBlobUrl(img.src);
        img.removeAttribute('src');
        img.abortController.abort();
        delete img.abortController;
      }
    });
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
    const headerOffset = 80;
    const scrollOpts = { threshold: 0, rootMargin: `-${headerOffset}px 0px -${window.innerHeight - headerOffset - 1}px 0px` };

    viewportObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!isScrollingToTarget && e.isIntersecting) {
          loadImage(e.target);
          viewportObserver.unobserve(e.target);
          preloadObserver?.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });

    preloadObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!isScrollingToTarget && e.isIntersecting && !e.target.src) {
          loadImage(e.target);
          viewportObserver?.unobserve(e.target);
          preloadObserver.unobserve(e.target);
        }
      });
    }, { rootMargin: '50px 0px', threshold: 0.01 });

    document.querySelectorAll('.lazy-img').forEach(img => {
      viewportObserver.observe(img);
      preloadObserver.observe(img);
    });

    const heroHeight = $('hero')?.offsetHeight || 0;
    let lastScrollY = 0;
    let sidebarVisible = false;

    const yearObserver = new IntersectionObserver(entries => {
      if (isScrollingToTarget) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          updateUI(entry.target.id.slice(1), currentMonth);
          break;
        }
      }
    }, scrollOpts);

    const monthObserver = new IntersectionObserver(entries => {
      if (isScrollingToTarget) return;
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

    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      if (Math.abs(scrollY - lastScrollY) < 50) return;
      lastScrollY = scrollY;

      const show = currentYear && scrollY > heroHeight * 0.5;
      if (show !== sidebarVisible) {
        sidebarVisible = show;
        $('timelineSidebar').classList.toggle('visible', show);
      }

      if (scrollPriorityTimer) clearTimeout(scrollPriorityTimer);
      scrollPriorityTimer = setTimeout(() => {
        cancelNonViewportRequests();
        loadByViewportPriority();
      }, 150);
    }, { passive: true });
  }

  function cleanup() {
    blobUrls.forEach(url => URL.revokeObjectURL(url));
    blobUrls.clear();
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
      
      groupData();
      const allData = flattenData(yearData, currentMarket);
      if (allData.length) renderHero(allData[0]);
      renderChronicle();
      renderTimeline();
      initObservers();
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });
    
    updateMarketButton();
  }

  function updateMarketButton() {
    const btn = $('marketBtn');
    const flagCode = MARKET_FLAGS[currentMarket] || 'un';
    btn.innerHTML = `<span class="fi fi-${flagCode} fis square-flag"></span>`;
    const name = MARKET_NAMES[currentMarket] || currentMarket;
    btn.title = `当前市场: ${name}`;
  }

  window.addEventListener('beforeunload', cleanup);

  window.scrollTo(0, 0);
  loadData();
})();
