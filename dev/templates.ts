// Dev-only harness: renders one template at several moments of a real reel.
// http://localhost:5173/dev/templates.html?template=classic&format=9:16&style={"karaoke":true}
import { getAudioContext, loadAudio } from '../src/lib/audio';
import { getAyat } from '../src/lib/quran';
import { drawFrame, FORMATS, type Background, type Format, type Style } from '../src/lib/renderer';
import { cardsFor, getTemplate } from '../src/lib/templates';
import { buildTimeline } from '../src/lib/timeline';
import { getSurahWords } from '../src/lib/words';

const q = new URLSearchParams(location.search);
const format = (q.get('format') ?? '9:16') as Format;
const base: Style = {
  fontFamily: 'Amiri Quran', fontSize: 84, textColor: '#ffffff', accentColor: '#e9cf8a', overlay: 0.4,
  position: 'center', translationFont: 'Figtree, system-ui, sans-serif', showTranslation: true, showHeader: true,
  showAyahNumber: true, showProgress: true, watermark: '@quranstudio', animation: 'fade', karaoke: false,
  highlightColor: '#f2c96b', format, intro: true, outro: 'صدق الله العظيم', blur: 0, kenBurns: false,
  template: q.get('template') ?? 'classic', hook: 'قاوم التعفن الدماغي', hookStyle: 'plain', hookPosition: 'center', counterStyle: 'whatsapp',
};
const template = getTemplate(base.template);
const style: Style = { ...base, ...template.defaults, ...JSON.parse(q.get('style') ?? '{}'), format };
const surah = +(q.get('surah') ?? 1);
const from = +(q.get('from') ?? 1);
const to = +(q.get('to') ?? 4);

async function main() {
  getAudioContext();
  await document.fonts.load(`84px "${style.fontFamily}"`, 'بسم');
  await document.fonts.ready;
  const [words, ayat] = await Promise.all([getSurahWords('Alafasy_128kbps', surah), getAyat(surah, from, to, q.get('tr') ?? 'en.sahih')]);
  const items = await Promise.all(
    ayat.map(async (a) => {
      const w = words.get(a.numberInSurah)!;
      return { surah, ayah: a.numberInSurah, text: a.text, translation: a.translation, words: w.words, buffer: await loadAudio(w.audioUrl, 'v') };
    }),
  );
  const tl = buildTimeline(items, null, cardsFor(style));
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = q.get('bg') ?? 'https://assets.mixkit.co/videos/1164/1164-thumb-360-0.jpg';
  await img.decode();
  const bg: Background = { kind: 'layers', layers: [{ src: img, w: img.naturalWidth, h: img.naturalHeight, alpha: 1 }] };
  const meta = { surahName: 'سُورَةُ ٱلْفَاتِحَةِ', reciterName: 'مشاري راشد العفاسي' };

  const s1 = tl.segments[Math.min(1, tl.segments.length - 1)];
  const last = tl.segments[tl.segments.length - 1];
  const moments: [string, number, boolean][] = [
    ['idle (editor still)', 0, true],
    ...(tl.intro ? ([['intro', tl.intro / 2, false]] as [string, number, boolean][]) : []),
    ['verse 1 +0.15s (fade in)', tl.segments[0].start + 0.15, false],
    ['verse 2 middle', (s1.start + s1.end) / 2, false],
    ['last verse, word 2', last.start + (last.words?.[1]?.start ?? 1) + 0.05, false],
    ...(tl.outro ? ([['outro +1s', tl.duration - tl.outro + 1, false]] as [string, number, boolean][]) : []),
    ...((q.get('t') ?? '').split(',').filter(Boolean).map((t) => [`t=${t}`, +t, false]) as [string, number, boolean][]),
  ];

  const { w, h } = FORMATS[format];
  const frame = document.createElement('canvas');
  frame.width = w;
  frame.height = h;
  const fctx = frame.getContext('2d')!;
  const cols = Math.min(moments.length, format === '16:9' ? 3 : 6);
  const cw = format === '16:9' ? 640 : 360;
  const ch = (cw * h) / w;
  const grid = document.getElementById('grid') as HTMLCanvasElement;
  grid.width = cols * (cw + 10);
  grid.height = Math.ceil(moments.length / cols) * (ch + 34);
  const g = grid.getContext('2d')!;
  g.fillStyle = '#111';
  g.fillRect(0, 0, grid.width, grid.height);
  moments.forEach(([label, t, idle], i) => {
    drawFrame(fctx, t, tl, bg, style, meta, t, idle);
    const x = (i % cols) * (cw + 10);
    const y = Math.floor(i / cols) * (ch + 34);
    g.drawImage(frame, x, y + 28, cw, ch);
    g.fillStyle = '#ccc';
    g.font = '14px Figtree, sans-serif';
    g.fillText(`${label}  (t=${t.toFixed(2)})`, x + 4, y + 18);
  });
  (window as unknown as { __done: boolean }).__done = true;
}
main().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre id="err">${e.stack}</pre>`);
  (window as unknown as { __done: boolean }).__done = true;
});
