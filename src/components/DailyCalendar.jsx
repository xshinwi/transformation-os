import React from 'react';
import { CalendarDays, Sparkles } from 'lucide-react';
import { formatDateLocal } from '../utils/appLogic.js';

export default function DailyCalendar({ meta }) {
  const today = formatDateLocal(new Date());
  const activityDates = Array.isArray(meta?.activityDates) ? meta.activityDates : [];
  const streak = meta?.streak || { current: 0, best: 0 };

  return (
    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--muted)] font-mono uppercase">التقويم اليومي</p>
          <p className="font-arabic font-bold text-lg text-[var(--ink)]">أيام النشاط والاستمرارية</p>
        </div>
        <div className="rounded-2xl bg-[var(--hover)] p-3 text-[var(--gold)]">
          <CalendarDays size={20} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[var(--hover)] p-4">
          <p className="text-xs text-[var(--muted)]">السلسلة الحالية</p>
          <p className="font-mono text-2xl font-bold text-[var(--ink)]">{streak.current || 0}</p>
        </div>
        <div className="rounded-2xl bg-[var(--hover)] p-4">
          <p className="text-xs text-[var(--muted)]">أفضل سلسلة</p>
          <p className="font-mono text-2xl font-bold text-[var(--ink)]">{streak.best || 0}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
          <Sparkles size={16} className="text-[var(--gold)]" />
          اليوم: {today}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {activityDates.length === 0 ? (
            <span className="text-sm text-[var(--muted)]">لم تسجل نشاطًا بعد، ابدأ اليوم.</span>
          ) : (
            activityDates.slice(-7).map((date) => (
              <span key={date} className={`rounded-full px-3 py-1 text-xs font-semibold ${date === today ? 'bg-[var(--gold)] text-white' : 'bg-[var(--hover)] text-[var(--ink)]'}`}>
                {date}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
