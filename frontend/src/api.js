const TOKEN_KEY = "silkreel_token";
const ROLE_KEY = "silkreel_role";

export function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(value) {
  localStorage.setItem(TOKEN_KEY, value);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function role() {
  return localStorage.getItem(ROLE_KEY) || "";
}

export function setRole(value) {
  localStorage.setItem(ROLE_KEY, value);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "请求失败");
  }
  return data;
}
