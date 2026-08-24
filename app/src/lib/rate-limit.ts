/**
 * Limitador de ventana deslizante en memoria.
 *
 * OJO: es por instancia. En serverless con varias instancias vivas el techo
 * real es (límite × instancias), así que esto frena abuso ingenuo y errores de
 * loop, no a alguien decidido. Para eso hace falta un limitador compartido
 * (Redis/Upstash). Se eligió así para no meter una dependencia nueva ni un
 * write a Postgres en cada request de un endpoint público.
 */

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

/** Poda perezosa: sin esto el Map crece sin techo en una instancia de larga vida. */
function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Segundos hasta que se libere el cupo. */
  retryAfter: number;
};

/**
 * Consume una unidad del cupo `key`. Devuelve ok=false si se pasó del límite.
 *
 * @param limit  cantidad de requests permitidos por ventana
 * @param windowMs duración de la ventana en milisegundos
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  hit.count++;
  if (hit.count > limit) {
    return { ok: false, retryAfter: Math.ceil((hit.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** IP del cliente detrás del proxy de Vercel/CloudFront. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "desconocida";
}
