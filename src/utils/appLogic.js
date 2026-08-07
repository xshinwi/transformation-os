export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const formatDateLocal = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const todayISO = () => formatDateLocal(new Date());

export const daysBetween = (a, b) => {
  if (!a || !b) return 0;
  const start = new Date(`${a}T00:00:00`);
  const end = new Date(`${b}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.round((end - start) / 86400000);
  return Math.max(0, diff);
};

export const calculateMomentumScore = (state) => {
  const done = state?.mission?.todayDone || {};
  const quotas = state?.mission?.dailyQuotas || {};
  const keys = Object.keys(quotas);
  if (!keys.length) return 50;

  const completion = keys.reduce((sum, key) => {
    const quota = Number(quotas[key]) || 0;
    const doneValue = Number(done[key]) || 0;
    if (!quota) return sum;
    return sum + clamp((doneValue / quota) * 100, 0, 100);
  }, 0) / keys.length;

  const streak = Number(state?.meta?.streak?.current || 0);
  const streakBonus = streak > 0 ? Math.min(15, streak * 2) : 0;
  const weighted = completion + (streakBonus * 0.1);
  return clamp(Math.round(weighted), 0, 100);
};

export const ensureDailyState = (state, today = todayISO()) => {
  const next = JSON.parse(JSON.stringify(state));
  const currentDate = next?.mission?.todayDate || today;
  const nextTodayDone = {
    bacPomodoros: 0,
    hifzAthman: 0,
    morajaAhzab: 0,
    readingPages: 0,
    englishWords: 0,
  };

  if (currentDate !== today) {
    next.mission = { ...next.mission, todayDate: today, todayDone: nextTodayDone };
  } else {
    next.mission = { ...next.mission, todayDone: { ...nextTodayDone, ...(next.mission?.todayDone || {}) } };
  }

  return next;
};

export const syncConsistency = (state, previousState = null) => {
  const next = JSON.parse(JSON.stringify(state));
  const currentMeta = next.meta || {};
  const previousMeta = previousState?.meta || {};
  const today = todayISO();
  const activityDates = Array.isArray(currentMeta.activityDates) ? [...currentMeta.activityDates] : [];
  const hasNewActivity = Object.values(next.mission?.todayDone || {}).some((value) => Number(value) > 0);
  const previousActiveDate = previousMeta.streak?.lastActiveDate || null;

  if (hasNewActivity && currentMeta.streak?.lastActiveDate !== today) {
    const previousStreak = Number(previousMeta.streak?.current || 0);
    let nextStreak = 1;

    if (previousActiveDate && daysBetween(previousActiveDate, today) === 1) {
      nextStreak = previousStreak + 1;
    } else if (previousActiveDate && daysBetween(previousActiveDate, today) > 1) {
      nextStreak = 1;
    }

    currentMeta.streak = {
      current: nextStreak,
      best: Math.max(Number(currentMeta.streak?.best || 0), nextStreak),
      lastActiveDate: today,
    };

    if (!activityDates.includes(today)) activityDates.push(today);
    currentMeta.activityDates = activityDates;
  } else if (currentMeta.activityDates !== activityDates) {
    currentMeta.activityDates = activityDates;
  }

  return next;
};

export const normalizeState = (savedState = {}, fallbackState = {}) => {
  const safe = JSON.parse(JSON.stringify(fallbackState));
  const source = savedState && typeof savedState === 'object' ? savedState : {};

  const merge = (target, incoming) => {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return target;
    Object.entries(incoming).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
        target[key] = merge(target[key], value);
        return;
      }

      if (typeof value === 'number' && Number.isNaN(value)) {
        target[key] = target[key] ?? 0;
        return;
      }

      if (typeof value === 'string' && value.trim() === '') {
        target[key] = target[key] ?? '';
        return;
      }

      if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
        target[key] = Number(value);
        return;
      }

      if (typeof value === 'number' && typeof target[key] === 'string') {
        target[key] = value;
        return;
      }

      if (typeof value === 'string' && typeof target[key] === 'number') {
        target[key] = Number(value) || 0;
        return;
      }

      target[key] = value;
    });
    return target;
  };

  return merge(safe, source);
};
