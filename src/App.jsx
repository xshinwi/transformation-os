import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import {
  Home, GraduationCap, BookOpen, Languages, Library, Settings as SettingsIcon,
  Moon, Sun, Plus, Trash2, ChevronRight, ChevronLeft, Flame, Sparkles, Play, Award, CheckCircle2, Bookmark
} from 'lucide-react';
import { calculateMomentumScore, daysBetween, ensureDailyState, formatDateLocal, normalizeState, syncConsistency, todayISO } from './utils/appLogic.js';
import { DEFAULT_REMINDERS, getLanguageLabel, LANGUAGE_OPTIONS } from './utils/constants.js';
import DailyCalendar from './components/DailyCalendar.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

/* ============================================================
   1. STORAGE LAYER — IndexedDB
   ============================================================ */
const DB_NAME = 'transformation_os_db';
const STORE_NAME = 'kv';
const STATE_KEY = 'app_state_v1';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const r = tx.objectStore(STORE_NAME).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch (e) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { return false; }
}

/* ============================================================
   2. DATE / MATH / SRS UTILITIES
   ============================================================ */
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const SRS_INTERVALS = [1, 2, 4, 7, 15, 30];
function srsSchedule(box) {
  const d = new Date();
  d.setDate(d.getDate() + SRS_INTERVALS[clamp(box, 0, SRS_INTERVALS.length - 1)]);
  return formatDateLocal(d);
}
function srsPromote(item) {
  const box = clamp(item.box + 1, 0, SRS_INTERVALS.length - 1);
  return { ...item, box, nextReview: srsSchedule(box) };
}
function srsDemote(item) {
  const box = clamp(item.box - 1, 0, SRS_INTERVALS.length - 1);
  return { ...item, box, nextReview: srsSchedule(box) };
}

/* ============================================================
   3. INITIAL STATE
   ============================================================ */
const initialState = {
  meta: {
    onboarded: false,
    userName: '',
    theme: 'light',
    targetLanguage: 'english',
    targetLanguageLabel: 'اللغة الإنجليزية',
    journeyStart: todayISO(),
    journeyEnd: (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return formatDateLocal(d); })(), 
    streak: { current: 0, best: 0, lastActiveDate: null },
    activityDates: [],
  },
  goals: {
    bac: { subjects: [] },
    quran: {
      hifzTotalAthman: 480,
      hifzItems: [],
      moraja: { totalAhzab: 60, cyclePosition: 0, log: [] },
    },
    english: { skillLog: { listening: 0, reading: 0, writing: 0, speaking: 0 }, vocab: [], wordsGoalTotal: 3650, wordsLearned: 0 },
    reading: { books: [], pagesGoalTotal: 7300, pagesRead: 0 },
  },
  mission: {
    baseline: { bacPomodoros: 2, hifzAthman: 1, morajaAhzab: 2, readingPages: 20, englishWords: 10 },
    dailyQuotas: { bacPomodoros: 2, hifzAthman: 1, morajaAhzab: 2, readingPages: 20, englishWords: 10 },
    todayDone: { bacPomodoros: 0, hifzAthman: 0, morajaAhzab: 0, readingPages: 0, englishWords: 0 },
    todayDate: todayISO(),
    momentumScore: 50,
  },
  reminders: DEFAULT_REMINDERS,
};

/* ============================================================
   4. APP CONTEXT & PROVIDER
   ============================================================ */
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

const THEMES = {
  light: {
    '--bg': '#F8F9FA', '--surface': '#FFFFFF', '--ink': '#1F2937', '--muted': '#9CA3AF',
    '--line': '#E5E7EB', '--hover': '#F3F4F6', '--track': '#F1F5F9',
    '--gold': '#C6A87C', '--good': '#7C9473', '--danger': '#E79A9A', '--dangerBg': '#FEF2F2'
  },
  dark: {
    '--bg': '#0F1115', '--surface': '#181A20', '--ink': '#F3F4F6', '--muted': '#6B7280',
    '--line': '#262831', '--hover': '#1F222A', '--track': '#1A1D24',
    '--gold': '#D4AF37', '--good': '#86A77B', '--danger': '#FCA5A5', '--dangerBg': 'rgba(252, 165, 165, 0.1)'
  }
};

function AppProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [reminders, setReminders] = useState(DEFAULT_REMINDERS);
  const saveTimer = useRef(null);

  const updateReminders = useCallback((nextReminders) => {
    setReminders(nextReminders);
    setState(prev => ({ ...prev, reminders: nextReminders }));
  }, []);

  const recalculateMomentum = useCallback((nextState) => {
    const base = nextState || state;
    const nextMomentum = calculateMomentumScore(base);
    if (base.mission.momentumScore !== nextMomentum) {
      base.mission.momentumScore = nextMomentum;
    }
    return base;
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await idbGet(STATE_KEY);
        if (saved) {
          const normalized = normalizeState(saved, initialState);
          const withDailyRoll = ensureDailyState(normalized, todayISO());
          withDailyRoll.mission.momentumScore = calculateMomentumScore(withDailyRoll);
          setState(withDailyRoll);
          if (Array.isArray(withDailyRoll.reminders)) {
            setReminders(withDailyRoll.reminders);
          }
        }
      } catch (error) {
        setStorageError('تعذر تحميل بياناتك المحلية. سيتم استخدام القيم الافتراضية حتى تتوفر البيانات مرة أخرى.');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = { ...state, reminders };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await idbSet(STATE_KEY, snapshot);
      if (!ok) {
        setStorageError('تعذر حفظ التقدم المحلي. حاول مرة أخرى بعد قليل.');
      } else {
        setStorageError(null);
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [state, reminders, loaded]);

  useEffect(() => {
    const theme = THEMES[state.meta.theme] || THEMES.light;
    Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    document.documentElement.style.background = theme['--bg'];
  }, [state.meta.theme]);

  const update = useCallback((fn) => setState(prev => {
    const next = JSON.parse(JSON.stringify(prev));
    const result = fn(next) || next;
    const withDaily = ensureDailyState(recalculateMomentum(result), todayISO());
    const synced = syncConsistency(withDaily, prev);
    return synced;
  }), [recalculateMomentum]);

  return <AppCtx.Provider value={{ state, update, loaded, storageError, reminders, setReminders: updateReminders }}>{children}</AppCtx.Provider>;
}

/* ============================================================
   5. SHARED UI PRIMITIVES
   ============================================================ */
function ProgressBar({ value, colorVar = '--gold', track = '--track' }) {
  return (
    <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: `var(${track})` }}>
      <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${clamp(value, 0, 100)}%`, background: `var(${colorVar})` }} />
    </div>
  );
}

function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-6 shadow-2xl animate-slideUpFade">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-xl bg-[var(--hover)] text-[var(--muted)] hover:text-[var(--ink)]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   6. ONBOARDING
   ============================================================ */
function Onboarding() {
  const { state, update } = useApp();
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('english');
  const [journeyDates, setJourneyDates] = useState({ start: todayISO(), end: initialState.meta.journeyEnd });
  const [subjects, setSubjects] = useState([{ name: '', totalLessons: '' }]);
  const [pace, setPace] = useState({ bacPomodoros: 2, hifzAthman: 1, morajaAhzab: 2, readingPages: 20, englishWords: 10 });

  const toggleTheme = () => {
    update(s => {
      s.meta.theme = s.meta.theme === 'dark' ? 'light' : 'dark';
      return s;
    });
  };

  const finish = () => {
    update((s) => {
      s.meta.userName = userName.trim();
      s.meta.targetLanguage = targetLanguage;
      s.meta.targetLanguageLabel = getLanguageLabel(targetLanguage);
      s.meta.journeyStart = journeyDates.start;
      s.meta.journeyEnd = journeyDates.end;
      s.goals.bac.subjects = subjects.filter(x => x.name.trim()).map((x, i) => ({
        id: `bac_${Date.now()}_${i}`, name: x.name.trim(), totalLessons: Number(x.totalLessons) || 1,
        completedLessons: 0, sessions: [],
      }));
      s.mission.baseline = { ...pace };
      s.mission.dailyQuotas = { ...pace };
      s.meta.onboarded = true;
      return s;
    });
  };

  const steps = [
    {
      title: 'مرحباً بك',
      body: (
        <div className="space-y-6 animate-fadeIn">
          <p className="text-[var(--muted)] leading-relaxed text-center">أهلاً بك في نظام التحول الشخصي. كيف تفضل أن نناديك؟</p>
          <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="اسمك أو لقبك المستعار..." className="input w-full text-center text-lg font-bold py-4" />
        </div>
      ),
      isValid: () => userName.trim().length > 0
    },
    {
      title: 'ما اللغة التي تتعلمها؟',
      body: (
        <div className="space-y-4 animate-fadeIn">
          {LANGUAGE_OPTIONS.map(lang => (
            <button
              key={lang.id}
              onClick={() => setTargetLanguage(lang.id)}
              className={`w-full p-4 rounded-2xl border-2 transition-all text-lg font-arabic font-bold ${
                targetLanguage === lang.id
                  ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]'
                  : 'border-[var(--line)] bg-[var(--hover)] text-[var(--ink)] hover:border-[var(--gold)]'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      ),
      isValid: () => true
    },
    {
      title: 'إطار الرحلة الزمنية',
      body: (
        <div className="space-y-6 animate-fadeIn">
          <p className="text-[var(--muted)] leading-relaxed text-center">متى ستبدأ رحلتك ومتى تريد تحقيق أهدافك؟</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-2 text-center">تاريخ البداية</label>
              <input type="date" value={journeyDates.start} onChange={(e) => setJourneyDates({ ...journeyDates, start: e.target.value })} className="input w-full text-center font-mono" />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-2 text-center">تاريخ النهاية</label>
              <input type="date" value={journeyDates.end} onChange={(e) => setJourneyDates({ ...journeyDates, end: e.target.value })} className="input w-full text-center font-mono" />
            </div>
          </div>
        </div>
      ),
      isValid: () => daysBetween(journeyDates.start, journeyDates.end) > 0
    },
    {
      title: 'مواد البكالوريا الحرة',
      body: (
        <div className="space-y-4 animate-fadeIn">
          {subjects.map((s, i) => (
            <div key={i} className="flex gap-3 items-center min-w-0">
              <input value={s.name} onChange={(e) => { const c = [...subjects]; c[i].name = e.target.value; setSubjects(c); }} placeholder="اسم المادة" className="input flex-1 min-w-0 font-arabic" />
              <input type="number" min="1" value={s.totalLessons} onChange={(e) => { const c = [...subjects]; c[i].totalLessons = e.target.value; setSubjects(c); }} placeholder="الدروس" className="input w-24 shrink-0 font-arabic text-center no-spinner" />
              {subjects.length > 1 && (
                <button onClick={() => setSubjects(subjects.filter((_, idx) => idx !== i))} className="p-3 shrink-0 text-[var(--danger)] bg-[var(--dangerBg)] rounded-xl hover:scale-105 transition-transform" title="حذف"><Trash2 size={18} /></button>
              )}
            </div>
          ))}
          <button onClick={() => setSubjects([...subjects, { name: '', totalLessons: '' }])} className="text-sm font-semibold text-[var(--gold)] flex items-center gap-1 font-arabic"><Plus size={16} /> إضافة مادة</button>
        </div>
      ),
      isValid: () => true
    },
    {
      title: 'الوتيرة اليومية المبدئية',
      body: (
        <div className="space-y-3 animate-fadeIn">
          {[
            { key: 'bacPomodoros', label: 'حصص بومودورو للباك', hint: 'كم عدد جلسات التركيز التي تنوي إنجازها اليوم؟' },
            { key: 'hifzAthman', label: 'أثمان حفظ جديدة', hint: 'كم عدد الأثمان الجديدة التي تريد حفظها اليوم؟' },
            { key: 'morajaAhzab', label: 'أحزاب مراجعة', hint: 'كم عدد الأحزاب التي تود مراجعتها اليوم؟' },
            { key: 'readingPages', label: 'صفحات قراءة', hint: 'كم عدد الصفحات التي تنوي قراءتها اليوم؟' },
            { key: 'englishWords', label: `كلمات ${targetLanguageLabel || 'إنجليزية'}`, hint: 'عدد الكلمات الجديدة التي ستضيفها إلى بنك المفردات اليوم.' }
          ].map(({ key, label, hint }) => (
            <div key={key} className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--hover)] border border-[var(--line)]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--ink)]">{label}</span>
                <input type="number" min="0" value={pace[key]} onChange={(e) => {
                  const nextValue = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                  setPace({ ...pace, [key]: nextValue });
                }} className="input w-24 text-center !p-2 font-mono no-spinner" />
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed">{hint}</p>
            </div>
          ))}
        </div>
      ),
      isValid: () => true
    }
  ];

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (steps[step].isValid()) {
        if (step < steps.length - 1) {
          setStep(step + 1);
        } else {
          finish();
        }
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)]" onKeyDown={handleKeyDown}>
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--line)] rounded-[2rem] p-8 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.1)] relative">
        <div className="flex justify-between items-center mb-8">
          <span className="font-mono text-sm font-bold text-[var(--gold)]">{step + 1} / {steps.length}</span>
          <button 
            onClick={toggleTheme} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hover)] border border-[var(--line)] text-[var(--ink)] text-xs font-bold hover:scale-105 transition-all shadow-sm"
            title="تغيير المظهر"
          >
            {state.meta.theme === 'dark' ? <Sun size={14} className="text-[var(--gold)]" /> : <Moon size={14} className="text-[var(--gold)]" />}
            <span>{state.meta.theme === 'dark' ? 'فاتح' : 'داكن'}</span>
          </button>
        </div>

        <h2 className="font-arabic font-bold text-2xl text-[var(--ink)] mb-6">{steps[step].title}</h2>
        <div className="min-h-[160px]">{steps[step].body}</div>
        <div className="flex gap-3 mt-8">
          {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-ghost flex-1"><ChevronRight size={18} /> رجوع</button>}
          {step < steps.length - 1 
            ? <button onClick={() => setStep(step + 1)} disabled={!steps[step].isValid()} className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all">التالي <ChevronLeft size={18} /></button>
            : <button onClick={finish} disabled={!steps[step].isValid()} className="btn-primary flex-1">ابدأ الرحلة</button>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   7. DASHBOARD (لوحة التحكم الرئيسية)
   ============================================================ */
function JourneyTimeline({ meta }) {
  const total = daysBetween(meta.journeyStart, meta.journeyEnd) || 1;
  const passed = clamp(daysBetween(meta.journeyStart, todayISO()), 0, total);
  const pct = clamp((passed / total) * 100, 0, 100);
  
  return (
    <div className="w-full overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm animate-slideUpFade">
      <div className="flex justify-between items-center mb-5">
        <div>
          <p className="font-arabic font-bold text-lg text-[var(--ink)]">مسار الرحلة</p>
          <p className="text-xs text-[var(--muted)] font-mono uppercase mt-1">يوم {passed} من {total}</p>
        </div>
        <div dir="ltr" className="bg-[var(--hover)] px-4 py-2 rounded-2xl border border-[var(--line)]">
          <p className="font-mono font-bold text-2xl text-[var(--gold)]">{pct.toFixed(1)}%</p>
        </div>
      </div>
      <div className="relative h-2.5 w-full bg-[var(--track)] rounded-full overflow-hidden">
        <div className="absolute top-0 right-0 h-full bg-[var(--gold)] rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}

function MomentumGauge({ score }) {
  const color = score >= 70 ? 'var(--good)' : score >= 40 ? 'var(--gold)' : 'var(--danger)';
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6 p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm animate-slideUpFade h-full" style={{ animationDelay: '0.1s' }}>
      <div className="relative w-28 h-28 shrink-0 drop-shadow-xl">
        <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90 absolute top-0 left-0 w-full h-full">
          <circle cx="56" cy="56" r="42" stroke="var(--track)" strokeWidth="8" fill="none" />
          <circle cx="56" cy="56" r="42" stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <span dir="ltr" className="font-mono text-3xl font-bold text-[var(--ink)] mt-1">{Math.round(score)}</span>
        </div>
      </div>
      <div>
        <p className="font-arabic font-bold text-[var(--ink)] flex items-center gap-2 text-xl mb-1">
          <Flame size={20} style={{ color }} /> الزخم
        </p>
        <p className="text-sm text-[var(--muted)] leading-relaxed">يعكس مدى التزامك بالوتيرة المطلوبة لتحقيق أهدافك في الوقت المحدد.</p>
      </div>
    </div>
  );
}

function QuotaRow({ icon: Icon, label, taskKey, unit }) {
  const { state, update } = useApp();
  const quota = state.mission.dailyQuotas[taskKey];
  const done = state.mission.todayDone[taskKey];
  const baseline = state.mission.baseline[taskKey];
  const pct = quota > 0 ? clamp((done / quota) * 100, 0, 100) : 0;

  const setQuota = (v) => update((s) => { s.mission.dailyQuotas[taskKey] = Math.max(0, Number.isFinite(v) ? Math.max(0, v) : 0); return s; });
  const bump = (delta) => update((s) => {
    s.mission.todayDone[taskKey] = Math.max(0, Math.round((Number(s.mission.todayDone[taskKey]) || 0) + delta) * 10 / 10);
    return s;
  });

  return (
    <div className="py-4 border-b border-[var(--line)] last:border-0 group hover:bg-[var(--hover)] transition-colors rounded-3xl px-4 -mx-4 mb-1">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 w-1/2">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-[var(--hover)] border border-[var(--line)] flex items-center justify-center shadow-sm">
             <Icon size={20} className="text-[var(--gold)]" strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-sm font-bold text-[var(--ink)] block">{label}</span>
            {quota !== baseline && <span className="text-[10px] text-[var(--gold)] mt-0.5 block">معدل يدوياً اليوم</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 bg-[var(--hover)] p-1.5 rounded-2xl border border-[var(--line)] shadow-sm">
          <button onClick={() => bump(-1)} className="w-8 h-8 shrink-0 rounded-xl text-[var(--ink)] flex items-center justify-center hover:bg-[var(--surface)] transition-colors">−</button>
          <div dir="ltr" className="flex items-center justify-center min-w-[5rem] px-1 gap-1">
            <span className="font-mono text-sm font-bold text-[var(--ink)]">{done}</span>
            <span className="font-mono text-xs text-[var(--muted)]">/</span>
            <input 
              type="number" 
              min="0"
              value={quota} 
              onChange={(e) => setQuota(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))} 
              className="w-12 bg-transparent text-center font-mono text-sm font-bold text-[var(--ink)] focus:outline-none focus:text-[var(--gold)] no-spinner" 
            />
          </div>
          <button onClick={() => bump(1)} className="w-8 h-8 shrink-0 rounded-xl text-[var(--ink)] flex items-center justify-center hover:bg-[var(--surface)] transition-colors">+</button>
        </div>
      </div>
      <ProgressBar value={pct} />
    </div>
  );
}

function Dashboard() {
  const { state } = useApp();
  const { mission, meta } = state;
  return (
    <div className="space-y-6 pb-32">
      <JourneyTimeline meta={meta} />
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <MomentumGauge score={mission.momentumScore} />
      </div>
      <DailyCalendar meta={meta} />
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm animate-slideUpFade" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-arabic font-bold text-lg text-[var(--ink)]">سرعة اليوم</h2>
          <span className="text-xs font-mono bg-[var(--hover)] text-[var(--muted)] border border-[var(--line)] px-3 py-1 rounded-full">{todayISO()}</span>
        </div>
        <div className="space-y-1">
          <QuotaRow icon={BookOpen} label="مراجعة (Moraja'a)" taskKey="morajaAhzab" unit="حزب" />
          <QuotaRow icon={Sparkles} label="حفظ جديد (Hifz)" taskKey="hifzAthman" unit="ثمن" />
          <QuotaRow icon={GraduationCap} label="بومودورو البكالوريا" taskKey="bacPomodoros" unit="حصة" />
          <QuotaRow icon={Library} label="القراءة" taskKey="readingPages" unit="صفحة" />
          <QuotaRow icon={Languages} label={state.meta.targetLanguageLabel || 'اللغة الإنجليزية'} taskKey="englishWords" unit="كلمة" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   8. BAC HUB (صفحة البكالوريا الحرة)
   ============================================================ */
function BacHub() {
  const { state, update } = useApp();
  const [newSubj, setNewSubj] = useState({ name: '', totalLessons: '' });
  const [activeSubj, setActiveSubj] = useState(null);
  const [toast, setToast] = useState(null);
  const subjects = state.goals.bac.subjects;

  const addSubject = () => {
    if (!newSubj.name.trim()) return;
    update(s => {
      s.goals.bac.subjects.push({
        id: `bac_${Date.now()}`, name: newSubj.name.trim(),
        totalLessons: Math.max(1, Number(newSubj.totalLessons) || 1), completedLessons: 0, sessions: []
      });
      return s;
    });
    setNewSubj({ name: '', totalLessons: '' });
  };

  const removeSubject = (id) => update(s => { s.goals.bac.subjects = s.goals.bac.subjects.filter(x => x.id !== id); return s; });

  const readinessOf = (subj) => {
    const totalLessons = Number(subj.totalLessons) || 0;
    const completedLessons = Number(subj.completedLessons) || 0;
    const comp = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
    const avgConf = subj.sessions.length ? subj.sessions.reduce((a, b) => a + (Number(b.confidence) || 0), 0) / subj.sessions.length : 0;
    return Math.round(comp * 0.6 + (avgConf / 5) * 100 * 0.4);
  };

  const overallReadiness = subjects.length ? Math.round(subjects.reduce((a, s) => a + readinessOf(s), 0) / subjects.length) : 0;

  const submitSession = (pomodoros, confidence) => {
    if (!activeSubj) return;
    let before = readinessOf(activeSubj);
    update(s => {
      const subj = s.goals.bac.subjects.find(x => x.id === activeSubj.id);
      const totalLessons = Math.max(1, Number(subj.totalLessons) || 1);
      subj.completedLessons = Math.min(totalLessons, (Number(subj.completedLessons) || 0) + 1);
      subj.sessions.push({ date: todayISO(), pomodoros, confidence });
      s.mission.todayDone.bacPomodoros = Math.round((s.mission.todayDone.bacPomodoros + pomodoros) * 10) / 10;
      return s;
    });
    const after = readinessOf({ ...activeSubj, completedLessons: activeSubj.completedLessons + 1 });
    const delta = Math.max(1, after - before);
    setToast(`+${delta}% في مؤشر الجاهزية`);
    setTimeout(() => setToast(null), 2500);
    setActiveSubj(null);
  };

  return (
    <div className="space-y-6 pb-32 animate-slideUpFade">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--good)] text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-xl animate-bounce">
          {toast}
        </div>
      )}

      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--muted)] font-mono uppercase mb-1">مؤشر الجاهزية للامتحان</p>
          <p className="font-mono text-3xl font-bold text-[var(--ink)]">{overallReadiness}%</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-[var(--hover)] border border-[var(--line)] flex items-center justify-center text-[var(--gold)]">
          <Award size={28} strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-arabic font-bold text-lg text-[var(--ink)]">مواد البكالوريا</h2>
        {subjects.length === 0 && (
          <Empty
            icon={GraduationCap}
            title="لم يتم إضافة أي مادة بعد"
            hint="ابدأ بإضافة أول مادة لتكوين خطة دراسية يومية واضحة وتحريك رحلتك نحو النجاح."
          />
        )}
        {subjects.map((s) => (
          <div key={s.id} className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">{s.name}</h3>
                <p className="text-xs text-[var(--muted)] font-mono mt-1">الدروس: <Frac a={s.completedLessons} b={s.totalLessons} /> · جاهزية: {readinessOf(s)}%</p>
              </div>
              <button onClick={() => removeSubject(s.id)} className="p-2 shrink-0 overflow-hidden text-[var(--danger)] hover:bg-[var(--dangerBg)] rounded-xl transition-colors"><Trash2 size={16} /></button>
            </div>
            <ProgressBar value={(s.completedLessons / Math.max(1, s.totalLessons)) * 100} />
            <button onClick={() => setActiveSubj(s)} className="btn-primary w-full !py-2.5 text-sm">
              <Play size={16} /> تسجيل جلسة بومودورو
            </button>
          </div>
        ))}
      </div>

      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
        <h3 className="font-arabic font-bold text-base text-[var(--ink)]">إضافة مادة جديدة</h3>
        <div className="flex gap-3 items-center">
          <input type="text" value={newSubj.name} onChange={(e) => setNewSubj({ ...newSubj, name: e.target.value })} placeholder="اسم المادة (مثال: الرياضيات)" className="input flex-1 font-arabic" />
          <input type="number" min="1" value={newSubj.totalLessons} onChange={(e) => setNewSubj({ ...newSubj, totalLessons: e.target.value })} placeholder="عدد الدروس" className="input w-36 font-arabic text-center no-spinner" />
          <button onClick={addSubject} className="btn-primary px-5 shrink-0"><Plus size={18} /></button>
        </div>
      </div>

      <ConfidenceModal open={!!activeSubj} onClose={() => setActiveSubj(null)} subjectName={activeSubj?.name} onSubmit={submitSession} />
    </div>
  );
}

