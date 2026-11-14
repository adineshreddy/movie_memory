const FACT_CACHE_TTL_MS = 60_000;

export function isFactFresh(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() < FACT_CACHE_TTL_MS;
}
