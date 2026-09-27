import { useEffect, useRef } from 'react';
import type { Style } from '../lib/renderer';
import { drawCounterPreview } from '../lib/templates/challenge';

/** A counter style drawn with the real renderer, for the picker. */
export function CounterPreview({ style }: { style: Style }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawCounterPreview(ctx, style);
  }, [style]);
  return <canvas ref={ref} className="counter-preview" width={1080} height={260} aria-hidden="true" />;
}
