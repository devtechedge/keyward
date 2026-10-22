/**
 * Apply the stored theme before first paint so the page never flashes the wrong
 * colours. Runs before React, so it must stay inline and dependency free.
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
