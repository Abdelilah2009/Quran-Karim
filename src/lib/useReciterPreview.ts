import { useEffect, useRef, useState } from 'react';
import { ayahUrl } from './audio';

export type PreviewState = { reciter: string; status: 'loading' | 'playing' } | null;

/**
 * Plays one ayah from a reciter so the user can hear the voice before choosing.
 * Uses a plain <audio> element: it streams immediately and needs no decoding.
 */
export function useReciterPreview(surah: number, ayah: number) {
  const [state, setState] = useState<PreviewState>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stop() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = '';
    }
    audioRef.current = null;
    setState(null);
  }

  function toggle(reciter: string) {
    const same = state?.reciter === reciter;
    stop();
    if (same) return;

    const a = new Audio(ayahUrl(reciter, surah, ayah));
    audioRef.current = a;
    setState({ reciter, status: 'loading' });
    a.onplaying = () => audioRef.current === a && setState({ reciter, status: 'playing' });
    a.onended = () => audioRef.current === a && stop();
    a.onerror = () => audioRef.current === a && stop();
    void a.play().catch(() => audioRef.current === a && stop());
  }

  useEffect(() => stop, []);

  return { state, toggle, stop };
}
