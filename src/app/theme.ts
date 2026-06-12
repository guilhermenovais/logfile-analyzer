/**
 * Applies the OS light/dark theme preference by toggling the `dark` class on
 * the root element (consumed by the `@custom-variant dark` rule in
 * `src/App.css`), and keeps it in sync with OS changes.
 */
export function initTheme(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const applyTheme = (isDark: boolean) => {
    document.documentElement.classList.toggle("dark", isDark);
  };

  applyTheme(media.matches);

  const listener = (event: MediaQueryListEvent) => applyTheme(event.matches);
  media.addEventListener("change", listener);

  return () => media.removeEventListener("change", listener);
}
