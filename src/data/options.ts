// Reciter folders on everyayah.com (CORS-enabled, one mp3 per ayah).
export interface Reciter {
  id: string;
  name: string;
  latin: string;
}

export const RECITERS: Reciter[] = [
  { id: 'Alafasy_128kbps', name: 'مشاري راشد العفاسي', latin: 'Mishary Alafasy' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'عبد الباسط عبد الصمد', latin: 'Abdul Basit (Murattal)' },
  { id: 'Husary_128kbps', name: 'محمود خليل الحصري', latin: 'Al-Husary' },
  { id: 'Minshawy_Murattal_128kbps', name: 'محمد صديق المنشاوي', latin: 'Al-Minshawy' },
  { id: 'MaherAlMuaiqly128kbps', name: 'ماهر المعيقلي', latin: 'Maher Al-Muaiqly' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'عبد الرحمن السديس', latin: 'As-Sudais' },
  { id: 'Saood_ash-Shuraym_128kbps', name: 'سعود الشريم', latin: 'Ash-Shuraym' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'ياسر الدوسري', latin: 'Yasser Ad-Dossary' },
  { id: 'Nasser_Alqatami_128kbps', name: 'ناصر القطامي', latin: 'Nasser Al-Qatami' },
  { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'أبو بكر الشاطري', latin: 'Ash-Shaatree' },
  { id: 'Hani_Rifai_192kbps', name: 'هاني الرفاعي', latin: 'Hani Ar-Rifai' },
  { id: 'Muhammad_Ayyoub_128kbps', name: 'محمد أيوب', latin: 'Muhammad Ayyoub' },
  { id: 'Ghamadi_40kbps', name: 'سعد الغامدي', latin: 'Saad Al-Ghamdi' },
  { id: 'warsh/warsh_ibrahim_aldosary_128kbps', name: 'إبراهيم الدوسري (ورش)', latin: 'Ibrahim Al-Dosary (Warsh)' },
];

// All loaded from Google Fonts in index.html.
export const FONTS = [
  { id: 'Amiri Quran', label: 'Amiri Quran' },
  { id: 'Amiri', label: 'Amiri' },
  { id: 'Scheherazade New', label: 'Scheherazade' },
  { id: 'Noto Naskh Arabic', label: 'Naskh' },
  { id: 'Lateef', label: 'Lateef' },
  { id: 'Reem Kufi', label: 'Reem Kufi' },
  { id: 'Noto Kufi Arabic', label: 'Kufi' },
  { id: 'Aref Ruqaa', label: 'Ruqaa' },
];

// Arabic-script editions are detected in the renderer and drawn right-to-left.
export const TRANSLATIONS = [
  { id: '', label: 'No translation' },
  { id: 'ar.muyassar', label: 'Tafsir Al-Muyassar (Arabic)' },
  { id: 'en.sahih', label: 'English (Sahih Intl)' },
  { id: 'fr.hamidullah', label: 'Français (Hamidullah)' },
  { id: 'es.cortes', label: 'Español (Cortés)' },
  { id: 'id.indonesian', label: 'Bahasa Indonesia' },
  { id: 'tr.diyanet', label: 'Türkçe (Diyanet)' },
  { id: 'ur.jalandhry', label: 'اردو (Jalandhry)' },
];

export const GRADIENTS: { id: string; colors: [string, string] }[] = [
  { id: 'night', colors: ['#0f2027', '#2c5364'] },
  { id: 'emerald', colors: ['#022c22', '#0f766e'] },
  { id: 'dusk', colors: ['#1e1b4b', '#9d174d'] },
  { id: 'desert', colors: ['#3b1d0a', '#b45309'] },
  { id: 'ink', colors: ['#000000', '#1f2937'] },
];

export const DURATIONS: { label: string; value: number | null }[] = [
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '120s', value: 120 },
  { label: 'Full', value: null },
];
