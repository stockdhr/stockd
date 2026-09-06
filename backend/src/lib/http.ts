export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_768) throw new HttpError(413, "Zahtjev je prevelik.");
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Očekivan je JSON sadržaj.");
  }
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Neispravan zahtjev.");
  }
}

export function textField(body: Record<string, unknown>, key: string, options: { required?: boolean; max?: number } = {}): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new HttpError(422, `Polje ${key} je obavezno.`);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, `Polje ${key} nije ispravno.`);
  const clean = value.trim();
  if (options.required && !clean) throw new HttpError(422, `Polje ${key} je obavezno.`);
  if (clean.length > (options.max ?? 500)) throw new HttpError(422, `Polje ${key} je predugo.`);
  return clean;
}

export function centsField(body: Record<string, unknown>, key: string, required = false): number {
  const value = body[key];
  if ((value === undefined || value === null || value === "") && !required) return 0;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000_00) {
    throw new HttpError(422, `Polje ${key} nije ispravan iznos.`);
  }
  return amount;
}

export function isoDateField(body: Record<string, unknown>, key: string, required = false): string | null {
  const value = textField(body, key, { required, max: 30 });
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(422, `Polje ${key} nije ispravan datum.`);
  return date.toISOString();
}

