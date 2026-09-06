import { addCalendarMonths, subscriptionState } from "../lib/dates";
import { clearSessionCookie, requireAuth, sessionCookie } from "../lib/auth";
import { createOpaqueToken, hashPassword, sha256, verifyPassword } from "../lib/crypto";
import { HttpError, json, readJson, textField } from "../lib/http";
import { timingSafeEqual } from "node:crypto";

function publicUser(user: Awaited<ReturnType<typeof requireAuth>>) {
  return { ...user, subscription_status: subscriptionState(user) };
}

export async function setup(request: Request, env: Env): Promise<Response> {
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) throw new HttpError(404, "Stranica nije pronađena.");
  const provided = request.headers.get("x-setup-secret") ?? "";
  if (!env.SETUP_SECRET || !provided) throw new HttpError(403, "Setup nije dopušten.");
  const [providedHash, expectedHash] = await Promise.all([sha256(provided), sha256(env.SETUP_SECRET)]);
  const a = Uint8Array.from(atob(providedHash), (c) => c.charCodeAt(0));
  const b = Uint8Array.from(atob(expectedHash), (c) => c.charCodeAt(0));
  if (!timingSafeEqual(a, b)) throw new HttpError(403, "Setup nije dopušten.");

  const body = await readJson(request);
  const name = textField(body, "name", { required: true, max: 100 })!;
  const username = textField(body, "username", { required: true, max: 60 })!.toLowerCase();
  const email = textField(body, "email", { required: true, max: 160 })!.toLowerCase();
  const password = textField(body, "password", { required: true, max: 128 })!;
  if (!email.includes("@")) throw new HttpError(422, "Email adresa nije ispravna.");
  let passwordHash: string;
  try { passwordHash = await hashPassword(password); } catch { throw new HttpError(422, "Lozinka mora imati najmanje 12 znakova."); }
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, name, username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?, 'admin', 1)").bind(id, name, username, email, passwordHash),
    env.DB.prepare("INSERT INTO user_settings (user_id) VALUES (?)").bind(id),
  ]);
  return json({ message: "Administratorski račun je kreiran." }, 201);
}

export async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const identity = textField(body, "identity", { required: true, max: 160 })!.toLowerCase();
  const password = textField(body, "password", { required: true, max: 128 })!;
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const [identityHash, ipHash] = await Promise.all([sha256(identity), sha256(ip)]);
  const attempts = await env.DB.prepare(`SELECT COUNT(*) AS count FROM login_attempts
    WHERE identity_hash = ? AND ip_hash = ? AND succeeded = 0 AND created_at > datetime('now', '-15 minutes')`)
    .bind(identityHash, ipHash).first<{ count: number }>();
  if ((attempts?.count ?? 0) >= 5) throw new HttpError(429, "Previše pokušaja. Pokušajte ponovno za 15 minuta.");

  const user = await env.DB.prepare(`SELECT id, name, username, email, password_hash, role, account_status,
    subscription_expires_at, must_change_password FROM users WHERE username = ? OR email = ? LIMIT 1`)
    .bind(identity, identity).first<{
      id: string; name: string; username: string; email: string; password_hash: string; role: "admin" | "user";
      account_status: "active" | "disabled"; subscription_expires_at: string | null; must_change_password: number;
    }>();
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  await env.DB.prepare("INSERT INTO login_attempts (id, identity_hash, ip_hash, succeeded) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), identityHash, ipHash, valid ? 1 : 0).run();
  if (!user || !valid) throw new HttpError(401, "Korisničko ime ili lozinka nisu ispravni.");

  const token = createOpaqueToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, tokenHash, expiresAt),
    env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')"),
  ]);
  const { password_hash: _, ...safeUser } = user;
  return json({ user: publicUser(safeUser) }, 200, { "Set-Cookie": sessionCookie(token) });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)stockd_session=([^;]+)/)?.[1];
  if (cookie) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(decodeURIComponent(cookie))).run();
  return json({ message: "Odjavljeni ste." }, 200, { "Set-Cookie": clearSessionCookie() });
}

export async function me(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);
  return json({ user: publicUser(user) });
}

export async function changePassword(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);
  const body = await readJson(request);
  const currentPassword = textField(body, "current_password", { required: true, max: 128 })!;
  const newPassword = textField(body, "new_password", { required: true, max: 128 })!;
  const stored = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!stored || !await verifyPassword(currentPassword, stored.password_hash)) throw new HttpError(422, "Trenutna lozinka nije ispravna.");
  let hash: string;
  try { hash = await hashPassword(newPassword); } catch { throw new HttpError(422, "Nova lozinka mora imati najmanje 12 znakova."); }
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(hash, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);
  return json({ message: "Lozinka je promijenjena. Prijavite se ponovno." }, 200, { "Set-Cookie": clearSessionCookie() });
}
