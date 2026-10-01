// Escout — exact keyword/phrase matching against listing titles.
//
// IMPORTANT: this is intentionally a plain, case-insensitive substring check
// of the normalized title against the normalized keyword. No fuzzy matching,
// no semantic/"relevant" matching, no keyword variations.
(function (Escout) {
  const { normalize } = Escout.utils;

  function titleMatchesKeyword(title, keyword) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) return false;
    const normalizedTitle = normalize(title);
    return normalizedTitle.includes(normalizedKeyword);
  }

  Escout.matcher = { titleMatchesKeyword };
})(window.Escout = window.Escout || {});
