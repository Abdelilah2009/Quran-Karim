import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { BackgroundPicker } from './components/BackgroundPicker';
import { CaptionBox } from './components/CaptionBox';
import { ExportDialog, type ExportJob } from './components/ExportDialog';
import { Presets } from './components/Presets';
import { Select } from './components/Select';
import { TemplatePicker } from './components/TemplatePicker';
import { DURATIONS, FONTS, GRADIENTS, RECITERS, TRANSLATIONS } from './data/options';
import type { Preset } from './data/presets';
import { STOCK_VIDEOS, type StockVideo } from './data/videos';
import { getAudioContext, loadAudio, loadAyahAudio } from './lib/audio';
import { playTimeline, recordReel, type Playback } from './lib/engine';
import { createVideo, downloadVideo, seekToStart } from './lib/media';
import { canExportOffline, mixTimeline, renderOffline, type Frame, type FrameRequest } from './lib/offline';
import { BASMALA, getAyat, getSurahs, type SurahMeta } from './lib/quran';
import { clipAt, type SwitchMode } from './lib/playlist';
import {
  drawFrame,
  FORMATS,
  type Background,
  type Format,
  type Layer,
  type Meta,
  type Style,
  type TextAnimation,
} from './lib/renderer';
import { useReciterPreview } from './lib/useReciterPreview';
import { cardsFor, getTemplate, INTRO, OUTRO, TEMPLATES, type Template } from './lib/templates';
import { buildTimeline, splitIntoParts, type Timeline, type TimelineItem } from './lib/timeline';
import { getSurahWords, hasWordTimings } from './lib/words';

const DEFAULT_STYLE: Style = {
  fontFamily: 'Amiri Quran',
  fontSize: 84,
  textColor: '#ffffff',
  accentColor: '#e9cf8a',
  overlay: 0.4,
  position: 'center',
  translationFont: 'Figtree, system-ui, sans-serif',
  showTranslation: true,
  showHeader: true,
  showAyahNumber: true,
  showProgress: true,
  watermark: '',
  animation: 'fade',
  karaoke: false,
  highlightColor: '#f2c96b',
  format: '9:16',
  intro: false,
  outro: '',
  blur: 0,
  kenBurns: true,
  template: 'classic',
  hook: 'قاوم التعفن الدماغي',
};

const OUTRO_TEXT = 'صدق الله العظيم';

const ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: 'fade', label: 'Fade' },
  { id: 'slide', label: 'Slide up' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'reveal', label: 'Word by word' },
];

// Ready-made headlines for the templates that show one.
const HOOKS: Record<string, string[]> = {
  challenge: ['قاوم التعفن الدماغي', 'توقف دقيقة واستمع', 'هذه الآية ستغير يومك', 'اسمعها حتى النهاية', 'Stop scrolling. Listen.'],
  question: ['هل تعرف معنى هذه الآية؟', 'ماذا تعني هذه الآية؟', 'Do you know what this verse means?'],
};

// Well-loved passages for "Surprise me": [surah, from, to].
const PASSAGES: [number, number, number][] = [
  [1, 1, 7], [2, 152, 157], [2, 255, 255], [2, 285, 286], [3, 190, 194], [13, 28, 29], [18, 1, 5],
  [20, 25, 28], [21, 87, 88], [36, 1, 12], [39, 53, 54], [55, 1, 13], [59, 22, 24], [65, 2, 3],
  [67, 1, 5], [93, 1, 11], [94, 1, 8], [103, 1, 3], [108, 1, 3], [112, 1, 4], [113, 1, 5], [114, 1, 6],
];
const TEMPLATE_FONTS = ['700 40px "Noto Kufi Arabic"', '700 40px Figtree', '40px "Noto Naskh Arabic"', 'italic 40px Figtree'];

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const WORD_TIMING_RECITERS = RECITERS.filter((r) => hasWordTimings(r.id)).map((r) => r.latin);

type Tab = 'passage' | 'template' | 'background' | 'text' | 'publish';
const TABS: { id: Tab; label: string }[] = [
  { id: 'passage', label: 'Passage' },
  { id: 'template', label: 'Template' },
  { id: 'background', label: 'Background' },
  { id: 'text', label: 'Text' },
  { id: 'publish', label: 'Publish' },
];

// Overall export progress is split across phases.
const SPLIT = { audio: 0.15, background: 0.2, recording: 0.97 };

