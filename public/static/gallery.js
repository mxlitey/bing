(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

  let allData = [];
  let years = [];
  let groupedData = {};
  let isScrollingToTarget = false;
  let currentYear = '';
  let currentMonth = '';
  let viewportObserver = null;
  let preloadObserver = null;
  let scrollEndTimer = null;
  let scrollPriorityTimer = null;
  const blobUrls = new Set();

  async function loadData() {
    try {
      const response = await fetch('/json');
      if (!response.ok) throw new Error('请求失败');
      const cached = await response.json();
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
      (groupedData[y] ??= {})[m] ??= [];
      groupedData[y][m].push(item);
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function renderHero(latest) {
    const hero = $('hero');
    const thumbUrl = latest.url.replace('_UHD.jpg','_800x480.jpg');
    hero.style.backgroundImage = `url("${thumbUrl.replace(/"/g, '\\"')}")`;
    $('heroDate').textContent = `${latest.date.slice(0,4)}-${latest.date.slice(4,6)}-${latest.date.slice(6,8)}`;
    $('heroTitle').textContent = latest.copyright;

    fetch(latest.url, { priority: 'low' })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.add(blobUrl);
        hero.style.setProperty('--hero-hd-url', `url("${blobUrl}")`);
        hero.classList.add('hero-hd');
      })
      .catch(() => {});
  }

  function renderChronicle() {
    if (!allData.length) { $('loading').textContent = '暂无壁纸数据'; return; }
    $('loading').remove();

    const chronicle = $('chronicle');
    chronicle.innerHTML = '';

    years.filter(y => groupedData[y]).forEach(year => {
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
          thumbItem.onclick = () => window.open(item.url, '_blank', 'noopener');

          const img = document.createElement('img');
          img.className = 'lazy-img';
          img.dataset.src = item.url.replace('_UHD.jpg','_800x480.jpg');
          img.dataset.fallback = item.url;
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
    const html = years.filter(y => groupedData[y]).map(year => {
      const months = Object.keys(groupedData[year]).sort().reverse();
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

    $('timelineSidebar').innerHTML = `<div class="timeline-scroll">${html}</div>`;

    $('timelineSidebar').addEventListener('click', (e) => {
      const item = e.target.closest('.timeline-item');
      const subItem = e.target.closest('.timeline-sub-item');
      if (subItem) {
        e.preventDefault();
        scrollToMonth(subItem.dataset.month, subItem.dataset.year);
      } else if (item) {
        e.preventDefault();
        toggleYear(item.closest('.timeline-group').dataset.year);
      }
    });
  }

  function toggleYear(year) {
    const group = document.querySelector(`.timeline-group[data-year="${year}"]`);
    if (!group) return;

    const isExpanded = group.classList.contains('expanded');
    document.querySelectorAll('.timeline-group').forEach(g => g.classList.remove('expanded'));

    if (!isExpanded) {
      group.classList.add('expanded');
      scrollToElement(`y${year}`, year, '');
    }
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

  window.addEventListener('beforeunload', cleanup);

  document.addEventListener('DOMContentLoaded', () => {
    window.scrollTo(0, 0);
    loadData();
  });
})();
