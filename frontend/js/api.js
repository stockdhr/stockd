const configured = window.STOCKD_CONFIG ?? {};
export const apiBaseUrl = String(configured.apiBaseUrl ?? (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "http://localhost:8787" : "https://stockd-api.stockd.workers.dev")).replace(/\/$/, "");
export const demoMode = configured.demoMode ?? ["localhost", "127.0.0.1", ""].includes(location.hostname);

export async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Došlo je do greške. Pokušajte ponovno.");
    error.status = response.status;
    throw error;
  }
  return data;
}
