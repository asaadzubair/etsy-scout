// Escout — background service worker.
//
// Etsy no longer publishes tags anywhere on a listing's public page (this
// was verified directly). The only legitimate, non-bypassing way to read a
// listing's real tags (and, for the optional Shop Info overlay, real shop
// stats) is Etsy's own official Open API v3 — a sanctioned public API, not
// a workaround, and not a per-user login of any kind.
//
// This extension does NOT ship with any API credentials baked in. Each user
// provides their own free Etsy "Personal Access" app keystring + shared
// secret via the extension's Options page (chrome.storage.sync) — see
// options.html / options.js. This keeps the extension safe to publish and
// share: nobody's personal API quota is exposed in the source code.
//
// Etsy requires the API key header as "<keystring>:<shared secret>" (this
// changed recently — a keystring alone now returns 403 "Shared secret is
// required in x-api-key header").
//
// The request is made here (not in the content script) because a
// background service worker's fetch() to a host listed in
// `host_permissions` is exempt from page-level CORS, so this is the
// reliable place to call a cross-origin API like openapi.etsy.com.

const ETSY_OPEN_API_BASE = 'https://openapi.etsy.com/v3/application';

async function getApiKeyHeader() {
  const { etsyKeystring, etsySharedSecret } = await chrome.storage.sync.get([
    'etsyKeystring',
    'etsySharedSecret',
  ]);
  if (!etsyKeystring || !etsySharedSecret) return null;
  return `${etsyKeystring}:${etsySharedSecret}`;
}

// ---- Rate-limit-safe request queue ----------------------------------------
// A personal Etsy API app is capped at 5 requests/second. Every call in this
// file goes through this single queue so we can never burst past that, no
// matter how many listing cards the Shop Info overlay tries to fetch at once
// (e.g. while the user scrolls quickly through a long results page).
const MAX_REQUESTS_PER_SECOND = 4; // stay safely under Etsy's 5 QPS cap
const MIN_GAP_MS = 1000 / MAX_REQUESTS_PER_SECOND;
let requestChain = Promise.resolve();
let lastRequestAt = 0;

function queuedFetch(url) {
  const task = requestChain.then(async () => {
    const apiKeyHeader = await getApiKeyHeader();
    if (!apiKeyHeader) {
      // Signals "no-key" distinctly from a real HTTP failure so callers can
      // tell the user to open Options instead of showing a generic error.
      return { noKey: true };
    }
    const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fetch(url, { headers: { 'x-api-key': apiKeyHeader } });
  });
  // Keep the chain alive even if this particular request fails.
  requestChain = task.catch(() => {});
  return task;
}

// ---- Cached raw API reads ---------------------------------------------
// Listings/shops don't change meaningfully within one browsing session, so
// we cache each by id for the lifetime of the service worker — this avoids
// re-fetching the same shop's stats once per listing card.
const listingCache = new Map(); // listingId -> Promise<{ok, data|status}>
const shopCache = new Map(); // shopId -> Promise<{ok, data|status}>

async function rawFetch(url) {
  try {
    const response = await queuedFetch(url);
    if (response.noKey) return { ok: false, noKey: true };
    if (!response.ok) return { ok: false, status: response.status };
    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function getListingData(listingId) {
  if (!listingCache.has(listingId)) {
    listingCache.set(listingId, rawFetch(`${ETSY_OPEN_API_BASE}/listings/${listingId}`));
  }
  return listingCache.get(listingId);
}

function getShopData(shopId) {
  if (!shopCache.has(shopId)) {
    shopCache.set(shopId, rawFetch(`${ETSY_OPEN_API_BASE}/shops/${shopId}`));
  }
  return shopCache.get(shopId);
}

function failureReason(result) {
  if (result.noKey) return 'no-key';
  if (result.status === 401 || result.status === 403) return 'invalid-key';
  if (result.status === 429) return 'rate-limited';
  return 'http-error';
}

async function fetchListingTags(listingId) {
  const result = await getListingData(listingId);
  if (!result.ok) return { ok: false, reason: failureReason(result) };

  const tags = Array.isArray(result.data.tags) ? result.data.tags.filter(Boolean) : [];
  return { ok: true, tags };
}

// Shop Info overlay data — every field here comes straight from Etsy's own
// API response, live, with no estimation or historical/trend data:
//   - favorites / views: from the listing resource (num_favorers, views)
//   - shopAgeTimestamp: shop's create_date (seconds since epoch)
//   - shopTotalSales: shop's transaction_sold_count (exact, real)
//   - shopListingCount: shop's listing_active_count (exact, real)
// Etsy's API has no historical/trend endpoint, so no "weekly sales" figure
// is fabricated or estimated — only this live snapshot is returned.
async function fetchShopOverview(listingId) {
  const listingResult = await getListingData(listingId);
  if (!listingResult.ok) return { ok: false, reason: failureReason(listingResult) };

  const listing = listingResult.data;
  const overview = {
    ok: true,
    favorites: typeof listing.num_favorers === 'number' ? listing.num_favorers : null,
    views: typeof listing.views === 'number' ? listing.views : null,
    shopAgeTimestamp: null,
    shopTotalSales: null,
    shopListingCount: null,
    shopUrl: null, // used by the content script to look up the shop owner's public display name, if any
  };

  if (!listing.shop_id) return overview;

  const shopResult = await getShopData(listing.shop_id);
  if (!shopResult.ok) return overview; // still return what the listing alone gave us

  const shop = shopResult.data;
  overview.shopAgeTimestamp = typeof shop.create_date === 'number' ? shop.create_date : null;
  overview.shopTotalSales = typeof shop.transaction_sold_count === 'number' ? shop.transaction_sold_count : null;
  overview.shopListingCount = typeof shop.listing_active_count === 'number' ? shop.listing_active_count : null;
  overview.shopUrl = typeof shop.url === 'string' ? shop.url : null;
  return overview;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'ESCOUT_FETCH_TAGS') {
    fetchListingTags(message.listingId)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, reason: 'network-error', message: String(error) }));
    return true; // keep the message channel open for the async sendResponse
  }

  if (message.type === 'ESCOUT_FETCH_SHOP_OVERVIEW') {
    fetchShopOverview(message.listingId)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, reason: 'network-error', message: String(error) }));
    return true;
  }

  return false;
});