// What the user picked as the background; the renderer gets it as layers.
type Source =
  | { kind: 'gradient'; colors: [string, string] }
  | { kind: 'video'; el: HTMLVideoElement }
  | { kind: 'image'; el: HTMLImageElement };

type QueueItem = Omit<TimelineItem, 'buffer' | 'words'> & { audioSurah: number; audioAyah: number };

type LiveState = {
  bg: Source;
  timeline: Timeline | null;
  multi: boolean;
  clips: { id: string; el: HTMLVideoElement }[];
  switchMode: SwitchMode;
};

const videoLayer = (el: HTMLVideoElement, alpha = 1): Layer => ({ src: el, w: el.videoWidth, h: el.videoHeight, alpha });

function sourceBackground(src: Source): Background {
  if (src.kind === 'gradient') return src;
  if (src.kind === 'video') return { kind: 'layers', layers: [videoLayer(src.el)] };
  return { kind: 'layers', layers: [{ src: src.el, w: src.el.naturalWidth, h: src.el.naturalHeight, alpha: 1 }] };
}

// Resolve what to draw this frame. In multi-clip mode this also plays the
// visible clips and pauses the rest, so off-screen videos don't drift.
function backgroundAt(s: LiveState, t: number, playing: boolean): Background {
  if (!s.multi || !s.clips.length) return sourceBackground(s.bg);
  if (s.clips.length === 1) {
    const el = s.clips[0].el;
    if (el.paused) void el.play();
    return { kind: 'layers', layers: [videoLayer(el)] };
  }
  const clip = clipAt(t, s.clips.length, s.switchMode, s.timeline, playing);
  s.clips.forEach((c, i) => {
    const visible = i === clip.index || (clip.mix > 0 && i === clip.next);
    if (visible && c.el.paused) void c.el.play();
    else if (!visible && !c.el.paused) c.el.pause();
  });
  const layers = [videoLayer(s.clips[clip.index].el)];
  if (clip.mix > 0) layers.push(videoLayer(s.clips[clip.next].el, clip.mix));
  return { kind: 'layers', layers };
}

// Background without touching playback (for stills: template thumbnails, cover).
function stillBackground(s: LiveState): Background {
  if (s.multi && s.clips.length) return { kind: 'layers', layers: [videoLayer(s.clips[0].el)] };
  return sourceBackground(s.bg);
}

// Where TikTok / Reels / Shorts overlay their own UI on a vertical video.
function drawSafeZones(ctx: CanvasRenderingContext2D, format: Format) {
  const { width: w, height: h } = ctx.canvas;
  ctx.save();
  ctx.font = '600 30px Figtree, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (format === '9:16') {
    const zones: [number, number, number, number, string][] = [
      [0, 0, w, h * 0.09, 'App header'],
      [0, h * 0.8, w * 0.84, h * 0.2, 'Caption and username'],
      [w * 0.84, h * 0.42, w * 0.16, h * 0.58, 'Buttons'],
    ];
    for (const [x, y, zw, zh, label] of zones) {
      ctx.fillStyle = 'rgba(230, 70, 60, 0.28)';
      ctx.fillRect(x, y, zw, zh);
      ctx.fillStyle = '#fff';
      if (zw > w * 0.3) ctx.fillText(label, x + zw / 2, y + zh / 2);
    }
  }
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
  ctx.restore();
}

