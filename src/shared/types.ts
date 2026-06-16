export type DateKey = string;
export type WidgetMode = 'collapsed' | 'expanded';

export interface Habit {
  id: string;
  title: string;
  createdAt: string;
  archivedAt?: string;
}

export type HabitDayRecord = Record<string, boolean>;

export interface EventItem {
  id: string;
  title: string;
  date: DateKey;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  important?: boolean;
  createdAt: string;
}

export interface QuickNote {
  id: string;
  content: string;
  createdAt: string;
  date: DateKey;
  time: string;
}

export interface AkDailyData {
  habits: Habit[];
  habitRecords: Record<DateKey, HabitDayRecord>;
  events: EventItem[];
  notes: QuickNote[];
}

export interface AkDailyApi {
  getData: () => Promise<AkDailyData>;
  saveData: (data: AkDailyData) => Promise<AkDailyData>;
  setWidgetMode: (mode: WidgetMode) => Promise<void>;
  onWidgetModeChanged: (callback: (mode: WidgetMode) => void) => () => void;
  closeWindow: () => Promise<void>;
}
