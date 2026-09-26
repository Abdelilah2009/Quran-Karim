import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { BackgroundPicker } from './components/BackgroundPicker';
import { ExportDialog, type ExportJob } from './components/ExportDialog';
import { Select } from './components/Select';
import { DURATIONS, FONTS, GRADIENTS, RECITERS, TRANSLATIONS } from './data/options';
import { STOCK_VIDEOS, type StockVideo } from './data/videos';
import { getAudioContext, loadAyahAudio } from './lib/audio';
import { playTimeline, recordReel, type Playback } from './lib/engine';
import { createVideo, downloadVideo, seekToStart } from './lib/media';
import { BASMALA, getAyat, getSurahs, type SurahMeta } from './lib/quran';
import { clipAt, type SwitchMode } from './lib/playlist';
import { drawFrame, H, W, type Background, type Style } from './lib/renderer';
import { useReciterPreview } from './lib/useReciterPreview';
import { buildTimeline, type Timeline } from './lib/timeline';

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
};

type Tab = 'passage' | 'background' | 'text';
const TABS: { id: Tab; label: string }[] = [
  { id: 'passage', label: 'Passage' },
  { id: 'background', label: 'Background' },
  { id: 'text', label: 'Text' },
];

// Overall export progress is split across phases.
const SPLIT = { audio: 0.15, background: 0.2, recording: 0.97 };

type LiveState = {
  bg: Background;
  timeline: Timeline | null;
  multi: boolean;
  clips: { id: string; el: HTMLVideoElement }[];
  switchMode: SwitchMode;
};

// Resolve what to draw this frame. In multi-clip mode this also plays the
// visible clips and pauses the rest, so off-screen videos don't drift.
function backgroundAt(s: LiveState, t: number, playing: boolean): Background {
  if (!s.multi || !s.clips.length) return s.bg;
  if (s.clips.length === 1) {
    const el = s.clips[0].el;
    if (el.paused) void el.play();
    return { kind: 'video', el };
  }
  const clip = clipAt(t, s.clips.length, s.switchMode, s.timeline, playing);
  s.clips.forEach((c, i) => {
    const visible = i === clip.index || (clip.mix > 0 && i === clip.next);
    if (visible && c.el.paused) void c.el.play();
    else if (!visible && !c.el.paused) c.el.pause();
  });
  return { kind: 'playlist', els: s.clips.map((c) => c.el), clip };
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
  const [bg, setBg] = useState<Background>({ kind: 'gradient', colors: GRADIENTS[4].colors });
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef<Playback | null>(null);
  const cancelledRef = useRef(false);
  const live = useRef({ style, bg, timeline, surahName: '', reciterName: '', multi, clips, switchMode });
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
  };

  const key = useMemo(
    () => JSON.stringify({ surah, from, to, reciter, duration, basmala, translation }),
    [surah, from, to, reciter, duration, basmala, translation],
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
        { surahName: s.surahName, reciterName: s.reciterName }, bgT);
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

  async function prepare(onProgress?: (p: number) => void): Promise<Timeline> {
    if (!stale && timeline) {
      onProgress?.(1);
      return timeline;
    }
    getAudioContext();
    setStatus('Loading verses…');
    const ayat = await getAyat(surah, from, to, translation);
    const queue = [
      ...(basmala && from === 1 && surah !== 1 && surah !== 9
        ? [{ surah, ayah: 0, audioSurah: 1, audioAyah: 1, text: BASMALA, translation: undefined as string | undefined }]
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

    // Load in small batches; stop once there is clearly enough audio for the target.
    const items: ((typeof queue)[number] & { buffer: AudioBuffer })[] = [];
    let total = 0;
    for (let i = 0; i < queue.length; i += 5) {
      const batch = queue.slice(i, i + 5);
      const buffers = await Promise.all(batch.map((q) => loadAyahAudio(reciter, q.audioSurah, q.audioAyah)));
      batch.forEach((q, j) => {
        items.push({ ...q, buffer: buffers[j] });
        total += buffers[j].duration;
      });
      onProgress?.(items.length / queue.length);
      setStatus(`Loading recitation ${items.length} of ${queue.length}…`);
      if (duration !== null && total > duration * 1.25 + 10) break;
    }
    onProgress?.(1);

    const tl = buildTimeline(items, duration);
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

  async function exportReel() {
    cancelledRef.current = false;
    setBusy('exporting');
    setJob({ phase: 'audio', progress: 0 });
    let ticker = 0;
    try {
      const tl = await prepare((p) => setJob({ phase: 'audio', progress: p * SPLIT.audio }));
      if (cancelledRef.current) throw new Error('cancelled');

      setJob({ phase: 'background', progress: SPLIT.audio });
      await document.fonts.ready;
      await rewindBackground();
      if (cancelledRef.current) throw new Error('cancelled');

      const { blob, ext } = await recordReel(canvasRef.current!, tl, (pb) => {
        playbackRef.current = pb;
        ticker = window.setInterval(() => {
          const elapsed = Math.max(0, Math.min(pb.time(), tl.duration));
          const p = SPLIT.background + (elapsed / tl.duration) * (SPLIT.recording - SPLIT.background);
          setJob({ phase: 'recording', progress: p, elapsed, total: tl.duration });
        }, 100);
      });
      clearInterval(ticker);
      if (cancelledRef.current) throw new Error('cancelled');

      setJob({ phase: 'saving', progress: 0.99 });
      const url = URL.createObjectURL(blob);
      const fileName = `quran-${surah}-${from}-${to}.${ext}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setJob({ phase: 'done', progress: 1, url, fileName, sizeMb: blob.size / 1e6 });
    } catch (e) {
      clearInterval(ticker);
      const msg = (e as Error).message;
      setJob(msg === 'cancelled' ? null : { phase: 'error', progress: 0, message: msg });
    } finally {
      playbackRef.current = null;
      setBusy('');
    }
  }

  function cancelExport() {
    cancelledRef.current = true;
    playbackRef.current?.stop();
    setJob(null);
  }

  const set = <K extends keyof Style>(k: K, v: Style[K]) => setStyle((s) => ({ ...s, [k]: v }));
  const maxAyah = meta?.numberOfAyahs ?? 7;

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
              </div>
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
              <label className="field">
                <span>Watermark</span>
                <input placeholder="@youraccount" value={style.watermark}
                  onChange={(e) => set('watermark', e.target.value)} />
              </label>
            </>
          )}
        </div>
      </aside>

      <main className="stage">
        <div className="mihrab">
          <canvas ref={canvasRef} width={W} height={H} aria-label="Reel preview" />
        </div>
        <div className="actions">
          <button className="btn" onClick={preview} disabled={busy === 'loading' || busy === 'exporting'}>
            {busy === 'playing' ? 'Stop' : busy === 'loading' ? 'Loading…' : 'Play preview'}
          </button>
          <button className="btn primary" onClick={exportReel} disabled={busy !== ''}>
            Export video
          </button>
        </div>
        <p className="status" aria-live="polite">
          {stale && timeline ? 'Settings changed. The next preview reloads the recitation. ' : ''}
          {status}
        </p>
      </main>

      {job && <ExportDialog job={job} onCancel={cancelExport} onClose={() => setJob(null)} />}
    </div>
  );
}
