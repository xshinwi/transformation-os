import React from 'react';
import { BellRing } from 'lucide-react';

export default function ReminderCard({ reminders, onToggle }) {
  return (
    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--muted)] font-mono uppercase">التذكيرات</p>
          <p className="font-arabic font-bold text-lg text-[var(--ink)]">أذكّرك بالأهداف اليومية</p>
        </div>
        <div className="rounded-2xl bg-[var(--hover)] p-3 text-[var(--gold)]">
          <BellRing size={20} />
        </div>
      </div>

      <div className="space-y-2">
        {reminders.map((item) => (
          <label key={item.id} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--hover)] px-4 py-3">
            <div>
              <p className="font-bold text-[var(--ink)]">{item.label}</p>
              <p className="text-xs text-[var(--muted)]">{item.time}</p>
            </div>
            <input type="checkbox" checked={item.enabled} onChange={() => onToggle(item.id)} className="h-5 w-5 rounded border-[var(--line)] accent-[var(--gold)]" />
          </label>
        ))}
      </div>
    </div>
  );
}
