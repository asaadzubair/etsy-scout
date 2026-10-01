// Escout — locates listing cards on the current Etsy search results page.
//
// Etsy's markup/CSS classes change over time, so this deliberately avoids
// relying on brittle class names as the primary signal. Every listing card
// on a search page links to /listing/<id>/..., which is the one stable
// structural fact we lean on. Class-based selectors are only used as
// secondary fallbacks for pulling the title text out of a card.
(function (Escout) {
  function bestImageUrl(imgEl) {
    if (!imgEl) return null;

    // Prefer the highest-resolution candidate from srcset when present.
    if (imgEl.srcset) {
      const candidates = imgEl.srcset
        .split(',')
        .map((entry) => entry.trim().split(/\s+/))
        .filter((parts) => parts[0]);
      candidates.sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0));
      if (candidates.length) return candidates[0][0];
    }

    return imgEl.currentSrc || imgEl.src || imgEl.getAttribute('data-src') || null;
  }

  // Title/image are looked up on the SPECIFIC anchor first, and only fall
  // back to the shared container if the anchor itself has nothing usable.
  // This avoids ever attributing a neighboring card's title/image to the
  // wrong listing id in layouts where several links share one container.
  function extractTitle(container, anchor) {
    const anchorImg = anchor.querySelector('img[alt]');
    if (anchorImg && anchorImg.alt && anchorImg.alt.trim().length > 3) return anchorImg.alt.trim();

    // Etsy consistently puts the full listing title in the card image's
    // alt text, even when the visible heading text is truncated.
    const containerImg = container.querySelector('img[alt]');
    if (containerImg && containerImg.alt && containerImg.alt.trim().length > 3) return containerImg.alt.trim();

    const heading = container.querySelector('h3, h2');
    if (heading && heading.textContent.trim()) return heading.textContent.trim();

    if (anchor.title && anchor.title.trim()) return anchor.title.trim();

    return anchor.textContent.trim();
  }

  function extractImageUrl(container, anchor) {
    return bestImageUrl(anchor.querySelector('img')) || bestImageUrl(container.querySelector('img'));
  }

  // The tight wrapper around just the photo (not the title/price/buttons
  // below it) — this is what an overlay badge should be positioned inside,
  // so it sits over the bottom of the image rather than the whole card.
  // Etsy typically wraps the image in its own anchor; fall back to the
  // image's direct parent, then the full card, if that anchor has no image.
  function findImageContainer(container, anchor) {
    if (anchor.querySelector('img')) return anchor;
    const containerImg = container.querySelector('img');
    if (containerImg && containerImg.parentElement) return containerImg.parentElement;
    return container;
  }

  // Returns [{ id, url, title, imageUrl, container, imageContainer }] for
  // every unique listing card currently rendered on the page (dedupes
  // repeated links within one card). `container` is the card's own DOM
  // element (title/price/buttons and all); `imageContainer` is just the
  // photo wrapper. Both are used by the optional Shop Info overlay to
  // anchor a badge in the right place; core matching/copy features only
  // use the plain data fields.
  function getListingCards() {
    const seen = new Set();
    const cards = [];

    document.querySelectorAll('a[href*="/listing/"]').forEach((anchor) => {
      const match = anchor.href.match(/\/listing\/(\d+)/);
      if (!match) return;

      const id = match[1];
      if (seen.has(id)) return;

      const container =
        anchor.closest('li, div[data-listing-id], .v2-listing-card, .wt-list-unstyled-list__item') ||
        anchor.parentElement;
      if (!container) return;

      seen.add(id);
      cards.push({
        id,
        url: anchor.href.split('?')[0],
        title: extractTitle(container, anchor),
        imageUrl: extractImageUrl(container, anchor),
        container,
        imageContainer: findImageContainer(container, anchor),
      });
    });

    return cards;
  }

  Escout.detector = { getListingCards };
})(window.Escout = window.Escout || {});
