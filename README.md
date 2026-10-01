# Escout

A focused Chrome extension (Manifest V3) for Etsy competitor research. It adds a
persistent, dark toolbar to Etsy search-result pages that finds every listing
whose **title contains an exact keyword/phrase**, and copies the search page's
link plus all of their titles, descriptions and tags in one go with
**COPY META DATA**, or all their featured images with a separate button. A
separate, optional **Shop Info** toggle overlays live shop stats (owner name,
age, total sales, listing count, favorites, views) on each card — independent
of the matching/copy workflow above.

## File structure

```
escout/
├── manifest.json
├── background.js                       (service worker: Etsy Open API v3 calls for TAGS)
├── popup.html / popup.css / popup.js   (informational popup + link to Options)
├── options.html / options.css / options.js  (where you enter your own Etsy API key)
├── styles.css                          (toolbar styles)
├── icons/                              (16/48/128 px icons)
└── content/
    ├── dom-utils.js       shared helpers (normalize text, debounce, element builder)
    ├── matcher.js          exact keyword/phrase matching
    ├── etsy-detector.js     finds listing cards on the search page, extracts title/image
    ├── extractors.js       fetches individual listing pages for descriptions + Open API tags
    ├── clipboard.js        text + image clipboard writing (image collage compositing)
    ├── shop-info.js        optional per-card Shop Info overlay (age/sales/listings/favorites/views)
    ├── toolbar-ui.js       builds/updates the toolbar DOM
    └── main.js             orchestrator: wires UI to scanning/matching/actions
```

Content scripts are loaded in this order directly by `manifest.json` (no
bundler needed) and share one `window.Escout` namespace, so each file
stays small and single-purpose.

## How it works

1. Open an Etsy search results page. The toolbar appears fixed at the top.
2. Type the exact target keyword/phrase into **KEYWORD**.
3. Escout scans the currently rendered listing cards and shows
   **FOUND X** — the count of listings whose title contains that exact
   phrase (case-insensitive, whitespace-normalized; **not** fuzzy or
   semantic matching).
4. Click **COPY META DATA** to copy, in one clipboard write: the current
   search page's link, then every matching listing's title, then every
   description, then every tag line — every match found is processed, no
   partial selection — each section separated by a blank line (no
   "TITLES:"/"TAGS:" labels are added — the page link is the one exception,
   since it's a single reference to where the research came from, not a
   per-competitor label). Titles come instantly from the scan; descriptions
   and tags are fetched together in one pass per listing. Click
   **FEATURED IMAGES** separately to copy a collage of their photos (see
   below — images use their own clipboard mechanism and can't be combined
   into the same text copy). The button shows the real counts copied (e.g.
   `COPIED 10 titles, 8/10 desc, 10 tags ✓`) briefly, or an error message if
   something failed.
5. Use the small `⟳` button next to FOUND to rescan after Etsy loads more
   listings (e.g. after you scroll).

Only the current search results page is scanned — Escout does not
auto-paginate or navigate across pages.

## SHOP INFO — optional live shop stats overlay

A separate toggle button, off by default, completely independent from the
keyword-matching/copy workflow above:

1. Click **SHOP INFO** in the toolbar.
2. As cards scroll into view, a small badge appears on each one showing:
   - the shop owner's display name, on its own line, if the seller has chosen to show one (see below)
   - the shop's age as a relative duration (e.g. `2 months`, `1 year 6 months`)
   - the shop's total lifetime sales (exact count)
   - the shop's number of active listings
   - this listing's favorites (♥) and views (👁)
3. Click **SHOP INFO** again to turn it off and remove all badges.

Every numeric field is a **live, exact value from Etsy's own Open API v3**
(`GetListing` and `GetShop`) — nothing estimated, nothing scraped from a
third-party database. The one thing intentionally **not** shown is a sales
*trend* (e.g. "+12 this week") — Etsy's API has no historical/time-series
endpoint, so there is no way to show that without fabricating it or standing
up an external tracking database, both of which are out of scope for this
extension.

**Shop owner name** is the one field that isn't from the API — Etsy's API
has no endpoint for it. It's read from the shop's own public page, from an
optional "Shop members" section sellers can fill in (name + role, e.g.
"Darren — Owner"). Not every shop has filled this in; when it hasn't, the
name is simply omitted from the badge rather than guessed. It also arrives
a moment after the rest of the badge, since it needs its own extra page
fetch beyond the two API calls.

Badges only fetch data for cards as they actually scroll into view (via
`IntersectionObserver`), and every request goes through the same
rate-limit-safe queue in `background.js` used by TAGS, so turning this on
for a long results page can't burst past Etsy's API rate limit — it just
fills in progressively as you scroll.

## Tags — how it works under the hood

Etsy no longer publishes tags anywhere on a listing's public page (verified
directly: no `<meta name="keywords">`, nothing in the hydrated page state,
nothing in Etsy's own client-side network calls). The only legitimate way to
read a listing's real tags is Etsy's own **official Open API v3** — a
sanctioned public API, not a bypass.

Tags (part of **COPY META DATA**) and the optional **Shop Info** overlay need
your own free Etsy API key — see **Setup** below. Everything else in Escout
(matching, titles, descriptions, featured images) works without one.

Two details worth knowing:
- Etsy recently changed its auth requirement: the `x-api-key` header must be
  `<keystring>:<shared secret>`, not the keystring alone (a keystring-only
  header now returns a 403 with `"Shared secret is required in x-api-key
  header."`). `background.js` sends the combined form.
