import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateLocal, daysBetween, calculateMomentumScore, normalizeState, syncConsistency, ensureDailyState } from './appLogic.js';

test('formatDateLocal uses the local calendar date', () => {
  const date = new Date(2024, 0, 2, 23, 59, 59);
  assert.equal(formatDateLocal(date), '2024-01-02');
});

test('daysBetween respects local dates without timezone drift', () => {
  assert.equal(daysBetween('2024-01-01', '2024-01-03'), 2);
  assert.equal(daysBetween('2024-01-03', '2024-01-01'), 0);
});

test('calculateMomentumScore converts progress into a bounded score', () => {
  const state = {
    mission: {
      baseline: { bacPomodoros: 2, hifzAthman: 1, morajaAhzab: 2, readingPages: 20, englishWords: 10 },
      dailyQuotas: { bacPomodoros: 2, hifzAthman: 1, morajaAhzab: 2, readingPages: 20, englishWords: 10 },
      todayDone: { bacPomodoros: 1, hifzAthman: 1, morajaAhzab: 2, readingPages: 10, englishWords: 5 },
    }
  };

  assert.equal(calculateMomentumScore(state), 70);
});

test('normalizeState fills missing structure and sanitizes invalid values', () => {
  const fallback = {
    meta: { onboarded: false, theme: 'light' },
    mission: { dailyQuotas: { bacPomodoros: 2 }, todayDone: { bacPomodoros: 0 }, momentumScore: 50 }
  };

  const normalized = normalizeState({ mission: { todayDone: { bacPomodoros: 'bad' } } }, fallback);

  assert.equal(normalized.meta.theme, 'light');
  assert.equal(normalized.mission.dailyQuotas.bacPomodoros, 2);
  assert.equal(normalized.mission.todayDone.bacPomodoros, 0);
});

test('ensureDailyState resets todayDone when a new day begins', () => {
  const state = {
    mission: {
      todayDate: '2024-01-01',
      todayDone: { bacPomodoros: 2, hifzAthman: 1, morajaAhzab: 1, readingPages: 20, englishWords: 5 }
    }
  };

  const updated = ensureDailyState(state, '2024-01-02');

  assert.equal(updated.mission.todayDate, '2024-01-02');
  assert.deepEqual(updated.mission.todayDone, { bacPomodoros: 0, hifzAthman: 0, morajaAhzab: 0, readingPages: 0, englishWords: 0 });
});

test('syncConsistency creates a streak on the first active day', () => {
  const state = {
    meta: { streak: { current: 0, best: 0, lastActiveDate: null }, activityDates: [] },
    mission: { todayDone: { bacPomodoros: 1 } }
  };

  const updated = syncConsistency(state);
  assert.equal(updated.meta.streak.current, 1);
  assert.equal(updated.meta.streak.best, 1);
});
