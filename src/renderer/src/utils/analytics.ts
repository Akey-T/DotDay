import type { AkDailyData, DateKey, Habit, HabitDayRecord, HabitProgressRecord, HabitRecordValue, HabitType } from '../../../shared/types';

export interface HabitDayAnalytics {
  date: DateKey;
  day: number;
  weekday: string;
  weekdayShort: string;
  completed: number;
  completedLabel: string;
  total: number;
  percent: number | null;
  completionRatio: number | null;
  hasData: boolean;
  isFuture: boolean;
}

export interface HabitInsights {
  weekCompletionRate: number | null;
  monthAverageCompletionRate: number | null;
  currentStreak: number;
  perfectDaysThisMonth: number;
  weekDays: HabitDayAnalytics[];
  monthDays: HabitDayAnalytics[];
}

export interface StreakStatus {
  count: number;
  isActiveToday: boolean;
  label: string;
}

export interface HabitHistoryDay {
  date: DateKey;
  index: number;
  label: string;
  completed: boolean;
  valueLabel: string;
  percent: number;
}

export interface HabitHistoryInsights {
  habit: Habit | null;
  completionRate: number | null;
  completedDays: number;
  effectiveDays: number;
  days: HabitHistoryDay[];
}

export interface HabitCompletion {
  type: HabitType;
  value: number;
  target: number;
  unit: string;
  ratio: number;
  completed: boolean;
  updatedAt?: string;
}

function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: DateKey): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isHabitActiveOnDate(habit: Habit, dateKey: DateKey): boolean {
  const createdDate = toDateKey(new Date(habit.createdAt));
  const archivedDate = habit.archivedAt ? toDateKey(new Date(habit.archivedAt)) : null;

  return createdDate <= dateKey && (!archivedDate || archivedDate > dateKey);
}

function getActiveHabits(data: AkDailyData, dateKey: DateKey): Habit[] {
  return data.habits.filter((habit) => isHabitActiveOnDate(habit, dateKey));
}

function getHabitType(habit: Habit): HabitType {
  return habit.type === 'progress' ? 'progress' : 'checkbox';
}

function getHabitTarget(habit: Habit): number {
  return typeof habit.target === 'number' && Number.isFinite(habit.target) ? Math.max(1, Math.round(habit.target)) : 1;
}

function getProgressRecord(value: HabitRecordValue | undefined): HabitProgressRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const target = typeof value.targetSnapshot === 'number' && Number.isFinite(value.targetSnapshot) ? Math.max(1, Math.round(value.targetSnapshot)) : 1;
  const amount = typeof value.value === 'number' && Number.isFinite(value.value) ? Math.max(0, Math.round(value.value)) : 0;

  return {
    typeSnapshot: 'progress',
    value: amount,
    targetSnapshot: target,
    unitSnapshot: typeof value.unitSnapshot === 'string' ? value.unitSnapshot : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  };
}

export function getHabitCompletion(habit: Habit, recordValue: HabitRecordValue | undefined): HabitCompletion {
  const type = getHabitType(habit);

  if (type === 'checkbox') {
    const completed = Boolean(recordValue);

    return {
      type,
      value: completed ? 1 : 0,
      target: 1,
      unit: '',
      ratio: completed ? 1 : 0,
      completed,
      updatedAt: undefined,
    };
  }

  const progressRecord = getProgressRecord(recordValue);
  const target = progressRecord?.targetSnapshot ?? getHabitTarget(habit);
  const value =
    typeof recordValue === 'boolean'
      ? recordValue
        ? target
        : 0
      : progressRecord?.value ?? 0;
  const ratio = Math.min(Math.max(value / target, 0), 1);

  return {
    type,
    value,
    target,
    unit: progressRecord?.unitSnapshot ?? habit.unit ?? '',
    ratio,
    completed: ratio >= 1,
    updatedAt: progressRecord?.updatedAt,
  };
}

export function createProgressHabitRecord(habit: Habit, value: number, updatedAt = new Date().toISOString()): HabitProgressRecord {
  return {
    typeSnapshot: 'progress',
    value: Math.max(0, Math.round(value)),
    targetSnapshot: getHabitTarget(habit),
    unitSnapshot: habit.unit,
    updatedAt,
  };
}

export function formatHabitAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function getHabitValueLabel(completion: HabitCompletion): string {
  if (completion.type === 'checkbox') {
    return completion.completed ? '1/1' : '0/1';
  }

  return `${formatHabitAmount(completion.value)}/${formatHabitAmount(completion.target)}${completion.unit ? ` ${completion.unit}` : ''}`;
}

