/**
 * Applies the stored theme before first paint.
 *
 * Kept as a separate file rather than an inline script so the CSP stays simple
 * and the file can be cached.
 */
(function () {
  try {
    var stored = window.localStorage.getItem("keyward-theme");
    var prefersLight =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    var theme = stored || (prefersLight ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "dark";
  }
})();
