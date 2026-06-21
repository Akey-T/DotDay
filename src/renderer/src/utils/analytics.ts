import type { AkDailyData, DateKey, Habit } from '../../../shared/types';

export interface HabitDayAnalytics {
  date: DateKey;
  day: number;
  weekday: string;
  weekdayShort: string;
  completed: number;
  total: number;
  percent: number | null;
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
  percent: number;
}

export interface HabitHistoryInsights {
  habit: Habit | null;
  completionRate: number | null;
  completedDays: number;
  effectiveDays: number;
  days: HabitHistoryDay[];
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

export function getHabitDayAnalytics(data: AkDailyData, date: Date, today?: Date): HabitDayAnalytics {
  const dateKey = toDateKey(date);
  const todayKey = today ? toDateKey(today) : null;
  const isFuture = Boolean(todayKey && dateKey > todayKey);
  const habits = getActiveHabits(data, dateKey);
  const record = data.habitRecords[dateKey] ?? {};
  const completed = isFuture ? 0 : habits.filter((habit) => record[habit.id]).length;
  const total = isFuture ? 0 : habits.length;
  const hasData = !isFuture && total > 0;

  return {
    date: dateKey,
    day: date.getDate(),
    weekday: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date),
    weekdayShort: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
    completed,
    total,
    percent: hasData ? Math.round((completed / total) * 100) : null,
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
  const validDays = days.filter((day) => day.percent !== null);

  if (validDays.length === 0) {
    return null;
  }

  return Math.round(validDays.reduce((total, day) => total + (day.percent ?? 0), 0) / validDays.length);
}

function countPerfectDays(days: HabitDayAnalytics[]): number {
  return days.filter((day) => day.total > 0 && day.completed === day.total).length;
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

    const completed = Boolean(data.habitRecords[dateKey]?.[habit.id]);

    days.push({
      date: dateKey,
      index,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      completed,
      percent: completed ? 100 : 0,
    });
    index += 1;
  }

  const completedDays = days.filter((day) => day.completed).length;
  const effectiveDays = days.length;

  return {
    habit,
    completionRate: effectiveDays === 0 ? null : Math.round((completedDays / effectiveDays) * 100),
    completedDays,
    effectiveDays,
    days,
  };
}
