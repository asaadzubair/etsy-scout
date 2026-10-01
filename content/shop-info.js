// Escout — optional "Shop Info" overlay.
//
// Completely separate from the exact-match keyword/title/tag/description/
// image workflow: a standalone on/off toggle that adds a small badge to
// each visible listing card showing real, live data — nothing estimated,
// nothing from a third-party database:
//   - shop age (create_date), from Etsy's Open API v3
//   - shop's total lifetime sales (transaction_sold_count), from the API
//   - shop's active listing count (listing_active_count), from the API
//   - this listing's favorites (num_favorers) and views, from the API
//   - shop owner's display name, scraped from the shop's public "Shop
//     members" section when the seller has chosen to show one (not every
//     shop does — omitted entirely when absent, never guessed)
// Etsy's API has no historical/trend endpoint, so no "weekly sales" trend
// is shown or fabricated — only this live snapshot.
(function (Escout) {
  const { getListingCards } = Escout.detector;
  const { getShopOwnerName } = Escout.extractors;

  let enabled = false;
  let observer = null;
  const trackedImageContainers = new Set();
  const shopOwnerCache = new Map(); // shopUrl -> Promise<string|null>

  function getOwnerNameCached(shopUrl) {
    if (!shopOwnerCache.has(shopUrl)) {
      shopOwnerCache.set(shopUrl, getShopOwnerName(shopUrl));
    }
    return shopOwnerCache.get(shopUrl);
  }

  function formatCount(n) {
    if (n === null || n === undefined) return null;
    return n.toLocaleString();
  }

  // Relative duration ("2 months", "1 year 6 months") computed from the
  // shop's real create_date against the current time — not an estimate,
  // just a different display of the same exact timestamp Etsy returns.
  function formatShopAge(createTimestampSeconds) {
    if (!createTimestampSeconds) return null;
    const createdMs = createTimestampSeconds * 1000;
    const now = Date.now();
    if (now <= createdMs) return 'New shop';

    const totalMonths = Math.max(0, Math.round((now - createdMs) / (1000 * 60 * 60 * 24 * 30.44)));
    if (totalMonths === 0) return 'New shop';

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const yearsText = years ? `${years} ${years === 1 ? 'year' : 'years'}` : '';
    const monthsText = months ? `${months} ${months === 1 ? 'month' : 'months'}` : '';
    return [yearsText, monthsText].filter(Boolean).join(' ');
  }

  // Three lines: owner name on its own (so it's never truncated by the
  // stats next to it), then shop stats, then this listing's favorites/views.
  function buildBadgeLines(data, ownerName) {
    const lines = [];
    if (ownerName) lines.push(ownerName);

    const shopParts = [];
    const age = formatShopAge(data.shopAgeTimestamp);
    if (age) shopParts.push(age);
    const sales = formatCount(data.shopTotalSales);
    if (sales !== null) shopParts.push(sales + ' sales');
    const listings = formatCount(data.shopListingCount);
    if (listings !== null) shopParts.push(listings + ' listings');
    if (shopParts.length) lines.push(shopParts.join(' · '));

    const listingParts = [];
    const favorites = formatCount(data.favorites);
    if (favorites !== null) listingParts.push('♥ ' + favorites);
    const views = formatCount(data.views);
    if (views !== null) listingParts.push('👁 ' + views);
    if (listingParts.length) lines.push(listingParts.join('   '));

    return lines;
  }

  function removeBadge(container) {
    const existing = container.querySelector('.es-shop-badge');
    if (existing) existing.remove();
  }

  function renderLines(container, lines, extraClass) {
    removeBadge(container);
    if (!lines.length) return;
    const badge = document.createElement('div');
    badge.className = 'es-shop-badge' + (extraClass ? ' ' + extraClass : '');
    lines.forEach((line) => {
      const row = document.createElement('div');
      row.className = 'es-shop-badge-line';
      row.textContent = line; // textContent only — never innerHTML with page-derived text
      badge.appendChild(row);
    });
    if (!container.style.position) container.style.position = 'relative';
    container.appendChild(badge);
  }

  function fetchShopOverview(listingId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'ESCOUT_FETCH_SHOP_OVERVIEW', listingId }, (response) => {
          resolve(response || { ok: false, reason: 'no-response' });
        });
      } catch (e) {
        resolve({ ok: false, reason: 'messaging-error' });
      }
    });
  }

  async function processCard(card) {
    if (!card.imageContainer || card.imageContainer.dataset.esShopInfo) return;
    card.imageContainer.dataset.esShopInfo = 'pending';
    renderLines(card.imageContainer, ['Loading shop info…'], 'es-shop-badge-loading');

    const result = await fetchShopOverview(card.id);

    // The toggle may have been switched off while this fetch was in flight.
    if (!enabled) return;

    if (!result.ok) {
      const message =
        result.reason === 'no-key'
          ? 'Set your Etsy API key in Options'
          : result.reason === 'rate-limited'
          ? 'Etsy API rate limit'
          : 'Shop info unavailable';
      renderLines(card.imageContainer, [message], 'es-shop-badge-error');
      card.imageContainer.dataset.esShopInfo = 'error';
      return;
    }

    const lines = buildBadgeLines(result);
    renderLines(card.imageContainer, lines.length ? lines : ['No shop data available']);
    card.imageContainer.dataset.esShopInfo = 'done';

    // Owner name needs its own extra page fetch (not part of the API
    // response), so it's patched in a moment after the rest of the badge —
    // keeps the numbers appearing fast without blocking on it.
    if (result.shopUrl) {
      const container = card.imageContainer;
      getOwnerNameCached(result.shopUrl).then((ownerName) => {
        if (!enabled || !ownerName) return;
        if (!container.isConnected || container.dataset.esShopInfo !== 'done') return;
        renderLines(container, buildBadgeLines(result, ownerName));
      });
    }
  }

  // Cards are only fetched once they actually scroll near the viewport —
  // this keeps Escout from firing dozens of API calls the moment the
  // toggle is switched on for a long results page.
  function observe(container) {
    if (trackedImageContainers.has(container)) return;
    trackedImageContainers.add(container);
    observer.observe(container);
  }

  function scan() {
    if (!enabled) return;
    getListingCards().forEach((card) => {
      if (card.imageContainer) observe(card.imageContainer);
    });
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const cards = getListingCards();
          const card = cards.find((c) => c.imageContainer === entry.target);
          observer.unobserve(entry.target);
          if (card) processCard(card);
        });
      },
      { rootMargin: '300px' }
    );
    scan();
  }

  function disable() {
    enabled = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    trackedImageContainers.forEach((container) => {
      delete container.dataset.esShopInfo;
      removeBadge(container);
    });
    trackedImageContainers.clear();
  }

  function toggle(nextEnabled) {
    if (nextEnabled) enable();
    else disable();
  }

  // Called after a rescan (new keyword, explicit rescan, or newly loaded
  // cards) so newly-appeared cards get observed too, without re-scanning
  // continuously on a timer.
  function rescan() {
    if (enabled) scan();
  }

  Escout.shopInfo = { toggle, rescan, isEnabled: () => enabled };
})(window.Escout = window.Escout || {});
