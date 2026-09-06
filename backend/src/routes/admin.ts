import { requireAdmin, requireAuth } from "../lib/auth";
import { addCalendarMonths, subscriptionState } from "../lib/dates";
import { hashPassword } from "../lib/crypto";
import { HttpError, json, readJson, textField } from "../lib/http";

async function admin(request: Request, env: Env) {
  const user = await requireAuth(request, env);
  requireAdmin(user);
  return user;
}

export async function adminDashboard(request: Request, env: Env): Promise<Response> {
  await admin(request, env);
  const [totals, users] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN account_status = 'disabled' THEN 1 ELSE 0 END) disabled,
      SUM(CASE WHEN created_at >= date('now','start of month') THEN 1 ELSE 0 END) new_this_month
      FROM users WHERE role = 'user'`),
    env.DB.prepare(`SELECT id, name, username, email, account_status, subscription_started_at,
      subscription_expires_at, created_at, last_login_at FROM users WHERE role = 'user' ORDER BY subscription_expires_at ASC`),
  ]);
  if (!totals || !users) throw new HttpError(500, "Nije moguće učitati admin pregled.");
  const allUsers = users.results as Array<{ account_status: string; subscription_expires_at: string | null } & Record<string, unknown>>;
  const withStatus = allUsers.map((user) => ({ ...user, subscription_status: subscriptionState({ role: "user", account_status: user.account_status, subscription_expires_at: user.subscription_expires_at }) }));
  return json({
    totals: totals.results[0],
    active: withStatus.filter((u) => u.subscription_status === "active").length,
    expiring: withStatus.filter((u) => u.subscription_status === "expiring_soon").length,
    expired: withStatus.filter((u) => u.subscription_status === "expired").length,
    expiring_users: withStatus.filter((u) => u.subscription_status === "expiring_soon").slice(0, 8),
  });
}

export async function listUsers(request: Request, env: Env): Promise<Response> {
  await admin(request, env);
  const result = await env.DB.prepare(`SELECT id, name, username, email, phone, account_status, subscription_started_at,
    subscription_expires_at, created_at, last_login_at, admin_note FROM users WHERE role = 'user' ORDER BY created_at DESC`).all();
  const users = result.results.map((raw) => {
    const user = raw as { account_status: string; subscription_expires_at: string | null } & Record<string, unknown>;
    return { ...user, subscription_status: subscriptionState({ role: "user", account_status: user.account_status, subscription_expires_at: user.subscription_expires_at }) };
  });
  return json({ users });
}

export async function createUser(request: Request, env: Env): Promise<Response> {
  const actor = await admin(request, env);
  const body = await readJson(request);
  const name = textField(body, "name", { required: true, max: 100 })!;
  const username = textField(body, "username", { required: true, max: 60 })!.toLowerCase();
  const email = textField(body, "email", { required: true, max: 160 })!.toLowerCase();
  const password = textField(body, "password", { required: true, max: 128 })!;
  if (!email.includes("@")) throw new HttpError(422, "Email adresa nije ispravna.");
  let passwordHash: string;
  try { passwordHash = await hashPassword(password); } catch { throw new HttpError(422, "Privremena lozinka mora imati najmanje 12 znakova."); }
  const now = new Date();
  const expires = addCalendarMonths(now, 1);
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, name, username, email, phone, password_hash, subscription_started_at,
        subscription_expires_at, admin_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, name, username, email, textField(body, "phone", { max: 40 }), passwordHash, now.toISOString(), expires.toISOString(), textField(body, "admin_note", { max: 1000 })),
      env.DB.prepare("INSERT INTO user_settings (user_id) VALUES (?)").bind(id),
      env.DB.prepare(`INSERT INTO subscription_history (id, user_id, admin_id, action, months, new_expires_at)
        VALUES (?, ?, ?, 'created', 1, ?)`).bind(crypto.randomUUID(), id, actor.id, expires.toISOString()),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) throw new HttpError(409, "Korisničko ime ili email već postoji.");
    throw error;
  }
  return json({ id, subscription_expires_at: expires.toISOString(), message: "Korisnik je kreiran." }, 201);
}

export async function renewUser(request: Request, env: Env, userId: string): Promise<Response> {
  const actor = await admin(request, env);
  const body = await readJson(request);
  const months = Number(body.months ?? 1);
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new HttpError(422, "Broj mjeseci mora biti između 1 i 24.");
  const target = await env.DB.prepare("SELECT subscription_expires_at FROM users WHERE id = ? AND role = 'user'").bind(userId).first<{ subscription_expires_at: string | null }>();
  if (!target) throw new HttpError(404, "Korisnik nije pronađen.");
  const now = new Date();
  const oldExpiration = target.subscription_expires_at ? new Date(target.subscription_expires_at) : null;
  const base = oldExpiration && oldExpiration > now ? oldExpiration : now;
  const newExpiration = addCalendarMonths(base, months);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET account_status = 'active', subscription_started_at = COALESCE(subscription_started_at, ?), subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(now.toISOString(), newExpiration.toISOString(), userId),
    env.DB.prepare(`INSERT INTO subscription_history (id, user_id, admin_id, action, months, old_expires_at, new_expires_at)
      VALUES (?, ?, ?, 'extended', ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, actor.id, months, target.subscription_expires_at, newExpiration.toISOString()),
  ]);
  return json({ subscription_expires_at: newExpiration.toISOString(), message: "Članarina je produžena." });
}

export async function toggleUser(request: Request, env: Env, userId: string): Promise<Response> {
  const actor = await admin(request, env);
  const body = await readJson(request);
  const disabled = body.disabled === true;
  const target = await env.DB.prepare("SELECT id, subscription_expires_at FROM users WHERE id = ? AND role = 'user'").bind(userId).first<{ id: string; subscription_expires_at: string | null }>();
  if (!target) throw new HttpError(404, "Korisnik nije pronađen.");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET account_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(disabled ? "disabled" : "active", userId),
    env.DB.prepare("INSERT INTO subscription_history (id, user_id, admin_id, action, old_expires_at, new_expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, actor.id, disabled ? "disabled" : "reactivated", target.subscription_expires_at, target.subscription_expires_at),
    ...(disabled ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId)] : []),
  ]);
  return json({ message: disabled ? "Korisnik je onemogućen." : "Korisnik je ponovno aktiviran." });
}
