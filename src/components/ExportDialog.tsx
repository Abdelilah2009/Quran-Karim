export type ExportPhase = 'audio' | 'background' | 'recording' | 'saving' | 'done' | 'error';

export interface ExportJob {
  phase: ExportPhase;
  progress: number; // 0..1 overall
  elapsed?: number; // recording seconds done
  total?: number; // reel length
  message?: string;
  url?: string;
  fileName?: string;
  sizeMb?: number;
  realtime?: boolean; // MediaRecorder fallback: records at 1x speed
  part?: { index: number; total: number }; // series export
}

const STEPS: { phase: ExportPhase; label: string }[] = [
  { phase: 'audio', label: 'Loading the recitation' },
  { phase: 'background', label: 'Preparing the background' },
  { phase: 'recording', label: 'Rendering the video' },
  { phase: 'saving', label: 'Saving the file' },
];

const R = 54;
const C = 2 * Math.PI * R;

interface Props {
  job: ExportJob;
  onCancel: () => void;
  onClose: () => void;
}

export function ExportDialog({ job, onCancel, onClose }: Props) {
  const pct = Math.round(job.progress * 100);
  const current = STEPS.findIndex((s) => s.phase === job.phase);
  const finished = job.phase === 'done';
  const failed = job.phase === 'error';

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="dialog">
        <h2 id="export-title">
          {finished
            ? job.part ? `Your ${job.part.total} reels are ready` : 'Your reel is ready'
            : failed ? 'Export stopped' : job.part ? `Exporting part ${job.part.index} of ${job.part.total}` : 'Exporting your reel'}
        </h2>

        {finished && job.url ? (
          <video className="result" src={job.url} controls playsInline />
        ) : (
          <div className="ring" aria-live="polite">
            <svg viewBox="0 0 128 128" aria-hidden="true">
              <circle className="track" cx="64" cy="64" r={R} />
              <circle className="bar" cx="64" cy="64" r={R}
                strokeDasharray={C} strokeDashoffset={C * (1 - job.progress)} />
            </svg>
            <span className="ring-value">
              {pct}
              <small>%</small>
            </span>
          </div>
        )}

        {!finished && !failed && (
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.phase} className={i < current ? 'done' : i === current ? 'active' : ''}>
                {s.label}
                {s.phase === 'recording' && i === current && job.total ? (
                  <span className="step-meta">
                    {Math.floor(job.elapsed ?? 0)}s of {Math.ceil(job.total)}s
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {job.phase === 'recording' && job.realtime && (
          <p className="hint center">Keep this tab open. Recording runs in real time.</p>
        )}
        {failed && <p className="error center">{job.message}</p>}
        {finished && (
          <p className="hint center">
            {job.part ? 'Last part saved as' : 'Saved as'} {job.fileName} ({job.sizeMb?.toFixed(1)} MB)
          </p>
        )}

        <div className="dialog-actions">
          {finished && job.url ? (
            <>
              <button className="btn" onClick={onClose}>Close</button>
              <a className="btn primary" href={job.url} download={job.fileName}>Download again</a>
            </>
          ) : failed ? (
            <button className="btn" onClick={onClose}>Close</button>
          ) : (
            <button className="btn" onClick={onCancel}>Cancel export</button>
          )}
        </div>
      </div>
    </div>
  );
}
