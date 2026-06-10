import { DltDraw } from '../domain/dlt';

const CACHE_KEY = 'lotto-sieve:dlt-history:v1';

export type DltHistoryCache = {
  draws: DltDraw[];
  syncedAt: string;
};

export function loadCachedDltHistory(): DltHistoryCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as DltHistoryCache;

    if (!Array.isArray(parsed.draws) || parsed.draws.length === 0 || !parsed.syncedAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedDltHistory(draws: DltDraw[], syncedAt: string) {
  window.localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      draws,
      syncedAt,
    }),
  );
}
