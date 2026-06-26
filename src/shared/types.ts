export type DateKey = string;
export type WidgetMode = 'collapsed' | 'expanded';
export type EventTimeType = 'moment' | 'duration' | 'allDay';

export interface WindowPosition {
  x: number;
  y: number;
}

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
  timeType: EventTimeType;
  startDate: DateKey;
  startTime: string;
  endDate: DateKey;
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

export interface PlanNote {
  id: string;
  title: string;
  important: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface DotDaySettings {
  widgetOpacity: number;
  reminderLeadMinutes: number;
  autoCollapseOnBlur: boolean;
  launchAtStartup: boolean;
  windowPosition: WindowPosition | null;
}

export interface AkDailyData {
  habits: Habit[];
  habitRecords: Record<DateKey, HabitDayRecord>;
  events: EventItem[];
  notes: QuickNote[];
  planNotes: PlanNote[];
  settings: DotDaySettings;
}

export interface AkDailyApi {
  getData: () => Promise<AkDailyData>;
  saveData: (data: AkDailyData) => Promise<AkDailyData>;
  setWidgetMode: (mode: WidgetMode) => Promise<void>;
  setAutoCollapseOnBlur: (enabled: boolean) => Promise<void>;
  onWidgetModeChanged: (callback: (mode: WidgetMode) => void) => () => void;
  closeWindow: () => Promise<void>;
}
