import type { SwitchMode } from './playlist';
import type { Style } from './renderer';

/** Everything needed to reopen the editor where the user left it. */
export interface Session {
  v: 1;
  tab: string;
  surah: number;
  from: number;
  to: number;
  reciter: string;
  duration: number | null;
  basmala: boolean;
  translation: string;
  series: boolean;
  style: Partial<Style>;
  bgId: string; // stock video id, '' or 'upload' (uploads can't be restored)
  multi: boolean;
  switchMode: SwitchMode;
  clipIds: string[];
}

const KEY = 'quran-studio-session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false; // storage full or blocked: keep working, just unsaved
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
