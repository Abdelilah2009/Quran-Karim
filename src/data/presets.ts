import type { Style } from '../lib/renderer';

export interface Preset {
  id: string;
  name: string;
  builtIn?: boolean;
  style: Partial<Style>; // merged onto the current style when applied
  reciter?: string;
  translation?: string;
  bgId?: string; // stock video id from videos.ts
}

export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'gilded-night',
    name: 'Gilded night',
    builtIn: true,
    style: {
      fontFamily: 'Amiri Quran',
      textColor: '#ffffff',
      accentColor: '#c9a24b',
      animation: 'fade',
      karaoke: false,
      showHeader: true,
      overlay: 0.45,
    },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    builtIn: true,
    style: {
      fontFamily: 'Scheherazade New',
      textColor: '#ffffff',
      accentColor: '#e8c872',
      karaoke: true,
      highlightColor: '#e8c872',
      animation: 'fade',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    builtIn: true,
    style: {
      fontFamily: 'Noto Naskh Arabic',
      textColor: '#f5f1e8',
      accentColor: '#93aca2',
      showHeader: false,
      showProgress: false,
      animation: 'slide',
      karaoke: false,
    },
  },
  {
    id: 'ruqaa',
    name: 'Ruqaa',
    builtIn: true,
    style: {
      fontFamily: 'Aref Ruqaa',
      textColor: '#f3e3bf',
      accentColor: '#d98b5f',
      animation: 'zoom',
      karaoke: false,
    },
  },
  {
    id: 'square-post',
    name: 'Square post',
    builtIn: true,
    style: {
      fontFamily: 'Amiri',
      textColor: '#ffffff',
      accentColor: '#c9a24b',
      format: '1:1',
      position: 'center',
    },
  },
];

export const PRESETS_STORAGE = 'quran-studio-presets';

export function loadPresets(): Preset[] {
  try {
    const list = JSON.parse(localStorage.getItem(PRESETS_STORAGE) ?? '[]');
    return Array.isArray(list)
      ? list.filter((p): p is Preset => typeof p?.id === 'string' && typeof p?.name === 'string' && !!p.style)
      : [];
  } catch {
    return [];
  }
}

export function savePresets(list: Preset[]): void {
  try {
    localStorage.setItem(PRESETS_STORAGE, JSON.stringify(list));
  } catch {
    /* storage blocked or full — presets just won't persist */
  }
}
