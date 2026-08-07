import React from 'react';
import { Settings as SettingsIcon, ShieldCheck, Moon, Sun, Languages } from 'lucide-react';
import ReminderCard from './ReminderCard.jsx';
import { LANGUAGE_OPTIONS } from '../utils/constants.js';

export default function SettingsPanel({ state, toggleTheme, reminders, onToggleReminder, onUpdateLanguage }) {

  return (
    <div className="space-y-6 pb-32 animate-slideUpFade">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[var(--hover)] p-3 text-[var(--gold)]">
            <SettingsIcon size={20} />
          </div>
          <div>
            <p className="text-xs text-[var(--muted)] font-arabic font-semibold">⚙️ الإعدادات</p>
            <p className="font-arabic font-bold text-lg text-[var(--ink)]">تخصيص رحلتك</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-2xl bg-[var(--hover)] p-3 text-[var(--gold)]">
            <Languages size={20} />
          </div>
          <div>
            <p className="font-arabic font-bold text-base text-[var(--ink)]">اللغة المستهدفة</p>
            <p className="text-sm text-[var(--muted)] font-arabic mt-1">اختر اللغة التي تتعلمها</p>
          </div>
        </div>
        <div className="space-y-2">
          {LANGUAGE_OPTIONS.map(lang => (
            <button
              key={lang.id}
              onClick={() => onUpdateLanguage(lang.id)}
              className={`w-full p-3 rounded-xl border-2 transition-all text-sm font-arabic font-bold text-right ${
                state.meta.targetLanguage === lang.id
                  ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]'
                  : 'border-[var(--line)] bg-[var(--hover)] text-[var(--ink)] hover:border-[var(--gold)]'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-arabic font-bold text-base text-[var(--ink)]">الوضع الليلي</p>
            <p className="text-sm text-[var(--muted)] font-arabic mt-1">بدّل بين الواجهة الفاتحة والداكنة</p>
          </div>
          <button onClick={toggleTheme} className="rounded-2xl border border-[var(--line)] bg-[var(--hover)] p-3 text-[var(--ink)] hover:bg-[var(--surface)] transition-colors shrink-0">
            {state.meta.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[var(--hover)] p-3 text-[var(--good)]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="font-arabic font-bold text-base text-[var(--ink)]">الخصوصية والنسخ</p>
            <p className="text-sm text-[var(--muted)] font-arabic mt-1">تُحفظ بياناتك محليًا على جهازك</p>
          </div>
        </div>
      </div>

      <ReminderCard reminders={reminders} onToggle={onToggleReminder} />
    </div>
  );
}
