export type ThemePreference = "dark" | "light";

const THEME_STORAGE_KEY = "tna-nexus.theme";

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "dark";
  }

  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

export function applyThemePreference(theme: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
}

export function persistThemePreference(theme: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyThemePreference(theme);
}
