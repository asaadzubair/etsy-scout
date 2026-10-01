// Escout — shared DOM / text helpers used by every other module.
(function (Escout) {
  // Collapse whitespace/case so titles can be compared reliably without
  // turning this into fuzzy/semantic matching (still an EXACT phrase check).
  function normalize(text) {
    return (text || '')
      .replace(/ /g, ' ') // non-breaking spaces Etsy sometimes injects
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function debounce(fn, waitMs) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  // Tiny element builder to keep toolbar-ui.js readable without a template engine.
  function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.class) node.className = opts.class;
    if (opts.text) node.textContent = opts.text;
    if (opts.attrs) {
      Object.entries(opts.attrs).forEach(([key, value]) => node.setAttribute(key, value));
    }
    children.forEach((child) => node.appendChild(child));
    return node;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  Escout.utils = { normalize, debounce, el, sleep };
})(window.Escout = window.Escout || {});
