import { browser } from "$app/environment";

type DashboardTheme = "light" | "dark";

function initialTheme(): DashboardTheme {
  if (!browser) return "light";

  const saved = localStorage.getItem("appaloft.dashboard.theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let theme = $state<DashboardTheme>(initialTheme());

function applyTheme(): void {
  if (!browser) return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.consolePreset = "dashboard-v2";
}

if (browser) applyTheme();

export const dashboardTheme = {
  get value(): DashboardTheme {
    return theme;
  },
  toggle(): void {
    theme = theme === "light" ? "dark" : "light";
    if (browser) localStorage.setItem("appaloft.dashboard.theme", theme);
    applyTheme();
  },
};