export function formatHabitUpdatedAt(updatedAt?: string): string {
  if (!updatedAt) {
    return '';
  }

  const date = new Date(updatedAt);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function getHabitValueWithUpdateLabel(completion: HabitCompletion): string {
  const valueLabel = getHabitValueLabel(completion);
  const updatedAt = formatHabitUpdatedAt(completion.updatedAt);

  return updatedAt ? `${valueLabel} ${updatedAt}` : valueLabel;
}

export function formatCompletedAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function getDayCompletion(habits: Habit[], record: HabitDayRecord): { completed: number; completionRatio: number; completedLabel: string } {
  const completed = habits.reduce((total, habit) => total + getHabitCompletion(habit, record[habit.id]).ratio, 0);
  const completionRatio = habits.length === 0 ? 0 : completed / habits.length;

  return {
    completed,
    completionRatio,
    completedLabel: formatCompletedAmount(completed),
  };
}

export function getHabitDayAnalytics(data: AkDailyData, date: Date, today?: Date): HabitDayAnalytics {
  const dateKey = toDateKey(date);
  const todayKey = today ? toDateKey(today) : null;
  const isFuture = Boolean(todayKey && dateKey > todayKey);
  const habits = getActiveHabits(data, dateKey);
  const record = data.habitRecords[dateKey] ?? {};
  const dayCompletion = isFuture ? { completed: 0, completionRatio: 0, completedLabel: '0' } : getDayCompletion(habits, record);
  const total = isFuture ? 0 : habits.length;
  const hasData = !isFuture && total > 0;

  return {
    date: dateKey,
    day: date.getDate(),
    weekday: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date),
    weekdayShort: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
    completed: dayCompletion.completed,
    completedLabel: dayCompletion.completedLabel,
    total,
    percent: hasData ? Math.round(dayCompletion.completionRatio * 100) : null,
    completionRatio: hasData ? dayCompletion.completionRatio : null,
    hasData,
    isFuture,
  };
}

export function getWeekDays(date: Date): Date[] {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(date, mondayOffset);

  return Array.from({ length: 7 }, (_value, index) => addDays(monday, index));
}

export function getMonthDays(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_value, index) => new Date(year, month, index + 1));
}

function averagePercent(days: HabitDayAnalytics[]): number | null {
  const validDays = days.filter((day) => day.completionRatio !== null);

  if (validDays.length === 0) {
    return null;
  }

  return Math.round((validDays.reduce((total, day) => total + (day.completionRatio ?? 0), 0) / validDays.length) * 100);
}

function countPerfectDays(days: HabitDayAnalytics[]): number {
  return days.filter((day) => day.total > 0 && day.percent === 100).length;
}

function getCurrentStreak(data: AkDailyData, today: Date): number {
  let streak = 0;
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const oldestHabitDate = data.habits.reduce<Date | null>((oldest, habit) => {
    const created = parseDateKey(toDateKey(new Date(habit.createdAt)));

    if (!oldest || created < oldest) {
      return created;
    }

    return oldest;
  }, null);

  for (let checkedDays = 0; checkedDays < 730; checkedDays += 1) {
    if (oldestHabitDate && cursor < oldestHabitDate) {
      break;
    }

    const day = getHabitDayAnalytics(data, cursor, today);

    if (!day.hasData) {
      cursor = addDays(cursor, -1);
      continue;
    }

    if (day.completed > 0) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    break;
  }

  return streak;
}

export function getStreakStatus(data: AkDailyData, today: Date): StreakStatus {
  const todayStats = getHabitDayAnalytics(data, today, today);
  const todayStreak = getCurrentStreak(data, today);

  if (todayStats.completed > 0) {
    return {
      count: todayStreak,
      isActiveToday: true,
      label: `${todayStreak}-day streak`,
    };
  }

  const previousStreak = getCurrentStreak(data, addDays(today, -1));

  if (previousStreak > 0) {
    return {
      count: previousStreak,
      isActiveToday: false,
      label: `Keep your ${previousStreak}-day streak!`,
    };
  }

  return {
    count: 0,
    isActiveToday: false,
    label: todayStats.hasData ? 'Keep your streak!' : 'Start a streak',
  };
}

export function getHabitInsights(data: AkDailyData, today: Date, monthDate: Date): HabitInsights {
  const weekDays = getWeekDays(today).map((date) => getHabitDayAnalytics(data, date, today));
  const monthDays = getMonthDays(monthDate).map((date) => getHabitDayAnalytics(data, date, today));

  return {
    weekCompletionRate: averagePercent(weekDays),
    monthAverageCompletionRate: averagePercent(monthDays),
    currentStreak: getCurrentStreak(data, today),
    perfectDaysThisMonth: countPerfectDays(monthDays),
    weekDays,
    monthDays,
  };
}

export function getHabitHistoryInsights(data: AkDailyData, habitId: string | null, today: Date): HabitHistoryInsights {
  const habit = data.habits.find((item) => item.id === habitId) ?? data.habits[0] ?? null;

  if (!habit) {
    return {
      habit: null,
      completionRate: null,
      completedDays: 0,
      effectiveDays: 0,
      days: [],
    };
  }

  const todayKey = toDateKey(today);
  const startDate = parseDateKey(toDateKey(new Date(habit.createdAt)));
  const days: HabitHistoryDay[] = [];

  for (let cursor = startDate, index = 1; toDateKey(cursor) <= todayKey && index <= 730; cursor = addDays(cursor, 1)) {
    const dateKey = toDateKey(cursor);

    if (!isHabitActiveOnDate(habit, dateKey)) {
      continue;
    }

    const completion = getHabitCompletion(habit, data.habitRecords[dateKey]?.[habit.id]);

    days.push({
      date: dateKey,
      index,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      completed: completion.completed,
      valueLabel: getHabitValueWithUpdateLabel(completion),
      percent: Math.round(completion.ratio * 100),
    });
    index += 1;
  }

  const completedDays = days.filter((day) => day.completed).length;
  const effectiveDays = days.length;
  const averageCompletion = days.reduce((total, day) => total + day.percent, 0) / effectiveDays;

  return {
    habit,
    completionRate: effectiveDays === 0 ? null : Math.round(averageCompletion),
    completedDays,
    effectiveDays,
    days,
  };
}