- The call happens in the background service worker rather than the content
  script specifically because a service worker's `fetch()` to a host listed
  in `host_permissions` is exempt from page-level CORS — that's the reliable
  place to call a cross-origin API like `openapi.etsy.com`.
- A personal Etsy API app is rate-limited (5 requests/second, 5,000/day),
  which comfortably covers normal use of this extension.

## Setup (Etsy API key — needed for Tags + Shop Info)

Escout does not ship with any API credentials. Each user generates their own
free key and enters it on the extension's Options page:

1. Go to <https://www.etsy.com/developers/register> and sign in with your
   Etsy account.
2. Create a new app — choose **Personal Access**, not commercial. No business
   details required, takes under a minute.
3. Copy the **Keystring** shown for your new app, then click
   **Show shared secret** and copy that too.
4. In Chrome, open `chrome://extensions`, find Escout, click **Details** →
   **Extension options** (or click the link in the popup).
5. Paste both values in and click **Save**. They're stored locally via
   `chrome.storage.sync` — never sent anywhere except directly to Etsy's API.

A personal Etsy API app is capped at 5 requests/second and 5,000/day, which
comfortably covers normal use of this extension. Matching, titles,
descriptions and featured images all work without a key — only Tags and
Shop Info need one.

## Testing in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this project folder (`Escout`)
5. Open an Etsy search results page, e.g. `https://www.etsy.com/search?q=birthday+invitation`
6. Enter a keyword in the toolbar and confirm the **FOUND** count updates
7. Click **COPY META DATA** and paste (Ctrl+V) into a text editor — confirm the
   search page's URL comes first, then titles (one per line), then descriptions
   (separated by blank lines), then tag lines (one comma-separated line per
   listing), each section separated by a blank line
8. Click **FEATURED IMAGES** and paste (Ctrl+V) into an app that accepts pasted images
   (e.g. an image editor, Word, or a chat app) — expect one collage image containing
   every matching listing's featured image at its real size
9. Click **SHOP INFO** and scroll — confirm badges appear on cards showing owner name
   (when available), shop age, total sales, listing count, favorites and views; click
   it again to confirm all badges disappear

## Known limitations (verified directly against live Etsy pages)

- **Tags** come from Etsy's official Open API v3 (see above) since Etsy
  stopped publishing them on the public listing page entirely. Works
  out of the box — no configuration needed.
- **Descriptions**: pulled from the listing page's JSON-LD structured data
  first (this succeeded on every listing tested), falling back to a visible
  description container, then to the page's meta description as a last
  resort, with one automatic retry if a fetch fails. If fewer descriptions
  (or tags) come back than listings selected, **COPY META DATA**'s success
  message shows the real counts per section, e.g. `COPIED 10 titles, 8/10
  desc, 10 tags ✓`, instead of silently under-delivering.
- **Fetching descriptions requires opening each listing's public page** (via
  `fetch`, same as normal browsing — no login bypass, no CAPTCHA bypass),
  done sequentially with a short pause between requests to stay lightweight
  and avoid hammering Etsy. Tags, going through Etsy's API instead, fetch
  faster; **COPY META DATA** runs both passes together, not one after the
  other, so it isn't simply the sum of the old TAGS + DESCRIPTIONS times.
- **Featured Images / multi-image clipboard**: the Windows/Chrome clipboard
  is built around holding a single image at a time, so "N separate images in
  one paste" isn't something the OS clipboard supports. Instead, Escout
  combines every matching listing's featured image into **one collage PNG**
  and copies that single image — each image is placed at its own real,
  native pixel dimensions (no cropping, no forced uniform square), packed
  left-to-right and wrapped into rows. Pasting (Ctrl+V) gives you all N
  featured images at once, in their real proportions, in one picture. The
  button shows `COPIED N (COMBINED) ✓`. Images are never downloaded as files
  — only composed on a canvas and copied to the clipboard. The images used
  are the same ones shown on the search results page (not the full-resolution
  listing-page image).
- **Accuracy / no stale results**: every copy action re-scans the page and
  re-verifies each listing's title against the exact keyword immediately
  before copying (not just once when you first typed the keyword), so a
  button can never copy a title/listing that doesn't actually contain your
  keyword, and won't silently copy fewer just because of a stale earlier
  scan.
- Etsy's DOM/class names change periodically. Listing detection is built
  around the one stable structural fact (`a[href*="/listing/"]`) rather than
  specific CSS classes, so it should keep working across most redesigns.
  Title/image extraction is scoped to each listing's own link first (falling
  back to the shared card container only if needed), which avoids ever
  picking up a neighboring card's title or image.
- **Shop Info has no sales trend** — only a live snapshot (see above). Every
  new shop shown costs 2 API calls the first time (listing lookup, then shop
  lookup), cached per shop for the rest of the session; a long results page
  fills in progressively as you scroll rather than all at once, to respect
  Etsy's 5 requests/second cap.
- **Shop owner name isn't always available** — it depends on the seller
  having filled in their shop's "Shop members" section publicly. When
  absent, that line of the badge is simply left out.

## Privacy / scope

Everything runs locally in the browser. No data is sent to any server other
than Etsy itself — either `www.etsy.com` (public listing pages) or
`openapi.etsy.com` (Etsy's official API, using the API key you enter yourself
on the Options page). No accounts, analytics, databases, AI, or third-party
services are used. Your API key is stored only in your own browser via
`chrome.storage.sync` and is never bundled into this repo or sent anywhere
except directly to Etsy.