function ConfidenceModal({ open, onClose, onSubmit, subjectName }) {
  const [pomodoros, setPomodoros] = useState(1);
  const [confidence, setConfidence] = useState(3);
  const faces = ['😣', '😕', '😐', '🙂', '😄'];

  return (
    <Modal open={open} onClose={onClose} title={`إنهاء جلسة — ${subjectName || ''}`}>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-[var(--ink)] mb-2">حصص البومودورو المُنجزة</label>
          <input type="number" min={1} value={pomodoros} onChange={(e) => setPomodoros(Math.max(1, Number(e.target.value) || 1))} className="input w-full font-mono text-center text-lg no-spinner" />
        </div>
        <div>
          <label className="block text-sm font-bold text-[var(--ink)] mb-3">ما مدى ثقتك في هذا الدرس الآن؟</label>
          <div className="flex justify-between gap-2">
            {faces.map((f, i) => (
              <button key={i} onClick={() => setConfidence(i + 1)} className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center transition-all ${confidence === i + 1 ? 'bg-[var(--gold)] scale-110 shadow-lg' : 'bg-[var(--hover)] hover:scale-105'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => onSubmit(pomodoros, confidence)} className="btn-primary w-full">حفظ الجلسة وتحديث الجاهزية</button>
      </div>
    </Modal>
  );
}

function Frac({ a, b }) {
  return <span dir="ltr" className="font-mono">{a} / {b}</span>;
}

/* ============================================================
   9. QURAN HUB (صفحة القرآن)
   ============================================================ */
function QuranHub() {
  const { state, update } = useApp();
  const [tab, setTab] = useState('hifz');
  const { hifzItems, hifzTotalAthman, moraja } = state.goals.quran;

  const dueHifz = hifzItems.filter(i => !i.done && i.nextReview <= todayISO());
  const hifzDoneCount = hifzItems.filter(i => i.done).length;

  const addAthman = () => update(s => {
    const n = s.goals.quran.hifzItems.length + 1;
    if (n > s.goals.quran.hifzTotalAthman) return s;
    s.goals.quran.hifzItems.push({ id: `th_${Date.now()}`, label: `الثمن ${n}`, box: 0, nextReview: todayISO(), done: false });
    return s;
  });

  const reviewAthman = (id, remembered) => update(s => {
    const idx = s.goals.quran.hifzItems.findIndex(i => i.id === id);
    let item = s.goals.quran.hifzItems[idx];
    item = remembered ? srsPromote(item) : srsDemote(item);
    if (item.box >= 5) item.done = true;
    s.goals.quran.hifzItems[idx] = item;
    s.mission.todayDone.hifzAthman = Math.round((s.mission.todayDone.hifzAthman + 1) * 10) / 10;
    return s;
  });

  const cyclePct = (moraja.cyclePosition / moraja.totalAhzab) * 100;
  const markHizb = () => update(s => {
    const m = s.goals.quran.moraja;
    m.cyclePosition = (m.cyclePosition + 1) % m.totalAhzab;
    m.log.push({ date: todayISO(), hizb: m.cyclePosition });
    s.mission.todayDone.morajaAhzab = Math.round((s.mission.todayDone.morajaAhzab + 1) * 10) / 10;
    return s;
  });

  return (
    <div className="space-y-6 pb-32 animate-slideUpFade">
      <div className="p-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] flex gap-2 shadow-sm">
        <button onClick={() => setTab('hifz')} className={`flex-1 py-3 rounded-xl font-arabic font-bold text-sm transition-all ${tab === 'hifz' ? 'bg-[var(--ink)] text-[var(--bg)] shadow-md' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>حفظ الأثمان (SRS)</button>
        <button onClick={() => setTab('moraja')} className={`flex-1 py-3 rounded-xl font-arabic font-bold text-sm transition-all ${tab === 'moraja' ? 'bg-[var(--ink)] text-[var(--bg)] shadow-md' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>مراجعة الأحزاب (دورة 60)</button>
      </div>

      {tab === 'hifz' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-[var(--muted)] font-mono uppercase">تقدم الحفظ الكلي</p>
              <p className="font-mono font-bold text-lg text-[var(--gold)]"><Frac a={hifzDoneCount} b={hifzTotalAthman} /></p>
            </div>
            <ProgressBar value={(hifzDoneCount / hifzTotalAthman) * 100} />
          </div>

          <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">قائمة المراجعة المستحقة اليوم</h3>
              <button onClick={addAthman} className="btn-primary text-xs !py-2"><Plus size={14} /> حفظ ثمن جديد</button>
            </div>

            {dueHifz.length === 0 ? (
              <Empty
                icon={Sparkles}
                title="لا توجد أثمان للمراجعة اليوم"
                hint="كونت جدول المراجعة الخاص بك بنجاح. عد لاحقًا لتسجيل المزيد أو أضف ثمنًا جديدًا لتعزيز التكرار اليومي."
              />
            ) : (
              <div className="space-y-3">
                {dueHifz.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-[var(--hover)] border border-[var(--line)]">
                    <div>
                      <p className="font-bold text-[var(--ink)]">{item.label}</p>
                      <p className="text-xs text-[var(--muted)] font-mono mt-0.5">الصندوق SRS: {item.box + 1} / 6</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewAthman(item.id, false)} className="px-4 py-2 rounded-xl text-xs font-bold border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]">نسيت</button>
                      <button onClick={() => reviewAthman(item.id, true)} className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--good)] text-white shadow-sm">تذكرت</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'moraja' && (
        <div className="p-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm flex flex-col items-center text-center space-y-6">
          <div className="relative w-40 h-40 flex items-center justify-center">
            <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
              <circle cx="80" cy="80" r="68" stroke="var(--track)" strokeWidth="12" fill="none" />
              <circle cx="80" cy="80" r="68" stroke="var(--good)" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={2 * Math.PI * 68} strokeDashoffset={2 * Math.PI * 68 * (1 - cyclePct / 100)} className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-bold text-[var(--ink)]">{moraja.cyclePosition}</span>
              <span className="text-xs text-[var(--muted)] font-mono uppercase">من {moraja.totalAhzab} حزب</span>
            </div>
          </div>
          <div>
            <h3 className="font-arabic font-bold text-xl text-[var(--ink)] mb-2">دورة مراجعة الأحزاب</h3>
            <p className="text-sm text-[var(--muted)] max-w-xs mx-auto">المراجعة اليومية المنتظمة تحصن القرآن في الصدر وتمنع النسيان.</p>
          </div>
          <button onClick={markHizb} className="btn-primary w-full max-w-xs">تسجيل إتمام حزب اليوم</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   10. ENGLISH HUB (صفحة اللغة الإنجليزية والآيلتس)
   ============================================================ */
function EnglishHub() {
  const { state, update } = useApp();
  const [newWord, setNewWord] = useState({ word: '', meaning: '' });
  const english = state.goals.english;

  const addVocab = () => {
    if (!newWord.word.trim()) return;
    update(s => {
      s.goals.english.vocab.push({ id: `w_${Date.now()}`, word: newWord.word.trim(), meaning: newWord.meaning.trim() });
      s.goals.english.wordsLearned = s.goals.english.vocab.length;
      s.mission.todayDone.englishWords = Math.round((s.mission.todayDone.englishWords + 1) * 10) / 10;
      return s;
    });
    setNewWord({ word: '', meaning: '' });
  };

  const removeVocab = (id) => {
    update(s => {
      s.goals.english.vocab = s.goals.english.vocab.filter(w => w.id !== id);
      s.goals.english.wordsLearned = s.goals.english.vocab.length;
      return s;
    });
  };

  const logSkill = (skill, hours) => {
    update(s => {
      s.goals.english.skillLog[skill] = (s.goals.english.skillLog[skill] || 0) + hours;
      return s;
    });
  };

  return (
    <div className="space-y-6 pb-32 animate-slideUpFade">
      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs text-[var(--muted)] font-mono uppercase">حصيلة الكلمات - {state.meta.targetLanguageLabel}</p>
          <p className="font-mono font-bold text-lg text-[var(--gold)]"><Frac a={english.wordsLearned} b={english.wordsGoalTotal} /></p>
        </div>
        <ProgressBar value={(english.wordsLearned / english.wordsGoalTotal) * 100} />
      </div>

      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
        <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">تتبع مهارات {state.meta.targetLanguageLabel} (ساعات التدريب)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['listening', 'استماع (Listening)'], ['reading', 'قراءة (Reading)'],
            ['writing', 'كتابة (Writing)'], ['speaking', 'محادثة (Speaking)']
          ].map(([k, label]) => (
            <div key={k} className="p-4 rounded-2xl bg-[var(--hover)] border border-[var(--line)] text-center space-y-2">
              <span className="text-xs font-bold text-[var(--ink)] block truncate">{label}</span>
              <span className="font-mono text-xl font-bold text-[var(--gold)] block">{english.skillLog[k] || 0} س</span>
              <button onClick={() => logSkill(k, 1)} className="btn-primary w-full !py-1.5 text-xs">+ ساعة</button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
        <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">بنك المفردات - {state.meta.targetLanguageLabel}</h3>
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="flex-1 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--hover)] px-3 py-2">
            <input type="text" value={newWord.word} onChange={(e) => setNewWord({ ...newWord, word: e.target.value })} placeholder={`الكلمة ب${state.meta.targetLanguageLabel}...`} className="w-full bg-transparent font-arabic outline-none" />
          </div>
          <div className="text-[var(--muted)] font-bold text-lg shrink-0">=</div>
          <div className="flex-1 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--hover)] px-3 py-2">
            <input type="text" value={newWord.meaning} onChange={(e) => setNewWord({ ...newWord, meaning: e.target.value })} placeholder="المعنى بالعربية..." className="w-full bg-transparent font-arabic outline-none" />
          </div>
          <button onClick={addVocab} className="btn-primary px-6 shrink-0"><Plus size={18} /> إضافة</button>
        </div>

        <div className="space-y-2 mt-4 max-h-64 overflow-y-auto pr-1">
          {english.vocab.length === 0 ? (
            <Empty
              icon={Bookmark}
              title="قائمة المفردات فارغة"
              hint="أضف كلمات جديدة الآن لتبني بنك مفردات فعال وتتابع تقدمك اليومي بسهولة."
            />
          ) : (
            english.vocab.map(w => (
              <div key={w.id} className="flex items-center justify-between p-3 rounded-2xl bg-[var(--hover)] border border-[var(--line)]">
                <div className="min-w-0">
                  <span className="font-bold text-[var(--ink)] font-mono ml-3">{w.word}</span>
                  <span className="text-sm text-[var(--muted)] block truncate">{w.meaning}</span>
                </div>
                <button onClick={() => removeVocab(w.id)} className="p-2 shrink-0 overflow-hidden text-[var(--danger)] hover:bg-[var(--dangerBg)] rounded-xl transition-colors"><Trash2 size={16} /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   11. READING HUB (صفحة المكتبة والقراءة)
   ============================================================ */
function ReadingHub() {
  const { state, update } = useApp();
  const [newBook, setNewBook] = useState({ title: '', author: '', pages: '' });
  const reading = state.goals.reading;

  const addBook = () => {
    if (!newBook.title.trim()) return;
    update(s => {
      s.goals.reading.books.push({
        id: `book_${Date.now()}`, title: newBook.title.trim(),
        author: newBook.author.trim() || 'مؤلف غير معروف',
        totalPages: Math.max(1, Number(newBook.pages) || 100), readPages: 0, completed: false
      });
      return s;
    });
    setNewBook({ title: '', author: '', pages: '' });
  };

  const addPagesToBook = (id, count) => {
    update(s => {
      const book = s.goals.reading.books.find(b => b.id === id);
      if (!book) return;
      book.readPages = clamp((Number(book.readPages) || 0) + count, 0, Math.max(1, Number(book.totalPages) || 100));
      if (book.readPages >= Math.max(1, Number(book.totalPages) || 100)) book.completed = true;
      
      s.goals.reading.pagesRead = s.goals.reading.books.reduce((acc, b) => acc + b.readPages, 0);
      s.mission.todayDone.readingPages = Math.round((s.mission.todayDone.readingPages + count) * 10) / 10;
      return s;
    });
  };

  const removeBook = (id) => {
    update(s => {
      s.goals.reading.books = s.goals.reading.books.filter(b => b.id !== id);
      s.goals.reading.pagesRead = s.goals.reading.books.reduce((acc, b) => acc + b.readPages, 0);
      return s;
    });
  };

  return (
    <div className="space-y-6 pb-32 animate-slideUpFade">
      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs text-[var(--muted)] font-mono uppercase">مجموع الصفحات المقروءة</p>
          <p className="font-mono font-bold text-lg text-[var(--gold)]"><Frac a={reading.pagesRead} b={reading.pagesGoalTotal} /></p>
        </div>
        <ProgressBar value={(reading.pagesRead / reading.pagesGoalTotal) * 100} />
      </div>

      <div className="space-y-4">
        <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">كتب قيد القراءة والإنجاز</h3>
        {reading.books.length === 0 ? (
          <Empty
            icon={BookOpen}
            title="المكتبة فارغة"
            hint="أضف كتبًا جديدة لتبدأ تتبع القراءة اليومي وتبني عادة قراءة منظمة."
          />
        ) : (
          reading.books.map(b => {
            const pct = (b.readPages / Math.max(1, b.totalPages)) * 100;
            return (
              <div key={b.id} className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-arabic font-bold text-lg text-[var(--ink)] flex items-center gap-2">
                      {b.title} {b.completed && <span className="text-xs bg-[var(--good)]/10 text-[var(--good)] px-2.5 py-0.5 rounded-full font-sans">مكتمل</span>}
                    </h4>
                    <p className="text-xs text-[var(--muted)] mt-1">الكاتب: {b.author} · الصفحات: <Frac a={b.readPages} b={b.totalPages} /></p>
                  </div>
                  <button onClick={() => removeBook(b.id)} className="p-2 shrink-0 overflow-hidden text-[var(--danger)] hover:bg-[var(--dangerBg)] rounded-xl transition-colors"><Trash2 size={16} /></button>
                </div>
                <ProgressBar value={pct} />
                <div className="flex gap-2 pt-2">
                  <button onClick={() => addPagesToBook(b.id, 10)} className="btn-ghost flex-1 text-xs !py-2">+10 صفحات</button>
                  <button onClick={() => addPagesToBook(b.id, 25)} className="btn-ghost flex-1 text-xs !py-2">+25 صفحة</button>
                  <button onClick={() => addPagesToBook(b.id, 50)} className="btn-primary flex-1 text-xs !py-2">+50 صفحة</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm space-y-4">
        <h3 className="font-arabic font-bold text-lg text-[var(--ink)]">إضافة كتاب جديد للمكتبة</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="text" value={newBook.title} onChange={(e) => setNewBook({ ...newBook, title: e.target.value })} placeholder="عنوان الكتاب..." className="input" />
          <input type="text" value={newBook.author} onChange={(e) => setNewBook({ ...newBook, author: e.target.value })} placeholder="اسم الكاتب..." className="input" />
          {/* تم ضبط حقل عدد صفحات الكتاب بـ no-spinner لعرض الأرقام بوضوح */}
          <input type="number" min="1" value={newBook.pages} onChange={(e) => setNewBook({ ...newBook, pages: e.target.value })} placeholder="عدد الصفحات الإجمالي..." className="input font-mono no-spinner" />
        </div>
        <button onClick={addBook} className="btn-primary w-full"><Plus size={18} /> إضافة الكتاب للقائمة</button>
      </div>
    </div>
  );
}

/* ============================================================
   12. APP SHELL & NAVIGATION
   ============================================================ */
function Shell() {
  const { state, update, loaded, storageError, reminders, setReminders } = useApp();
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-full border-4 border-[var(--line)] border-t-[var(--gold)] animate-spin mx-auto" />
          <div>
            <p className="font-arabic font-bold text-lg text-[var(--ink)]">جارٍ تحميل تطبيق Transformation OS</p>
            <p className="text-sm text-[var(--muted)] mt-1">نجهز بياناتك وتفاصيل رحلتك...</p>
          </div>
        </div>
      </div>
    );
  }

  const globalStyles = `
    body { background-color: var(--bg); transition: background-color 0.3s ease; }
    .input { background: var(--hover); border: 1px solid var(--line); border-radius: 1rem; padding: 0.75rem 1rem; color: var(--ink); outline: none; transition: all 0.3s; }
    .input:focus { border-color: var(--gold); }
    
    /* إزالة الأسهم الافتراضية للـ number inputs لمنع تداخل النصوص */
    .no-spinner::-webkit-inner-spin-button, 
    .no-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .no-spinner { -moz-appearance: textfield; }

    .btn-primary { background: var(--ink); color: var(--bg); font-weight: 600; border-radius: 1rem; padding: 0.8rem 1.5rem; transition: all 0.3s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; }
    .btn-primary:hover:not(:disabled) { transform: translateY(-2px); opacity: 0.9; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
    .btn-ghost { background: var(--hover); color: var(--ink); font-weight: 600; border-radius: 1rem; padding: 0.8rem 1.5rem; transition: all 0.3s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; }
    .empty-state { border: 1px dashed var(--line); background: linear-gradient(135deg, var(--surface), var(--hover)); }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
    
    @keyframes slideUpFade { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    .animate-slideUpFade { animation: slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
  `;

  if (!state.meta.onboarded) {
    return (
      <div dir="rtl" className="font-arabic text-[var(--ink)]">
        <style>{globalStyles}</style>
        <Onboarding />
      </div>
    );
  }

  const nav = [
    { id: 'dashboard', label: 'الرئيسية', Icon: Home },
    { id: 'bac', label: 'البكالوريا', Icon: GraduationCap },
    { id: 'quran', label: 'القرآن', Icon: BookOpen },
    { id: 'english', label: state.meta.targetLanguageLabel || 'اللغة الإنجليزية', Icon: Languages },
    { id: 'reading', label: 'المكتبة', Icon: Library },
    { id: 'settings', label: 'الإعدادات', Icon: SettingsIcon },
  ];

  const toggleTheme = () => update(s => { s.meta.theme = s.meta.theme === 'dark' ? 'light' : 'dark'; return s; });
  const toggleReminder = (id) => setReminders((current) => current.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
  const updateLanguage = (langId) => {
    update(s => {
      s.meta.targetLanguage = langId;
      s.meta.targetLanguageLabel = getLanguageLabel(langId);
      return s;
    });
  };
  const firstLetter = state.meta.userName ? state.meta.userName.charAt(0).toUpperCase() : 'T';

  return (
    <div dir="rtl" className="min-h-screen font-arabic text-[var(--ink)] flex flex-col md:flex-row">
      <style>{globalStyles}</style>

      {/* Sidebar Backdrop - Mobile */}
      {sidebarOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`flex flex-col w-64 h-screen fixed top-0 right-0 bg-[var(--surface)] border-l border-[var(--line)] p-6 z-40 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-64'}`}>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-[var(--gold)] text-white flex items-center justify-center shadow-lg">
            <span className="font-mono font-bold text-xl">{firstLetter}</span>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight truncate w-32">{state.meta.userName || 'TransOS'}</h1>
            <p className="text-[10px] text-[var(--muted)] font-mono uppercase">OS v2.0</p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2">
          {nav.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { setPage(id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${page === id ? 'bg-[var(--hover)] text-[var(--gold)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'}`}>
              <Icon size={20} strokeWidth={page === id ? 2.5 : 1.5} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-3 text-[var(--muted)] hover:bg-[var(--hover)] rounded-xl transition-all">
          {state.meta.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          <span>{state.meta.theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
        </button>
      </aside>

      {storageError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] rounded-2xl border border-[var(--danger)] bg-[var(--dangerBg)] px-4 py-3 text-sm text-[var(--ink)] shadow-lg">
          {storageError}
        </div>
      )}

      {/* Header - Desktop & Mobile */}
      <header className="fixed top-0 w-full z-40 bg-[var(--surface)]/80 backdrop-blur-xl border-b border-[var(--line)] h-16 flex items-center justify-between px-4">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-[var(--ink)] hover:bg-[var(--hover)] rounded-xl transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-lg bg-[var(--gold)] text-white flex items-center justify-center shadow-md">
            <span className="font-mono font-bold text-sm">{firstLetter}</span>
          </div>
          <h1 className="font-bold text-lg">{nav.find(n => n.id === page)?.label}</h1>
        </div>
        <button onClick={toggleTheme} className="p-2 text-[var(--muted)] bg-[var(--hover)] rounded-full">
          {state.meta.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 pt-24 pb-28 max-w-5xl mx-auto w-full min-h-screen">
        <div key={page} className="transition-all duration-500 ease-out animate-slideUpFade">
          {page === 'dashboard' && <Dashboard />}
          {page === 'bac' && <BacHub />}
          {page === 'quran' && <QuranHub />}
          {page === 'english' && <EnglishHub />}
          {page === 'reading' && <ReadingHub />}
          {page === 'settings' && <SettingsPanel state={state} toggleTheme={toggleTheme} reminders={reminders} onToggleReminder={toggleReminder} onUpdateLanguage={updateLanguage} />}
        </div>
      </main>

      {/* Floating Bottom Nav - Mobile */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--surface)]/90 backdrop-blur-2xl border border-[var(--line)] p-2 rounded-full shadow-lg flex items-center gap-1 w-[90%] max-w-sm justify-around">
        {nav.slice(0, 5).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => { setPage(id); setSidebarOpen(false); }} className={`relative flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${page === id ? 'text-[var(--gold)] scale-110' : 'text-[var(--muted)] hover:bg-[var(--hover)]'}`}>
            <Icon size={page === id ? 22 : 20} strokeWidth={page === id ? 2 : 1.5} />
          </button>
        ))}
      </nav>
    </div>
  );
}

function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 shadow-sm empty-state flex flex-col items-center justify-center text-center gap-4 animate-fadeIn">
      <div className="w-16 h-16 rounded-3xl bg-[var(--hover)] flex items-center justify-center text-[var(--gold)]">
        <Icon size={28} />
      </div>
      <p className="font-bold text-xl text-[var(--ink)]">{title}</p>
      <p className="text-[var(--muted)] max-w-sm">{hint}</p>
      {action}
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}