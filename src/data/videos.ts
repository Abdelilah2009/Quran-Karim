// Free nature clips from Mixkit (Mixkit License: free for commercial use, no
// attribution required). Served with CORS headers, so the canvas stays
// untainted and can be recorded.
export interface StockVideo {
  id: string;
  category: string;
  title: string;
  src: string;
  thumb: string;
}

export const VIDEO_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'waterfall', label: 'Waterfalls' },
  { id: 'sea', label: 'Sea' },
  { id: 'sky', label: 'Sky' },
  { id: 'forest', label: 'Forest' },
  { id: 'mountain', label: 'Mountains' },
  { id: 'rain', label: 'Rain' },
  { id: 'flowers', label: 'Flowers' },
  { id: 'animals', label: 'Animals' },
];

export const STOCK_VIDEOS: StockVideo[] = [
  { id: 'mx-100174', category: 'waterfall', title: 'Waterfall between green hills', src: 'https://assets.mixkit.co/active_storage/video_items/100174/1721166924/100174-video-720.mp4', thumb: 'https://assets.mixkit.co/active_storage/video_items/100174/1721166924/100174-video-thumb-360-0.jpg' },
  { id: 'mx-2213', category: 'waterfall', title: 'Waterfall in forest', src: 'https://assets.mixkit.co/videos/2213/2213-720.mp4', thumb: 'https://assets.mixkit.co/videos/2213/2213-thumb-360-0.jpg' },
  { id: 'mx-50566', category: 'waterfall', title: 'Tropical waterfall in sunlight', src: 'https://assets.mixkit.co/videos/50566/50566-720.mp4', thumb: 'https://assets.mixkit.co/videos/50566/50566-thumb-360-0.jpg' },
  { id: 'mx-10993', category: 'waterfall', title: 'Dreamlike forest waterfalls', src: 'https://assets.mixkit.co/videos/10993/10993-720.mp4', thumb: 'https://assets.mixkit.co/videos/10993/10993-thumb-360-0.jpg' },
  { id: 'mx-11060', category: 'waterfall', title: 'Iguazu Falls', src: 'https://assets.mixkit.co/videos/11060/11060-720.mp4', thumb: 'https://assets.mixkit.co/videos/11060/11060-thumb-360-0.jpg' },
  { id: 'mx-45315', category: 'waterfall', title: 'Waterfall with moss', src: 'https://assets.mixkit.co/videos/45315/45315-720.mp4', thumb: 'https://assets.mixkit.co/videos/45315/45315-thumb-360-0.jpg' },
  { id: 'mx-1164', category: 'sea', title: 'Waves in the water', src: 'https://assets.mixkit.co/videos/1164/1164-720.mp4', thumb: 'https://assets.mixkit.co/videos/1164/1164-thumb-360-0.jpg' },
  { id: 'mx-51500', category: 'sea', title: 'Turquoise waves on the beach', src: 'https://assets.mixkit.co/videos/51500/51500-720.mp4', thumb: 'https://assets.mixkit.co/videos/51500/51500-thumb-360-0.jpg' },
  { id: 'mx-2168', category: 'sea', title: 'Orange sunset on the beach', src: 'https://assets.mixkit.co/videos/2168/2168-720.mp4', thumb: 'https://assets.mixkit.co/videos/2168/2168-thumb-360-0.jpg' },
  { id: 'mx-4119', category: 'sea', title: 'Sunset over the sea', src: 'https://assets.mixkit.co/videos/4119/4119-720.mp4', thumb: 'https://assets.mixkit.co/videos/4119/4119-thumb-360-0.jpg' },
  { id: 'mx-51506', category: 'sea', title: 'Waves crashing on rocks', src: 'https://assets.mixkit.co/videos/51506/51506-720.mp4', thumb: 'https://assets.mixkit.co/videos/51506/51506-thumb-360-0.jpg' },
  { id: 'mx-1170', category: 'sea', title: 'Sun over palm trees', src: 'https://assets.mixkit.co/videos/1170/1170-720.mp4', thumb: 'https://assets.mixkit.co/videos/1170/1170-thumb-360-0.jpg' },
  { id: 'mx-21585', category: 'sky', title: 'Clouds racing in the wind', src: 'https://assets.mixkit.co/videos/21585/21585-720.mp4', thumb: 'https://assets.mixkit.co/videos/21585/21585-thumb-360-0.jpg' },
  { id: 'mx-26108', category: 'sky', title: 'Clouds drifting in blue sky', src: 'https://assets.mixkit.co/videos/26108/26108-720.mp4', thumb: 'https://assets.mixkit.co/videos/26108/26108-thumb-360-0.jpg' },
  { id: 'mx-4695', category: 'sky', title: 'Clouds covering mountains', src: 'https://assets.mixkit.co/videos/4695/4695-720.mp4', thumb: 'https://assets.mixkit.co/videos/4695/4695-thumb-360-0.jpg' },
  { id: 'mx-3350', category: 'sky', title: 'Moon over a snowy forest', src: 'https://assets.mixkit.co/videos/3350/3350-720.mp4', thumb: 'https://assets.mixkit.co/videos/3350/3350-thumb-360-0.jpg' },
  { id: 'mx-50847', category: 'forest', title: 'Tranquil sunny forest', src: 'https://assets.mixkit.co/videos/50847/50847-720.mp4', thumb: 'https://assets.mixkit.co/videos/50847/50847-thumb-360-0.jpg' },
  { id: 'mx-51791', category: 'forest', title: 'Forest and distant mountains', src: 'https://assets.mixkit.co/videos/51791/51791-720.mp4', thumb: 'https://assets.mixkit.co/videos/51791/51791-thumb-360-0.jpg' },
  { id: 'mx-5040', category: 'forest', title: 'Giant green forest', src: 'https://assets.mixkit.co/videos/5040/5040-720.mp4', thumb: 'https://assets.mixkit.co/videos/5040/5040-thumb-360-0.jpg' },
  { id: 'mx-51501', category: 'forest', title: 'Green mangrove from above', src: 'https://assets.mixkit.co/videos/51501/51501-720.mp4', thumb: 'https://assets.mixkit.co/videos/51501/51501-thumb-360-0.jpg' },
  { id: 'mx-4132', category: 'mountain', title: 'The Alps', src: 'https://assets.mixkit.co/videos/4132/4132-720.mp4', thumb: 'https://assets.mixkit.co/videos/4132/4132-thumb-360-0.jpg' },
  { id: 'mx-4396', category: 'mountain', title: 'Fog on snowy peaks', src: 'https://assets.mixkit.co/videos/4396/4396-720.mp4', thumb: 'https://assets.mixkit.co/videos/4396/4396-thumb-360-0.jpg' },
  { id: 'mx-4281', category: 'mountain', title: 'Matterhorn', src: 'https://assets.mixkit.co/videos/4281/4281-720.mp4', thumb: 'https://assets.mixkit.co/videos/4281/4281-thumb-360-0.jpg' },
  { id: 'mx-25375', category: 'rain', title: 'Soft rain in sunshine', src: 'https://assets.mixkit.co/videos/25375/25375-720.mp4', thumb: 'https://assets.mixkit.co/videos/25375/25375-thumb-360-0.jpg' },
  { id: 'mx-6890', category: 'rain', title: 'Tropical forest rain', src: 'https://assets.mixkit.co/videos/6890/6890-720.mp4', thumb: 'https://assets.mixkit.co/videos/6890/6890-thumb-360-0.jpg' },
  { id: 'mx-18312', category: 'rain', title: 'Rain on a lake', src: 'https://assets.mixkit.co/videos/18312/18312-720.mp4', thumb: 'https://assets.mixkit.co/videos/18312/18312-thumb-360-0.jpg' },
  { id: 'mx-1168', category: 'flowers', title: 'Pink flowers in the breeze', src: 'https://assets.mixkit.co/videos/1168/1168-720.mp4', thumb: 'https://assets.mixkit.co/videos/1168/1168-thumb-360-0.jpg' },
  { id: 'mx-1187', category: 'flowers', title: 'White flowers in the breeze', src: 'https://assets.mixkit.co/videos/1187/1187-720.mp4', thumb: 'https://assets.mixkit.co/videos/1187/1187-thumb-360-0.jpg' },
  { id: 'mx-1173', category: 'flowers', title: 'Tree with yellow flowers', src: 'https://assets.mixkit.co/videos/1173/1173-720.mp4', thumb: 'https://assets.mixkit.co/videos/1173/1173-thumb-360-0.jpg' },
  { id: 'mx-4881', category: 'flowers', title: 'Sunflower field', src: 'https://assets.mixkit.co/videos/4881/4881-720.mp4', thumb: 'https://assets.mixkit.co/videos/4881/4881-thumb-360-0.jpg' },
  { id: 'mx-45581', category: 'animals', title: 'Sea birds at sunset', src: 'https://assets.mixkit.co/videos/45581/45581-720.mp4', thumb: 'https://assets.mixkit.co/videos/45581/45581-thumb-360-0.jpg' },
  { id: 'mx-1706', category: 'animals', title: 'Eagle gliding', src: 'https://assets.mixkit.co/videos/1706/1706-720.mp4', thumb: 'https://assets.mixkit.co/videos/1706/1706-thumb-360-0.jpg' },
  { id: 'mx-17978', category: 'animals', title: 'Flock of seagulls', src: 'https://assets.mixkit.co/videos/17978/17978-720.mp4', thumb: 'https://assets.mixkit.co/videos/17978/17978-thumb-360-0.jpg' },
  { id: 'mx-4285', category: 'animals', title: 'Camels in the desert', src: 'https://assets.mixkit.co/videos/4285/4285-720.mp4', thumb: 'https://assets.mixkit.co/videos/4285/4285-thumb-360-0.jpg' },
  { id: 'mx-4682', category: 'animals', title: 'Swans on a river', src: 'https://assets.mixkit.co/videos/4682/4682-720.mp4', thumb: 'https://assets.mixkit.co/videos/4682/4682-thumb-360-0.jpg' },
  { id: 'mx-44974', category: 'animals', title: 'Tropical fish on a reef', src: 'https://assets.mixkit.co/videos/44974/44974-720.mp4', thumb: 'https://assets.mixkit.co/videos/44974/44974-thumb-360-0.jpg' },
  { id: 'mx-16165', category: 'animals', title: 'White flamingos', src: 'https://assets.mixkit.co/videos/16165/16165-720.mp4', thumb: 'https://assets.mixkit.co/videos/16165/16165-thumb-360-0.jpg' },
  { id: 'mx-2560', category: 'animals', title: 'Bird singing in a tree', src: 'https://assets.mixkit.co/videos/2560/2560-720.mp4', thumb: 'https://assets.mixkit.co/videos/2560/2560-thumb-360-0.jpg' },
];
