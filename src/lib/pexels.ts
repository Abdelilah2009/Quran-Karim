import type { StockVideo } from '../data/videos';

interface PexelsFile {
  link: string;
  file_type: string;
  width: number;
  height: number;
}

interface PexelsVideo {
  id: number;
  image: string;
  url: string;
  user: { name: string };
  video_files: PexelsFile[];
}

export const PEXELS_KEY_STORAGE = 'pexels-api-key';

// Portrait search; pick the mp4 closest to 720px wide (sharp enough for 1080x1920
// once scaled, light enough to download quickly).
export async function searchPexels(apiKey: string, query: string): Promise<StockVideo[]> {
  const params = new URLSearchParams({ query, orientation: 'portrait', per_page: '24' });
  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (res.status === 401) throw new Error('Pexels rejected this API key. Check it and try again.');
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}).`);
  const data: { videos: PexelsVideo[] } = await res.json();

  return data.videos.flatMap((v) => {
    const files = v.video_files.filter((f) => f.file_type === 'video/mp4' && f.link.includes('pexels.com'));
    if (!files.length) return [];
    const best = files.reduce((a, b) => (Math.abs(b.width - 720) < Math.abs(a.width - 720) ? b : a));
    return [{ id: `px-${v.id}`, category: 'pexels', title: `By ${v.user.name}`, src: best.link, thumb: v.image }];
  });
}
