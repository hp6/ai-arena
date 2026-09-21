// Live server by default; a static export (npm run build:static) reads plain files instead
const base = import.meta.env.VITE_DATA_BASE ?? "http://localhost:3001/api";

export const IS_STATIC = !!import.meta.env.VITE_DATA_BASE;
export const API_BASE = `${base}/games`;
export const STATS_URL = IS_STATIC ? `${base}/stats.json` : `${base}/stats`;

/** Static exports are plain files, so a match's data lives at a fixed path rather than behind a query */
export function gameUrl(id: string) {
  return IS_STATIC ? `${API_BASE}/${id}.json` : `${API_BASE}/${id}`;
}

export function framesUrl(id: string, after: number) {
  return IS_STATIC ? `${API_BASE}/${id}/frames.json` : `${API_BASE}/${id}/frames?after=${after}`;
}

export function gamesUrl() {
  return IS_STATIC ? `${base}/games.json` : API_BASE;
}
