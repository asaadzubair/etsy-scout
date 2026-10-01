// Escout — pulls tags/descriptions from individual listing pages, and (for
// the optional Shop Info overlay) the shop owner's public display name.
//
// Tags/descriptions/owner name are not present in search-result cards, so
// for those we fetch the relevant public page (normal, unauthenticated
// navigation — no bypassing of login/CAPTCHA/anti-bot systems) and parse
// the response with DOMParser. Nothing is sent anywhere except to etsy.com,
// and nothing is fabricated: if a field can't be found on the public page,
// it's simply left out.
(function (Escout) {
  const { sleep } = Escout.utils;

  const pageCache = new Map(); // url -> parsed Document, avoids re-fetching per click (works for listing AND shop pages)

  async function fetchPageDocument(url) {
    if (pageCache.has(url)) return pageCache.get(url);

    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load page: ' + response.status);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    pageCache.set(url, doc);
    return doc;
  }

  function extractDescriptionFromDoc(doc) {
    // Primary source: Etsy's own JSON-LD structured data (Product schema).
    const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item && typeof item.description === 'string' && item.description.trim()) {
            return item.description.trim();
          }
        }
      } catch (e) {
        // Malformed/unexpected JSON-LD on this page — try the next script or fallback.
      }
    }

    // Fallback: the visible description panel on the listing page.
    const descEl = doc.querySelector(
      '[data-product-details-description-text-content], .wt-content-toggle__body-container, [data-id="description-text"]'
    );
    if (descEl && descEl.textContent.trim()) return descEl.textContent.trim();

    // Last resort: the page's meta description (shorter, but publicly present).
    const meta = doc.querySelector('meta[name="description"]');
    if (meta && meta.content && meta.content.trim()) return meta.content.trim();

    return null;
  }

  // Etsy no longer publishes tags anywhere on the public listing page
  // (verified directly against live listing HTML, hydrated client-side
  // state, and its own XHR calls). Real tags come from Etsy's own official
  // Open API v3 instead, via the background service worker (background.js
  // holds this extension's Etsy API credentials — see there for details).
  function getTagsViaOpenApi(listingId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'ESCOUT_FETCH_TAGS', listingId }, (response) => {
          resolve(response || { ok: false, reason: 'no-response' });
        });
      } catch (e) {
        resolve({ ok: false, reason: 'messaging-error' });
      }
    });
  }

  async function getListingDetails(listing, { needsTags, needsDescription }, attempt = 0) {
    try {
      let tags = [];
      let tagsUnavailableReason = null;

      if (needsTags) {
        const apiResult = await getTagsViaOpenApi(listing.id);
        if (apiResult.ok) {
          tags = apiResult.tags;
        } else {
          tagsUnavailableReason = apiResult.reason || 'api-error';
        }
      }

      const description = needsDescription ? extractDescriptionFromDoc(await fetchPageDocument(listing.url)) : null;

      return { tags, tagsUnavailableReason, description };
    } catch (e) {
      // One retry for transient network hiccups before giving up on this listing.
      if (attempt < 1) {
        await sleep(400);
        return getListingDetails(listing, { needsTags, needsDescription }, attempt + 1);
      }
      return { tags: [], description: null, error: true };
    }
  }

  // Sequential (not parallel) fetching, with a short pause between requests,
  // to keep this lightweight and avoid hammering Etsy's servers.
  async function getDetailsForListings(listings, opts, onProgress) {
    const results = [];
    for (let i = 0; i < listings.length; i++) {
      results.push(await getListingDetails(listings[i], opts));
      if (onProgress) onProgress(i + 1, listings.length);
      if (i < listings.length - 1) await sleep(opts.needsTags ? 100 : 250);
    }
    return results;
  }

  // Shop owner's display name — not part of Etsy's Open API v3, but shown
  // publicly on a shop's page under "Shop members" when the seller has
  // chosen to fill that in (not every shop does). Only ever returns a name
  // that's actually present on the public page; returns null otherwise —
  // never guessed/fabricated.
  function extractOwnerNameFromDoc(doc) {
    const roleEls = Array.from(doc.querySelectorAll('.sb-about-member-role'));
    for (const roleEl of roleEls) {
      if (roleEl.textContent.trim().toLowerCase() !== 'owner') continue;
      const card = roleEl.closest('div') || roleEl.parentElement;
      const nameEl = card ? card.querySelector('h6') : null;
      if (nameEl && nameEl.textContent.trim()) return nameEl.textContent.trim();
    }
    return null;
  }

  async function getShopOwnerName(shopUrl) {
    if (!shopUrl) return null;
    try {
      return extractOwnerNameFromDoc(await fetchPageDocument(shopUrl));
    } catch (e) {
      return null;
    }
  }

  Escout.extractors = { getDetailsForListings, fetchPageDocument, getShopOwnerName };
})(window.Escout = window.Escout || {});
