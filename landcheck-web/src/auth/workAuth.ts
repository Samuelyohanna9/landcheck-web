export const WORK_AUTH_STORAGE_KEY = "landcheck_work_auth";

const DEFAULT_WORK_USERNAME = "admin";
const DEFAULT_WORK_PASSWORD = "landcheckwork";

export const getWorkCredentials = () => {
  const username = String(import.meta.env.VITE_WORK_USERNAME || DEFAULT_WORK_USERNAME).trim();
  const password = String(import.meta.env.VITE_WORK_PASSWORD || DEFAULT_WORK_PASSWORD).trim();
  return { username, password };
};

export const validateWorkLogin = (username: string, password: string) => {
  const expected = getWorkCredentials();
  return username.trim() === expected.username && password === expected.password;
};

export const isWorkAuthed = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WORK_AUTH_STORAGE_KEY) === "1";
};

export const setWorkAuthed = () => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORK_AUTH_STORAGE_KEY, "1");
};

export const clearWorkAuthed = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
};
