import { HttpError, json } from "./lib/http";
import { changePassword, login, logout, me, setup } from "./routes/auth";
import { adminDashboard, createUser, listUsers, renewUser, toggleUser } from "./routes/admin";
import { createInventory, createProduct, createSale, customers, dashboard, expenses, globalSearch, listInventory, listProducts, listSales, undoSale, updateInventory } from "./routes/app";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return { "Vary": "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-Setup-Secret",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function isMutation(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const key = `${request.method} ${path}`;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path.startsWith("/api/") && isMutation(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== env.ALLOWED_ORIGIN) throw new HttpError(403, "Zahtjev nije dopušten.");
  }

  switch (key) {
    case "GET /": return json({ name: "Stockd API", status: "ok" });
    case "GET /api/health": return json({ status: "ok", timestamp: new Date().toISOString() });
    case "POST /api/setup": return setup(request, env);
    case "POST /api/auth/login": return login(request, env);
    case "POST /api/auth/logout": return logout(request, env);
    case "GET /api/auth/me": return me(request, env);
    case "POST /api/auth/change-password": return changePassword(request, env);
    case "GET /api/admin/dashboard": return adminDashboard(request, env);
    case "GET /api/admin/users": return listUsers(request, env);
    case "POST /api/admin/users": return createUser(request, env);
    case "GET /api/dashboard": return dashboard(request, env);
    case "GET /api/products": return listProducts(request, env);
    case "POST /api/products": return createProduct(request, env);
    case "GET /api/inventory": return listInventory(request, env);
    case "POST /api/inventory": return createInventory(request, env);
    case "GET /api/sales": return listSales(request, env);
    case "POST /api/sales": return createSale(request, env);
    case "GET /api/customers":
    case "POST /api/customers": return customers(request, env);
    case "GET /api/expenses":
    case "POST /api/expenses": return expenses(request, env);
    case "GET /api/search": return globalSearch(request, env);
  }

  const renewMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/renew$/);
  if (request.method === "POST" && renewMatch?.[1]) return renewUser(request, env, renewMatch[1]);
  const toggleMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (request.method === "PATCH" && toggleMatch?.[1]) return toggleUser(request, env, toggleMatch[1]);
  const undoMatch = path.match(/^\/api\/sales\/([^/]+)\/undo$/);
  if (request.method === "POST" && undoMatch?.[1]) return undoSale(request, env, undoMatch[1]);
  const inventoryMatch = path.match(/^\/api\/inventory\/([^/]+)$/);
  if (request.method === "PATCH" && inventoryMatch?.[1]) return updateInventory(request, env, inventoryMatch[1]);
  throw new HttpError(404, "Stranica nije pronađena.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...cors })) headers.set(name, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "Došlo je do greške. Pokušajte ponovno.";
      if (!(error instanceof HttpError)) {
        console.error(JSON.stringify({ message: "unhandled_error", error: error instanceof Error ? error.message : String(error), path: new URL(request.url).pathname }));
      }
      const response = json({ error: message }, status);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...cors })) headers.set(name, value);
      return new Response(response.body, { status, headers });
    }
  },
} satisfies ExportedHandler<Env>;
