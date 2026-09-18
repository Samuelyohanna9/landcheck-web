export type WorkspaceTheme = "dark" | "light";

export const WORKSPACE_THEME_STORAGE_KEY = "landcheck_workspace_theme";
const WORKSPACE_THEME_EVENT = "landcheck-workspace-theme-change";

const themeColorFor = (theme: WorkspaceTheme) => theme === "light" ? "#F8FAFC" : "#0F172A";

const applyThemeColor = (theme: WorkspaceTheme) => {
  if (typeof document === "undefined") return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColorFor(theme));
};

export const getWorkspaceTheme = (): WorkspaceTheme => {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
};

export const applyWorkspaceTheme = (theme: WorkspaceTheme) => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.workspaceTheme = theme;
    applyThemeColor(theme);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKSPACE_THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent<WorkspaceTheme>(WORKSPACE_THEME_EVENT, { detail: theme }));
  }
};

export const subscribeWorkspaceTheme = (listener: (theme: WorkspaceTheme) => void) => {
  if (typeof window === "undefined") return () => undefined;
  const handleChange = (event: Event) => {
    const theme = (event as CustomEvent<WorkspaceTheme>).detail;
    if (theme === "dark" || theme === "light") listener(theme);
  };
  window.addEventListener(WORKSPACE_THEME_EVENT, handleChange);
  return () => window.removeEventListener(WORKSPACE_THEME_EVENT, handleChange);
};
