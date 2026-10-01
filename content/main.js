// Escout — orchestrator: wires the toolbar UI to scanning, matching,
// selection, and the two clipboard actions (COPY META DATA and FEATURED IMAGES).
(function (Escout) {
  const { debounce } = Escout.utils;
  const { getListingCards } = Escout.detector;
  const { titleMatchesKeyword } = Escout.matcher;
  const { getDetailsForListings } = Escout.extractors;
  const { copyText, copyImages } = Escout.clipboard;
  const { buildToolbar, setFoundCount, setButtonState, setShopInfoToggle } = Escout.ui;
  const { shopInfo } = Escout;

  const BUTTON_LABELS = {
    copyAll: 'COPY META DATA',
    images: 'FEATURED IMAGES',
  };

  const state = {
    keyword: '',
    matches: [], // exact-match listings found on the current page
  };

  function isSearchResultsPage() {
    return getListingCards().length > 0;
  }

  // Re-scans the currently rendered listing cards against the current
  // keyword. Reads the input value itself (rather than relying on a value
  // set elsewhere) so it is always authoritative, and is called both on
  // keyword change / explicit rescan AND synchronously right before every
  // copy action — never on a timer/scroll loop.
  function rescan(refs) {
    state.keyword = refs.keywordInput.value.trim();
    const cards = getListingCards();
    state.matches = state.keyword ? cards.filter((c) => titleMatchesKeyword(c.title, state.keyword)) : [];
    setFoundCount(refs, state.matches.length);
    shopInfo.rescan(); // no-op unless the Shop Info toggle is on
  }

  function getSelectedListings(refs) {
    // Always scan fresh right before selecting, so an action can never run
    // against a stale match list (e.g. if the page re-rendered, or the
    // keyword was typed and a button clicked in quick succession).
    rescan(refs);

    if (!state.matches.length) return [];

    // Final safety check: only ever hand back listings whose title still
    // contains the exact keyword right now. Every matching listing is
    // processed — no partial-share selection.
    return state.matches.filter((listing) => titleMatchesKeyword(listing.title, state.keyword));
  }

  // Copies the current search page's link, then titles, then descriptions,
  // then tags for the selected competitors, in one action — titles come
  // straight from the scan (no fetch needed); descriptions and tags are
  // fetched together in a single pass per listing (one page fetch + one
  // Etsy API call each, not two separate passes), then everything is
  // combined into one clipboard write. Sections are separated by a blank
  // line only — no "TITLES:"/"TAGS:" labels are added, consistent with the
  // rest of Escout's copy output (the page link is the one exception, since
  // it's a single reference to where this research came from, not a
  // per-competitor label).
  async function handleCopyAll(refs) {
    const selected = getSelectedListings(refs);
    if (!selected.length) {
      setButtonState(refs.copyAllBtn, { type: 'error', text: 'ENTER A KEYWORD' }, BUTTON_LABELS.copyAll);
      return;
    }

    setButtonState(refs.copyAllBtn, { type: 'busy', text: 'FETCHING…' }, BUTTON_LABELS.copyAll);
    try {
      const details = await getDetailsForListings(selected, { needsTags: true, needsDescription: true }, (done, total) =>
        setButtonState(refs.copyAllBtn, { type: 'busy', text: `FETCHING ${done}/${total}` }, BUTTON_LABELS.copyAll)
      );

      const titles = selected.map((listing) => listing.title);
      const descriptions = details.map((d) => d.description).filter(Boolean);
      const tagLines = details.map((d) => (d.tags || []).join(', ')).filter((line) => line.length);

      const sections = [window.location.href];
      if (titles.length) sections.push(titles.join('\n'));
      if (descriptions.length) sections.push(descriptions.join('\n\n'));
      if (tagLines.length) sections.push(tagLines.join('\n'));

      await copyText(sections.join('\n\n'));

      const parts = [`${titles.length} titles`];
      parts.push(descriptions.length < selected.length ? `${descriptions.length}/${selected.length} desc` : `${descriptions.length} desc`);
      parts.push(tagLines.length < selected.length ? `${tagLines.length}/${selected.length} tags` : `${tagLines.length} tags`);
      setButtonState(refs.copyAllBtn, { type: 'success', text: `COPIED ${parts.join(', ')} ✓` }, BUTTON_LABELS.copyAll);
    } catch (e) {
      setButtonState(refs.copyAllBtn, { type: 'error' }, BUTTON_LABELS.copyAll);
    }
  }

  async function handleImages(refs) {
    const selected = getSelectedListings(refs);
    if (!selected.length) {
      setButtonState(refs.imagesBtn, { type: 'error', text: 'ENTER A KEYWORD' }, BUTTON_LABELS.images);
      return;
    }
    const urls = selected.map((listing) => listing.imageUrl).filter(Boolean);
    if (!urls.length) {
      setButtonState(refs.imagesBtn, { type: 'error', text: 'NO IMAGES FOUND' }, BUTTON_LABELS.images);
      return;
    }
    setButtonState(refs.imagesBtn, { type: 'busy', text: 'COPYING…' }, BUTTON_LABELS.images);
    try {
      const result = await copyImages(urls);
      if (result.loaded < urls.length) {
        setButtonState(refs.imagesBtn, { type: 'success', text: `COPIED ${result.loaded}/${urls.length} ✓` }, BUTTON_LABELS.images);
      } else if (result.combined) {
        setButtonState(refs.imagesBtn, { type: 'success', text: `COPIED ${result.loaded} (COMBINED) ✓` }, BUTTON_LABELS.images);
      } else {
        setButtonState(refs.imagesBtn, { type: 'success' }, BUTTON_LABELS.images);
      }
    } catch (e) {
      setButtonState(refs.imagesBtn, { type: 'error' }, BUTTON_LABELS.images);
    }
  }

  function attachEvents(refs) {
    const debouncedScan = debounce(() => rescan(refs), 400);

    refs.keywordInput.addEventListener('input', debouncedScan);
    refs.rescanBtn.addEventListener('click', () => rescan(refs));

    refs.copyAllBtn.addEventListener('click', () => handleCopyAll(refs));
    refs.imagesBtn.addEventListener('click', () => handleImages(refs));

    refs.shopInfoToggle.addEventListener('click', () => {
      const nextEnabled = !shopInfo.isEnabled();
      shopInfo.toggle(nextEnabled);
      setShopInfoToggle(refs, nextEnabled);
    });
  }

  function injectToolbar() {
    if (document.getElementById('escout-toolbar')) return null;
    const refs = buildToolbar();
    document.documentElement.appendChild(refs.root);
    document.body.classList.add('escout-active');
    attachEvents(refs);
    return refs;
  }

  function removeToolbar() {
    const existing = document.getElementById('escout-toolbar');
    if (existing) existing.remove();
    document.body.classList.remove('escout-active');
    shopInfo.toggle(false);
  }

  // Etsy is a client-rendered SPA: search pages load/replace listings
  // without a full page navigation. A debounced MutationObserver lets the
  // toolbar appear/disappear as the user moves between search and non-
  // search pages, without scanning continuously.
  function init() {
    let refs = null;

    const evaluate = debounce(() => {
      if (isSearchResultsPage()) {
        if (!refs) refs = injectToolbar();
        shopInfo.rescan(); // picks up newly-loaded cards; no-op if the toggle is off
      } else if (refs) {
        removeToolbar();
        refs = null;
      }
    }, 500);

    evaluate();
    new MutationObserver(evaluate).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.Escout = window.Escout || {});
