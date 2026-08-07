export const LANGUAGE_OPTIONS = [
  { id: 'english', label: '🇺🇸 اللغة الإنجليزية', emoji: '🇺🇸' },
  { id: 'french', label: '🇫🇷 اللغة الفرنسية', emoji: '🇫🇷' },
  { id: 'spanish', label: '🇪🇸 اللغة الإسبانية', emoji: '🇪🇸' },
  { id: 'amazigh', label: '🇲🇦 اللغة الأمازيغية', emoji: '🇲🇦' },
];

export const LANGUAGE_LABELS = {
  english: 'اللغة الإنجليزية',
  french: 'اللغة الفرنسية',
  spanish: 'اللغة الإسبانية',
  amazigh: 'اللغة الأمازيغية',
};

export const DEFAULT_REMINDERS = [
  { id: 'morning', label: 'تذكير صباحي بالتركيز', time: '08:00', enabled: true },
  { id: 'review', label: 'تذكير بمراجعة القرآن', time: '20:00', enabled: true },
  { id: 'reading', label: 'تذكير بالقراءة', time: '22:00', enabled: false },
];

export const getLanguageLabel = (langId) => LANGUAGE_LABELS[langId] || LANGUAGE_LABELS.english;
