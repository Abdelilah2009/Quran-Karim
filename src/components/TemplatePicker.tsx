import { useEffect, useRef } from 'react';
import { drawFrame, FORMATS, type Background, type Meta, type Style } from '../lib/renderer';
import { TEMPLATES, type Template } from '../lib/templates';
import type { Timeline } from '../lib/timeline';

interface Props {
  style: Style;
  timeline: Timeline | null;
  meta: Meta;
  background: () => Background; // current background, sampled once per redraw
  onPick: (template: Template) => void;
}

const THUMB_W = 176;

/** Grid of templates, each previewed with the user's own verse, background and colors. */
export function TemplatePicker({ style, timeline, meta, background, onPick }: Props) {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const bgRef = useRef(background);
  bgRef.current = background;

  const { w, h } = FORMATS[style.format];
  const thumbH = Math.round((THUMB_W * h) / w);

  // Redraw the stills when anything that affects them settles.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const full = document.createElement('canvas');
      full.width = w;
      full.height = h;
      const fctx = full.getContext('2d')!;
      const bg = bgRef.current();
      TEMPLATES.forEach((tpl, i) => {
        const c = canvases.current[i];
        if (!c) return;
        const s = { ...style, ...tpl.defaults, template: tpl.id, hook: tpl.id === style.template ? style.hook : (tpl.defaults.hook ?? style.hook) };
        drawFrame(fctx, 0, timeline, bg, s, meta, 0, true);
        c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [style, timeline, meta, w, h]);

  return (
    <div className="template-grid" role="radiogroup" aria-label="Templates">
      {TEMPLATES.map((tpl, i) => {
        const on = tpl.id === style.template;
        return (
          <button key={tpl.id} type="button" role="radio" aria-checked={on}
            className={on ? 'template-card on' : 'template-card'} onClick={() => onPick(tpl)}>
            <canvas ref={(el) => { canvases.current[i] = el; }} width={THUMB_W * 2} height={thumbH * 2}
              style={{ aspectRatio: `${w} / ${h}` }} aria-hidden="true" />
            <span className="template-name">{tpl.name}</span>
            <small>{tpl.description}</small>
          </button>
        );
      })}
    </div>
  );
}
