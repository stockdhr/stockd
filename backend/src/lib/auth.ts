import { sha256 } from "./crypto";
import { HttpError } from "./http";
import { subscriptionState } from "./dates";

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: "admin" | "user";
  account_status: "active" | "disabled";
  subscription_expires_at: string | null;
  must_change_password: number;
};

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function requireAuth(request: Request, env: Env): Promise<AuthUser> {
  const token = cookieValue(request, "stockd_session");
  if (!token) throw new HttpError(401, "Prijavite se za nastavak.");
  const tokenHash = await sha256(token);
  const user = await env.DB.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.role, u.account_status,
           u.subscription_expires_at, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first<AuthUser>();
  if (!user) throw new HttpError(401, "Sesija je istekla. Prijavite se ponovno.");
  return user;
}

export function requireAdmin(user: AuthUser): void {
  if (user.role !== "admin") throw new HttpError(403, "Nemate dopuštenje za ovu radnju.");
}

export function requireActiveSubscription(user: AuthUser): void {
  const state = subscriptionState(user);
  if (state === "expired" || state === "disabled") {
    throw new HttpError(402, state === "disabled" ? "Račun je onemogućen." : "Članarina je istekla.");
  }
}

export function sessionCookie(token: string, maxAge = 60 * 60 * 24 * 30): string {
  return `stockd_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return "stockd_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0";
}
