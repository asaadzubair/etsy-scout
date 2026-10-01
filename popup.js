// Escout popup is informational only — all real functionality lives in
// the in-page toolbar injected by content/main.js on Etsy search pages.
// Etsy API credentials (needed for Tags + Shop Info) are configured on the
// Options page, opened via the link below.

document.getElementById('open-options').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
