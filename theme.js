// Apply before CSS is loaded so a saved dark preference does not flash light.
(() => {
  const key = "orgfinan-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = null;
  try { preference = localStorage.getItem(key); } catch {}
  const valid = (value) => value === "light" || value === "dark";
  if (!valid(preference)) preference = null;

  function apply() {
    const theme = preference || (system.matches ? "dark" : "light");
    const changed = document.documentElement.dataset.theme !== theme;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#11171e" : "#f3f5f7";
    const button = document.querySelector("#themeToggle");
    if (button) {
      const label = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
    if (changed) window.dispatchEvent(new CustomEvent("orgfinan:themechange", { detail: { theme } }));
  }

  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector("#themeToggle")?.addEventListener("click", () => {
      preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
  system.addEventListener("change", () => { if (!preference) apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply();
  });
})();