function download(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

export default function App() {
  const [tab, setTab] = useState<Tab>('passage');
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [surah, setSurah] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(7);
  const [reciter, setReciter] = useState(RECITERS[0].id);
  const [duration, setDuration] = useState<number | null>(60);
  const [basmala, setBasmala] = useState(true);
  const [translation, setTranslation] = useState('');
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [bg, setBg] = useState<Source>({ kind: 'gradient', colors: GRADIENTS[4].colors });
  const [bgId, setBgId] = useState('');
  const [bgLoading, setBgLoading] = useState<{ id: string; progress: number } | null>(null);
  const [multi, setMulti] = useState(false);
  const [switchMode, setSwitchMode] = useState<SwitchMode>('verse');
  const [clips, setClips] = useState<{ id: string; el: HTMLVideoElement }[]>([]);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [timelineKey, setTimelineKey] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'' | 'loading' | 'playing' | 'exporting'>('');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [series, setSeries] = useState(false);
  const [safeZones, setSafeZones] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef<Playback | null>(null);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const live = useRef({ style, bg, timeline, surahName: '', reciterName: '', multi, clips, switchMode, guides: false });
  const reciterPreview = useReciterPreview(surah, from);

  const meta = surahs.find((s) => s.number === surah);
  const reciterMeta = RECITERS.find((r) => r.id === reciter)!;
  live.current = {
    style,
    bg,
    timeline,
    surahName: meta?.name ?? '',
    reciterName: reciterMeta.name,
    multi,
    clips,
    switchMode,
    guides: safeZones && busy !== 'exporting', // never burn guides into a real-time recording
  };

  const useWords = style.karaoke && hasWordTimings(reciter);
  const cards = cardsFor(style);
  const key = useMemo(
    () => JSON.stringify({ surah, from, to, reciter, duration, basmala, translation, useWords, cards }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surah, from, to, reciter, duration, basmala, translation, useWords, cards.intro, cards.outro],
  );
  const stale = key !== timelineKey;

  useEffect(() => {
    getSurahs()
      .then(setSurahs)
      .catch((e) => setStatus(e.message));
    void pickVideo(STOCK_VIDEOS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void document.fonts.load(`40px "${style.fontFamily}"`, 'بسم الله');
  }, [style.fontFamily]);

  // Faces the templates draw with; the canvas only triggers a download on first use.
  useEffect(() => {
    TEMPLATE_FONTS.forEach((f) => void document.fonts.load(f, 'بسم Aa'));
  }, []);

  // One render loop for idle preview, playback and export; reads state via ref.
  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const s = live.current;
      const pb = playbackRef.current;
      const t = pb?.time() ?? 0;
      const bgT = (performance.now() - start) / 1000;
      drawFrame(ctx, t, s.timeline, backgroundAt(s, pb ? Math.max(0, t) : bgT, !!pb), s.style,
        { surahName: s.surahName, reciterName: s.reciterName }, bgT, !pb);
      if (s.guides) drawSafeZones(ctx, s.style.format);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  async function loadStock(v: StockVideo): Promise<HTMLVideoElement> {
    setBgLoading({ id: v.id, progress: 0 });
    const url = await downloadVideo(v.src, (p) => setBgLoading({ id: v.id, progress: p }));
    return createVideo(url);
  }

  async function pickVideo(v: StockVideo) {
    if (multi) return toggleClip(v);
    try {
      const el = await loadStock(v);
      const prev = live.current.bg;
      if (prev.kind === 'video') prev.el.pause();
      setBg({ kind: 'video', el });
      setBgId(v.id);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBgLoading(null);
    }
  }

  async function toggleClip(v: StockVideo) {
    const existing = clips.find((c) => c.id === v.id);
    if (existing) {
      existing.el.pause();
      setClips((cs) => cs.filter((c) => c.id !== v.id));
      return;
    }
    try {
      const el = await loadStock(v);
      setClips((cs) => [...cs, { id: v.id, el }]);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBgLoading(null);
    }
  }

  function changeMulti(on: boolean) {
    setMulti(on);
    if (on) {
      setClips(bg.kind === 'video' && bgId && bgId !== 'upload' ? [{ id: bgId, el: bg.el }] : []);
      return;
    }
    const [first, ...rest] = clips;
    rest.forEach((c) => c.el.pause());
    if (first) {
      setBg({ kind: 'video', el: first.el });
      setBgId(first.id);
      void first.el.play();
    }
    setClips([]);
  }

  // Rewind every background video so preview and export start from frame 0.
  async function rewindBackground() {
    if (multi && clips.length) {
      await Promise.all(clips.map((c) => seekToStart(c.el)));
      clips.forEach((c, i) => (i === 0 ? void c.el.play() : c.el.pause()));
    } else if (bg.kind === 'video') {
      await seekToStart(bg.el);
      void bg.el.play();
    }
  }

  async function onUpload(file: File) {
    if (multi) changeMulti(false);
    const url = URL.createObjectURL(file);
    setBgId('upload');
    if (file.type.startsWith('video/')) {
      try {
        setBg({ kind: 'video', el: await createVideo(url) });
      } catch (e) {
        setStatus((e as Error).message);
      }
    } else {
      const el = new Image();
      el.onload = () => setBg({ kind: 'image', el });
      el.src = url;
    }
  }

  function changeSurah(n: number) {
    const m = surahs.find((s) => s.number === n);
    setSurah(n);
    setFrom(1);
    setTo(Math.min(m?.numberOfAyahs ?? 7, 10));
  }

  // Fetch verse text + recitation audio. `limit` stops early once there is
  // clearly enough audio for a reel of that length (null = load everything).
  async function loadItems(limit: number | null, onProgress?: (p: number) => void): Promise<TimelineItem[]> {
    getAudioContext();
    setStatus('Loading verses…');
    const ayat = await getAyat(surah, from, to, translation);
    const queue: QueueItem[] = [
      ...(basmala && from === 1 && surah !== 1 && surah !== 9
        ? [{ surah, ayah: 0, audioSurah: 1, audioAyah: 1, text: BASMALA }]
        : []),
      ...ayat.map((a) => ({
        surah,
        ayah: a.numberInSurah,
        audioSurah: surah,
        audioAyah: a.numberInSurah,
        text: a.text,
        translation: a.translation,
      })),
    ];

    // Karaoke loads quran.com's audio, because its word timings match those files.
    const load = async ({ audioSurah, audioAyah, ...q }: QueueItem): Promise<TimelineItem> => {
      const w = useWords ? (await getSurahWords(reciter, audioSurah)).get(audioAyah) : undefined;
      const buffer = w
        ? await loadAudio(w.audioUrl, `verse ${audioAyah}`)
        : await loadAyahAudio(reciter, audioSurah, audioAyah);
      return { ...q, words: w?.words, buffer };
    };

    const items: TimelineItem[] = [];
    let total = 0;
    for (let i = 0; i < queue.length; i += 5) {
      const loaded = await Promise.all(queue.slice(i, i + 5).map(load));
      items.push(...loaded);
      total += loaded.reduce((n, it) => n + it.buffer.duration, 0);
      onProgress?.(items.length / queue.length);
      setStatus(`Loading recitation ${items.length} of ${queue.length}…`);
      if (limit !== null && total > limit * 1.25 + 10) break;
    }
    onProgress?.(1);
    return items;
  }

  async function prepare(onProgress?: (p: number) => void): Promise<Timeline> {
    if (!stale && timeline) {
      onProgress?.(1);
      return timeline;
    }
    const tl = buildTimeline(await loadItems(duration, onProgress), duration, cards);
    setTimeline(tl);
    setTimelineKey(key);
    const verses = tl.segments.filter((s) => s.ayah > 0).length;
    setStatus(`${verses} verse${verses === 1 ? '' : 's'}, ${tl.duration.toFixed(1)}s${tl.cut ? ', last verse fades out' : ''}`);
    return tl;
  }

  async function preview() {
    if (busy === 'playing') return playbackRef.current?.stop();
    setBusy('loading');
    try {
      const tl = await prepare();
      await rewindBackground();
      const pb = playTimeline(tl);
      playbackRef.current = pb;
      setBusy('playing');
      await pb.done;
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      playbackRef.current = null;
      setBusy('');
    }
  }

  // Offline WebCodecs render (faster than real time, frame-exact), falling back
  // to recording the preview canvas where WebCodecs isn't available.
  async function renderPart(
    tl: Timeline,
    part: Meta['part'],
    onProgress: (p: number) => void,
  ): Promise<{ blob: Blob; ext: string }> {
    if (canExportOffline()) {
      try {
        return await renderOfflinePart(tl, part, onProgress);
      } catch (e) {
        if ((e as Error).message === 'cancelled') throw e;
        console.warn('Offline export failed, recording in real time instead.', e);
        setJob((j) => j && { ...j, realtime: true });
      }
    }
    await rewindBackground();
    let ticker = 0;
    try {
      return await recordReel(canvasRef.current!, tl, (pb) => {
        playbackRef.current = pb;
        ticker = window.setInterval(() => onProgress(Math.max(0, Math.min(pb.time() / tl.duration, 1))), 100);
      });
    } finally {
      clearInterval(ticker);
      playbackRef.current = null;
    }
  }

  async function renderOfflinePart(
    tl: Timeline,
    part: Meta['part'],
    onProgress: (p: number) => void,
  ): Promise<{ blob: Blob; ext: string }> {
    const snap = live.current;
    const vids = snap.multi && snap.clips.length ? snap.clips.map((c) => c.el) : snap.bg.kind === 'video' ? [snap.bg.el] : [];
    const clip = (t: number) => clipAt(t, vids.length, snap.switchMode, tl, true);
    const plan = (t: number): FrameRequest[] => {
      if (vids.length <= 1) return vids.length ? [{ video: 0, time: t }] : [];
      const c = clip(t);
      return [{ video: c.index, time: t }, ...(c.mix > 0 ? [{ video: c.next, time: t }] : [])];
    };
    const still = vids.length ? null : sourceBackground(snap.bg);
    const meta: Meta = { surahName: snap.surahName, reciterName: snap.reciterName, part };
    const { w, h } = FORMATS[snap.style.format];
    abortRef.current = new AbortController();
    return renderOffline({
      width: w,
      height: h,
      duration: tl.duration,
      audio: await mixTimeline(tl),
      videos: vids.map((v) => v.src),
      plan,
      draw: (ctx, t, frames: (Frame | null)[]) => {
        const mix = vids.length > 1 ? clip(t).mix : 1;
        const bg: Background = still ?? {
          kind: 'layers',
          layers: frames.flatMap((f, i) => (f ? [{ ...f, alpha: i === 0 ? 1 : mix }] : [])),
        };
        drawFrame(ctx as CanvasRenderingContext2D, t, tl, bg, snap.style, meta, t);
      },
      onProgress,
      signal: abortRef.current.signal,
    });
  }

  async function exportReel() {
    cancelledRef.current = false;
    setBusy('exporting');
    const realtime = !canExportOffline();
    setJob({ phase: 'audio', progress: 0, realtime });
    const check = () => {
      if (cancelledRef.current) throw new Error('cancelled');
    };
    try {
      const audioProgress = (p: number) => setJob({ phase: 'audio', progress: p * SPLIT.audio, realtime });
      let parts: Timeline[];
      if (series && duration !== null) {
        const items = await loadItems(null, audioProgress);
        const budget = Math.max(5, duration - cards.intro - cards.outro);
        let at = 0;
        parts = splitIntoParts(items.map((i) => i.buffer.duration), budget).map((n) => {
          const tl = buildTimeline(items.slice(at, at + n), null, cards);
          at += n;
          return tl;
        });
        setStatus(`${parts.length} parts`);
      } else parts = [await prepare(audioProgress)];
      check();

      setJob({ phase: 'background', progress: SPLIT.audio, realtime });
      await Promise.all(TEMPLATE_FONTS.map((f) => document.fonts.load(f, 'بسم Aa')));
      await document.fonts.ready;
      check();

      let result: Pick<ExportJob, 'url' | 'fileName' | 'sizeMb'> = {};
      const total = parts.length > 1 ? parts.length : 0;
      for (let i = 0; i < parts.length; i++) {
        const tl = parts[i];
        const part = total ? { index: i + 1, total } : undefined;
        const { blob, ext } = await renderPart(tl, part, (p) => {
          const overall = (i + p) / parts.length;
          setJob({
            phase: 'recording',
            progress: SPLIT.background + overall * (SPLIT.recording - SPLIT.background),
            elapsed: p * tl.duration,
            total: tl.duration,
            realtime,
            part,
          });
        });
        check();
        const ayat = tl.segments.filter((s) => s.ayah > 0).map((s) => s.ayah);
        const range = ayat.length ? `${ayat[0]}-${ayat[ayat.length - 1]}` : '1';
        const fileName = `quran-${surah}-${range}${part ? `-part${part.index}` : ''}.${ext}`;
        const url = URL.createObjectURL(blob);
        download(url, fileName);
        result = { url, fileName, sizeMb: blob.size / 1e6 };
      }
      setJob({ phase: 'done', progress: 1, ...result, part: total ? { index: total, total } : undefined });
    } catch (e) {
      const msg = (e as Error).message;
      setJob(msg === 'cancelled' ? null : { phase: 'error', progress: 0, message: msg });
    } finally {
      playbackRef.current = null;
      setBusy('');
    }
  }

  function cancelExport() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    playbackRef.current?.stop();
    setJob(null);
  }

  // Switching templates first undoes what the previous one set, then applies the new look.
  function pickTemplate(tpl: Template) {
    setStyle((s) => {
      const prev = getTemplate(s.template).defaults;
      const undo = Object.fromEntries(Object.keys(prev).map((k) => [k, DEFAULT_STYLE[k as keyof Style]]));
      return { ...s, ...undo, ...tpl.defaults, template: tpl.id };
    });
  }

  function saveCover() {
    const s = live.current;
    const { w, h } = FORMATS[s.style.format];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    drawFrame(c.getContext('2d')!, 0, s.timeline, stillBackground(s), s.style,
      { surahName: s.surahName, reciterName: s.reciterName }, 0, true);
    c.toBlob((b) => b && download(URL.createObjectURL(b), `quran-${surah}-${from}-${to}-cover.png`), 'image/png');
  }

  function surprise() {
    const [s, a, b] = pick(PASSAGES);
    setSurah(s);
    setFrom(a);
    setTo(b);
    setReciter(pick(RECITERS.filter((r) => hasWordTimings(r.id))).id);
    pickTemplate(pick(TEMPLATES));
    if (!multi) void pickVideo(pick(STOCK_VIDEOS));
  }

  function applyPreset(p: Preset) {
    setStyle((s) => ({ ...s, ...p.style }));
    if (p.reciter) setReciter(p.reciter);
    if (p.translation !== undefined) setTranslation(p.translation);
    const v = p.bgId && !multi ? STOCK_VIDEOS.find((sv) => sv.id === p.bgId) : undefined;
    if (v && v.id !== bgId) void pickVideo(v);
  }

  const set = <K extends keyof Style>(k: K, v: Style[K]) => setStyle((s) => ({ ...s, [k]: v }));
  const maxAyah = meta?.numberOfAyahs ?? 7;
  const fmt = FORMATS[style.format];

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <img className="brand-mark" src="/icon-512.png" alt="" />
          <div>
            <h1>Quran Studio</h1>
            <p>Recitation videos for Reels, TikTok and Shorts</p>
          </div>
        </header>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id}
              className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="tab-body">
          {tab === 'passage' && (
            <>
              <button type="button" className="btn surprise" onClick={surprise}>
                Surprise me
                <small>A well-loved passage, reciter, template and background</small>
              </button>
              <Select label="Surah" value={surah} onChange={changeSurah} searchable
                placeholder="Search by name or number"
                options={surahs.map((s) => ({
                  value: s.number,
                  prefix: String(s.number),
                  label: s.englishName,
                  hint: s.name,
                }))} />
              <div className="row">
                <label className="field">
                  <span>From verse</span>
                  <input type="number" min={1} max={to} value={from}
                    onChange={(e) => setFrom(Math.max(1, Math.min(+e.target.value, to)))} />
                </label>
                <label className="field">
                  <span>To verse</span>
                  <input type="number" min={from} max={maxAyah} value={to}
                    onChange={(e) => setTo(Math.max(from, Math.min(+e.target.value, maxAyah)))} />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={basmala} onChange={(e) => setBasmala(e.target.checked)} />
                Start with the Basmala
              </label>

              <Select label="Reciter" value={reciter} searchable placeholder="Search reciters"
                onChange={(id) => {
                  reciterPreview.stop();
                  setReciter(id);
                }}
                onClose={reciterPreview.stop}
                options={RECITERS.map((r) => ({ value: r.id, label: r.latin, hint: r.name }))}
                renderAction={(o) => {
                  const st = reciterPreview.state?.reciter === o.value ? reciterPreview.state.status : null;
                  return (
                    <button type="button" className={`listen ${st ?? ''}`}
                      aria-label={st ? `Stop ${o.label}` : `Listen to ${o.label}`}
                      title={st ? 'Stop' : 'Listen'}
                      onClick={() => reciterPreview.toggle(o.value)}>
                      {st === 'playing' ? (
                        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>
                      ) : st === 'loading' ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7.5-4.5z" /></svg>
                      )}
                    </button>
                  );
                }} />
              <p className="hint">Press play to hear verse {from} of this surah before choosing.</p>

              <div className="field">
                <span>Reel length</span>
                <div className="segmented">
                  {DURATIONS.map((d) => (
                    <button key={d.label} className={duration === d.value ? 'on' : ''}
                      onClick={() => setDuration(d.value)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={series && duration !== null} disabled={duration === null}
                  onChange={(e) => setSeries(e.target.checked)} />
                Split into a series{duration !== null ? ` of ${duration}s reels` : ''}
              </label>
              <p className="hint">
                {duration === null
                  ? 'Pick a reel length to split a long passage into parts.'
                  : 'Export makes Part 1, Part 2… so the whole passage fits in several reels. Your browser may ask to allow multiple downloads.'}
              </p>
            </>
          )}

          {tab === 'template' && (
            <>
              {HOOKS[style.template] && (
                <div className="field">
                  <label className="field">
                    <span>Headline</span>
                    <input dir="auto" value={style.hook} onChange={(e) => set('hook', e.target.value)} />
                  </label>
                  <div className="chips">
                    {HOOKS[style.template].map((hk) => (
                      <button key={hk} type="button" dir="auto" className={style.hook === hk ? 'chip on' : 'chip'}
                        onClick={() => set('hook', hk)}>
                        {hk}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <TemplatePicker style={style} timeline={timeline}
                meta={{ surahName: meta?.name ?? '', reciterName: reciterMeta.name }}
                background={() => stillBackground(live.current)}
                onPick={pickTemplate} />
            </>
          )}

          {tab === 'background' && (
            <>
              <BackgroundPicker
                selectedIds={multi ? clips.map((c) => c.id) : [bgId]}
                loading={bgLoading}
                onPick={pickVideo}
                onUpload={onUpload}
                multi={multi}
                onMultiChange={changeMulti}
                switchMode={switchMode}
                onSwitchModeChange={setSwitchMode}
              />
              <label className="field">
                <span>Dim background ({Math.round(style.overlay * 100)}%)</span>
                <input type="range" min={0} max={0.85} step={0.05} value={style.overlay}
                  onChange={(e) => set('overlay', +e.target.value)} />
              </label>
              <label className="field">
                <span>Blur background ({style.blur}px)</span>
                <input type="range" min={0} max={24} step={1} value={style.blur}
                  onChange={(e) => set('blur', +e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={style.kenBurns} onChange={(e) => set('kenBurns', e.target.checked)} />
                Slow zoom and drift (Ken Burns)
              </label>
            </>
          )}

          {tab === 'text' && (
            <>
              <div className="field">
                <span>Arabic font</span>
                <div className="fonts">
                  {FONTS.map((f) => (
                    <button key={f.id} className={style.fontFamily === f.id ? 'font on' : 'font'}
                      onClick={() => set('fontFamily', f.id)}>
                      <span lang="ar" style={{ fontFamily: `"${f.id}"` }}>بِسْمِ ٱللَّهِ</span>
                      <small>{f.label}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Font size ({style.fontSize}px)</span>
                <input type="range" min={48} max={130} step={2} value={style.fontSize}
                  onChange={(e) => set('fontSize', +e.target.value)} />
              </label>
              <div className="row">
                <label className="field color">
                  <span>Verse color</span>
                  <input type="color" value={style.textColor} onChange={(e) => set('textColor', e.target.value)} />
                </label>
                <label className="field color">
                  <span>Title color</span>
                  <input type="color" value={style.accentColor} onChange={(e) => set('accentColor', e.target.value)} />
                </label>
                {style.karaoke && (
                  <label className="field color">
                    <span>Highlight</span>
                    <input type="color" value={style.highlightColor}
                      onChange={(e) => set('highlightColor', e.target.value)} />
                  </label>
                )}
              </div>
              <div className="field">
                <span>Animation</span>
                <div className="segmented">
                  {ANIMATIONS.map((a) => (
                    <button key={a.id} className={style.animation === a.id ? 'on' : ''}
                      onClick={() => set('animation', a.id)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={style.karaoke} onChange={(e) => set('karaoke', e.target.checked)} />
                Highlight each word as it's recited
              </label>
              {style.karaoke && (
                <p className="hint">
                  {hasWordTimings(reciter)
                    ? 'Word timings come from quran.com for this reciter.'
                    : `This reciter has no word timings, so the highlight is estimated. For exact timing pick ${WORD_TIMING_RECITERS.join(', ')}.`}
                </p>
              )}
              <div className="field">
                <span>Verse position</span>
                <div className="segmented">
                  <button className={style.position === 'center' ? 'on' : ''} onClick={() => set('position', 'center')}>
                    Center
                  </button>
                  <button className={style.position === 'lower' ? 'on' : ''} onClick={() => set('position', 'lower')}>
                    Lower third
                  </button>
                </div>
              </div>
              <Select label="Translation" value={translation} onChange={setTranslation}
                options={TRANSLATIONS.map((t) => ({ value: t.id, label: t.label }))} />
              <label className="check">
                <input type="checkbox" checked={style.showHeader} onChange={(e) => set('showHeader', e.target.checked)} />
                Show surah and reciter name
              </label>
              <label className="check">
                <input type="checkbox" checked={style.showAyahNumber}
                  onChange={(e) => set('showAyahNumber', e.target.checked)} />
                Show verse numbers
              </label>
              <label className="check">
                <input type="checkbox" checked={style.showProgress}
                  onChange={(e) => set('showProgress', e.target.checked)} />
                Show progress bar
              </label>
            </>
          )}

          {tab === 'publish' && (
            <>
              <section className="group">
                <h2>Presets</h2>
                <Presets
                  current={{
                    style,
                    reciter,
                    translation,
                    bgId: multi ? clips[0]?.id : bgId && bgId !== 'upload' ? bgId : undefined,
                  }}
                  onApply={applyPreset} />
              </section>

              <section className="group">
                <h2>Video</h2>
                <div className="field">
                  <span>Format</span>
                  <div className="segmented">
                    {(Object.keys(FORMATS) as Format[]).map((f) => (
                      <button key={f} className={style.format === f ? 'on' : ''} title={FORMATS[f].hint}
                        onClick={() => set('format', f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <p className="hint">{FORMATS[style.format].hint}, {FORMATS[style.format].w}×{FORMATS[style.format].h}</p>
                </div>
                <label className="check">
                  <input type="checkbox" checked={style.intro} onChange={(e) => set('intro', e.target.checked)} />
                  Open with a title card ({INTRO}s)
                </label>
                <label className="check">
                  <input type="checkbox" checked={!!style.outro}
                    onChange={(e) => set('outro', e.target.checked ? OUTRO_TEXT : '')} />
                  End with a closing card ({OUTRO}s)
                </label>
                {!!style.outro && (
                  <label className="field">
                    <span>Closing text</span>
                    <input dir="auto" value={style.outro} onChange={(e) => set('outro', e.target.value)}
                      onBlur={(e) => !e.target.value.trim() && set('outro', OUTRO_TEXT)} />
                  </label>
                )}
                <div className="field">
                  <span>Cover image</span>
                  <button type="button" className="btn" onClick={saveCover}>Save cover as PNG</button>
                  <p className="hint">The first verse on your background, for the reel's cover photo.</p>
                </div>
                <label className="field">
                  <span>Watermark</span>
                  <input placeholder="@youraccount" value={style.watermark}
                    onChange={(e) => set('watermark', e.target.value)} />
                </label>
              </section>

              <section className="group">
                <h2>Caption</h2>
                <CaptionBox
                  surah={surah}
                  surahName={meta?.englishName ?? ''}
                  surahArabic={meta?.name ?? ''}
                  from={from}
                  to={to}
                  reciterLatin={reciterMeta.latin}
                  reciterArabic={reciterMeta.name}
                  translation={translation} />
              </section>
            </>
          )}
        </div>
      </aside>

      <main className="stage">
        <div className={style.format === '9:16' ? 'mihrab' : 'mihrab flat'}
          style={{ '--ar': fmt.w / fmt.h } as React.CSSProperties}>
          <canvas ref={canvasRef} width={fmt.w} height={fmt.h} aria-label="Reel preview" />
        </div>
        <div className="actions">
          <button className="btn" onClick={preview} disabled={busy === 'loading' || busy === 'exporting'}>
            {busy === 'playing' ? 'Stop' : busy === 'loading' ? 'Loading…' : 'Play preview'}
          </button>
          <button className="btn primary" onClick={exportReel} disabled={busy !== ''}>
            {series && duration !== null ? 'Export series' : 'Export video'}
          </button>
        </div>
        <label className="check guides">
          <input type="checkbox" checked={safeZones} onChange={(e) => setSafeZones(e.target.checked)} />
          Show app safe zones (preview only)
        </label>
        <p className="status" aria-live="polite">
          {stale && timeline ? 'Settings changed. The next preview reloads the recitation. ' : ''}
          {status}
        </p>
      </main>

      {job && <ExportDialog job={job} onCancel={cancelExport} onClose={() => setJob(null)} />}
    </div>
  );
}
