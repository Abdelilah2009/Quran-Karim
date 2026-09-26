const blobCache = new Map<string, string>();

/**
 * Download a remote video fully into a blob URL, reporting progress 0..1.
 * A blob URL is same-origin (the canvas never gets tainted) and never
 * stalls to buffer mid-export.
 */
export async function downloadVideo(url: string, onProgress: (p: number) => void): Promise<string> {
  const hit = blobCache.get(url);
  if (hit) {
    onProgress(1);
    return hit;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error("Couldn't download this video. Try another one.");
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  const objectUrl = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'video/mp4' }));
  blobCache.set(url, objectUrl);
  onProgress(1);
  return objectUrl;
}

export function createVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    Object.assign(el, { muted: true, loop: true, playsInline: true, preload: 'auto' });
    el.onloadeddata = () => {
      void el.play();
      resolve(el);
    };
    el.onerror = () => reject(new Error("This video format can't be played in your browser."));
    el.src = src;
  });
}

export function seekToStart(el: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (el.currentTime === 0) return resolve();
    el.onseeked = () => resolve();
    el.currentTime = 0;
  });
}
