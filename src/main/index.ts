import { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } from 'electron';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AkDailyData,
  DotDaySettings,
  EventItem,
  EventTimeType,
  Habit,
  HabitDayRecord,
  HabitProgressRecord,
  HabitRecordValue,
  PlanNote,
  WidgetMode,
  WindowPosition,
} from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaultSettings: DotDaySettings = {
  widgetOpacity: 88,
  reminderLeadMinutes: 5,
  autoCollapseOnBlur: true,
  launchAtStartup: false,
  nativeNotifications: false,
  windowPosition: null,
};

const defaultData: AkDailyData = {
  habits: [],
  habitRecords: {},
  events: [],
  notes: [],
  planNotes: [],
  settings: defaultSettings,
};

let mainWindow: BrowserWindow | null = null;
let widgetMode: WidgetMode = 'collapsed';
let autoCollapseOnBlur = defaultSettings.autoCollapseOnBlur;
let lastCollapsedPosition: WindowPosition | null = null;
let positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let allowWindowClose = false;
let dataOperationQueue: Promise<unknown> = Promise.resolve();

const collapsedSize = {
  width: 286,
  height: 132,
};

const expandedSize = {
  width: 404,
  height: 680,
};

app.setName('DotDay');

function getDataFilePath(): string {
  return join(app.getPath('userData'), 'dotday-data.json');
}

function getLegacyDataFilePath(): string {
  return join(app.getPath('appData'), 'AK Daily', 'ak-daily-data.json');
}

function clampWindowPosition(x: number, y: number, width: number, height: number): WindowPosition {
  const margin = 18;
  const display = screen.getDisplayNearestPoint({ x, y });
  const workArea = display.workArea;

  return {
    x: Math.min(Math.max(x, workArea.x + margin), workArea.x + workArea.width - width - margin),
    y: Math.min(Math.max(y, workArea.y + margin), workArea.y + workArea.height - height - margin),
  };
}

function placeWindow(mode: WidgetMode, useDefaultPosition = false, notifyRenderer = false, captureCurrentPosition = true): void {
  if (!mainWindow) {
    return;
  }

  const previousMode = widgetMode;
  const currentBounds = mainWindow.getBounds();

  if (previousMode === 'collapsed' && captureCurrentPosition) {
    lastCollapsedPosition = {
      x: currentBounds.x,
      y: currentBounds.y,
    };
  }

  widgetMode = mode;

  const size = mode === 'collapsed' ? collapsedSize : expandedSize;
  const margin = 18;
  const display = useDefaultPosition ? screen.getPrimaryDisplay() : screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const targetPosition =
    mode === 'collapsed' && lastCollapsedPosition
      ? clampWindowPosition(lastCollapsedPosition.x, lastCollapsedPosition.y, size.width, size.height)
      : {
          x: useDefaultPosition
            ? workArea.x + workArea.width - size.width - margin
            : Math.min(Math.max(currentBounds.x, workArea.x + margin), workArea.x + workArea.width - size.width - margin),
          y: useDefaultPosition
            ? workArea.y + workArea.height - size.height - margin
            : Math.min(Math.max(currentBounds.y, workArea.y + margin), workArea.y + workArea.height - size.height - margin),
        };

  mainWindow.setBounds(
    {
      x: targetPosition.x,
      y: targetPosition.y,
      width: size.width,
      height: size.height,
    },
    false,
  );

  if (mode === 'collapsed') {
    lastCollapsedPosition = {
      x: targetPosition.x,
      y: targetPosition.y,
    };
  }

  if (notifyRenderer) {
    mainWindow.webContents.send('dotday:widget-mode-changed', mode);
  }
}

function normalizeData(value: unknown): AkDailyData {
  const incoming = value && typeof value === 'object' ? (value as Partial<AkDailyData>) : {};
  const incomingSettings = incoming.settings && typeof incoming.settings === 'object' ? (incoming.settings as Partial<DotDaySettings>) : {};
  const events = Array.isArray(incoming.events)
    ? incoming.events
        .map((item) => normalizeEvent(item))
        .filter((item): item is EventItem => Boolean(item))
    : [];
  const planNotes = Array.isArray(incoming.planNotes)
    ? incoming.planNotes
        .map((item) => normalizePlanNote(item))
        .filter((item): item is PlanNote => Boolean(item))
    : [];

  return {
    habits: Array.isArray(incoming.habits)
      ? incoming.habits
          .map((item) => normalizeHabit(item))
          .filter((item): item is Habit => Boolean(item))
      : [],
    habitRecords: normalizeHabitRecords(incoming.habitRecords),
    events,
    notes: Array.isArray(incoming.notes) ? incoming.notes : [],
    planNotes,
    settings: {
      widgetOpacity:
        typeof incomingSettings.widgetOpacity === 'number'
          ? Math.min(Math.max(Math.round(incomingSettings.widgetOpacity), 60), 98)
          : defaultSettings.widgetOpacity,
      reminderLeadMinutes:
        typeof incomingSettings.reminderLeadMinutes === 'number'
          ? Math.min(Math.max(Math.round(incomingSettings.reminderLeadMinutes), 1), 180)
          : defaultSettings.reminderLeadMinutes,
      autoCollapseOnBlur:
        typeof incomingSettings.autoCollapseOnBlur === 'boolean'
          ? incomingSettings.autoCollapseOnBlur
          : defaultSettings.autoCollapseOnBlur,
      launchAtStartup:
        typeof incomingSettings.launchAtStartup === 'boolean' ? incomingSettings.launchAtStartup : defaultSettings.launchAtStartup,
      nativeNotifications:
        typeof incomingSettings.nativeNotifications === 'boolean'
          ? incomingSettings.nativeNotifications
          : defaultSettings.nativeNotifications,
      windowPosition:
        incomingSettings.windowPosition &&
        typeof incomingSettings.windowPosition.x === 'number' &&
        Number.isFinite(incomingSettings.windowPosition.x) &&
        typeof incomingSettings.windowPosition.y === 'number' &&
        Number.isFinite(incomingSettings.windowPosition.y)
          ? {
              x: Math.round(incomingSettings.windowPosition.x),
              y: Math.round(incomingSettings.windowPosition.y),
            }
          : defaultSettings.windowPosition,
    },
  };
}

function normalizeHabit(value: unknown): Habit | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const habit = value as Partial<Habit>;
  if (typeof habit.id !== 'string' || typeof habit.title !== 'string') {
    return null;
  }

  const type = habit.type === 'progress' ? 'progress' : 'checkbox';
  const target = typeof habit.target === 'number' && Number.isFinite(habit.target) ? Math.max(1, Math.round(habit.target)) : undefined;
  const unit = typeof habit.unit === 'string' ? habit.unit.trim().slice(0, 24) : '';

  return {
    id: habit.id,
    title: habit.title,
    createdAt: typeof habit.createdAt === 'string' ? habit.createdAt : new Date().toISOString(),
    archivedAt: typeof habit.archivedAt === 'string' ? habit.archivedAt : undefined,
    type,
    target: type === 'progress' ? target ?? 1 : undefined,
    unit: type === 'progress' && unit ? unit : undefined,
  };
}

function normalizeHabitRecordValue(value: unknown): HabitRecordValue | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<HabitProgressRecord>;
  const rawValue = typeof record.value === 'number' && Number.isFinite(record.value) ? record.value : 0;
  const rawTarget = typeof record.targetSnapshot === 'number' && Number.isFinite(record.targetSnapshot) ? record.targetSnapshot : 1;
  const unit = typeof record.unitSnapshot === 'string' ? record.unitSnapshot.trim().slice(0, 24) : '';

  return {
    typeSnapshot: 'progress',
    value: Math.max(0, Math.round(rawValue)),
    targetSnapshot: Math.max(1, Math.round(rawTarget)),
    unitSnapshot: unit || undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  };
}

function normalizeHabitRecords(value: unknown): Record<string, HabitDayRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, HabitDayRecord>>((records, [dateKey, dayRecord]) => {
    if (!dayRecord || typeof dayRecord !== 'object' || Array.isArray(dayRecord)) {
      return records;
    }

    const normalizedDayRecord = Object.entries(dayRecord as Record<string, unknown>).reduce<HabitDayRecord>((dayRecords, [habitId, recordValue]) => {
      const normalized = normalizeHabitRecordValue(recordValue);

      if (normalized !== null) {
        dayRecords[habitId] = normalized;
      }

      return dayRecords;
    }, {});

    records[dateKey] = normalizedDayRecord;
    return records;
  }, {});
}

function normalizeEvent(value: unknown): EventItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const event = value as Partial<EventItem> & { date?: string };
  if (typeof event.id !== 'string' || typeof event.title !== 'string') {
    return null;
  }

  const legacyDate = typeof event.date === 'string' ? event.date : '';
  const startDate = typeof event.startDate === 'string' && event.startDate ? event.startDate : legacyDate;
  if (!startDate) {
    return null;
  }

  const startTime = typeof event.startTime === 'string' ? event.startTime : '';
  const endTime = typeof event.endTime === 'string' ? event.endTime : '';
  const validTypes: EventTimeType[] = ['moment', 'duration', 'allDay'];
  const timeType: EventTimeType = validTypes.includes(event.timeType as EventTimeType)
    ? (event.timeType as EventTimeType)
    : startTime && endTime
      ? 'duration'
      : startTime
        ? 'moment'
      : 'allDay';
  let endDate = typeof event.endDate === 'string' && event.endDate ? event.endDate : startDate;

  if (!event.endDate && timeType === 'duration' && startTime && endTime && endTime <= startTime) {
    const nextDay = new Date(`${startDate}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    endDate = [
      nextDay.getFullYear(),
      String(nextDay.getMonth() + 1).padStart(2, '0'),
      String(nextDay.getDate()).padStart(2, '0'),
    ].join('-');
  }

  return {
    id: event.id,
    title: event.title,
    timeType,
    startDate,
    startTime: timeType === 'allDay' ? '' : startTime,
    endDate,
    endTime: timeType === 'duration' ? endTime : '',
    location: typeof event.location === 'string' ? event.location : '',
    notes: typeof event.notes === 'string' ? event.notes : '',
    important: Boolean(event.important),
    createdAt: typeof event.createdAt === 'string' ? event.createdAt : new Date().toISOString(),
  };
}

function normalizePlanNote(value: unknown): PlanNote | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const note = value as Partial<PlanNote>;
  if (typeof note.id !== 'string' || typeof note.title !== 'string') {
    return null;
  }

  return {
    id: note.id,
    title: note.title,
    important: Boolean(note.important),
    completedAt: typeof note.completedAt === 'string' ? note.completedAt : undefined,
    createdAt: typeof note.createdAt === 'string' ? note.createdAt : new Date().toISOString(),
  };
}

async function readData(): Promise<AkDailyData> {
  const dataPath = getDataFilePath();

  if (!existsSync(dataPath)) {
    const legacyDataPath = getLegacyDataFilePath();

    if (existsSync(legacyDataPath)) {
      await mkdir(dirname(dataPath), { recursive: true });
      await copyFile(legacyDataPath, dataPath);
      const raw = await readFile(dataPath, 'utf-8');
      return normalizeData(JSON.parse(raw));
    }

    await writeData(defaultData);
    return defaultData;
  }

  try {
    const raw = await readFile(dataPath, 'utf-8');
    return normalizeData(JSON.parse(raw));
  } catch {
    return defaultData;
  }
}

async function writeData(data: AkDailyData): Promise<AkDailyData> {
  const normalized = normalizeData(data);
  const dataPath = getDataFilePath();

  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(normalized, null, 2), 'utf-8');

  return normalized;
}

function queueDataOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = dataOperationQueue.then(operation, operation);
  dataOperationQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function applyLaunchAtStartup(enabled: boolean): void {
  if (!app.isPackaged && process.platform !== 'win32') {
    return;
  }

  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
    });
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [app.getAppPath()],
  });
}

async function persistWindowPosition(): Promise<void> {
  if (!lastCollapsedPosition) {
    return;
  }

  const position = { ...lastCollapsedPosition };

  await queueDataOperation(async () => {
    const data = await readData();
    await writeData({
      ...data,
      settings: {
        ...data.settings,
        windowPosition: position,
      },
    });
  });
}

function scheduleWindowPositionSave(): void {
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer);
  }

  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null;
    void persistWindowPosition();
  }, 350);
}

function createWindow(): void {
  allowWindowClose = false;
  mainWindow = new BrowserWindow({
    width: collapsedSize.width,
    height: collapsedSize.height,
    show: false,
    title: 'DotDay',
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    placeWindow('collapsed', !lastCollapsedPosition, false, false);
    mainWindow?.show();
  });

  mainWindow.on('blur', () => {
    if (widgetMode === 'expanded' && autoCollapseOnBlur) {
      placeWindow('collapsed', false, true);
    }
  });

  mainWindow.on('move', () => {
    if (widgetMode === 'collapsed') {
      const bounds = mainWindow?.getBounds();

      if (bounds) {
        lastCollapsedPosition = {
          x: bounds.x,
          y: bounds.y,
        };
        scheduleWindowPositionSave();
      }
    }
  });

  mainWindow.on('close', (event) => {
    if (allowWindowClose) {
      return;
    }

    event.preventDefault();
    allowWindowClose = true;

    if (positionSaveTimer) {
      clearTimeout(positionSaveTimer);
      positionSaveTimer = null;
    }

    void persistWindowPosition().finally(() => mainWindow?.close());
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('ak-daily:get-data', () => readData());
ipcMain.handle('ak-daily:save-data', (_event, data: AkDailyData) =>
  queueDataOperation(async () => {
    const settings = {
      ...data.settings,
      windowPosition: lastCollapsedPosition ?? data.settings.windowPosition,
    };
    const saved = await writeData({ ...data, settings });
    autoCollapseOnBlur = saved.settings.autoCollapseOnBlur;
    applyLaunchAtStartup(saved.settings.launchAtStartup);
    return saved;
  }),
);
ipcMain.handle('ak-daily:export-data', async () => {
  const data = await readData();
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: 'Export DotDay backup',
        defaultPath: `dotday-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
    : await dialog.showSaveDialog({
    title: 'Export DotDay backup',
    defaultPath: `dotday-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
      });

  if (result.canceled || !result.filePath) {
    return { ok: false };
  }

  await writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
  return { ok: true, path: result.filePath };
});
ipcMain.handle('ak-daily:import-data', async () => {
  const options = {
    title: 'Import DotDay backup',
    properties: ['openFile'] as ('openFile')[],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false };
  }

  try {
    const raw = await readFile(result.filePaths[0], 'utf-8');
    const imported = normalizeData(JSON.parse(raw));
    const saved = await writeData(imported);
    autoCollapseOnBlur = saved.settings.autoCollapseOnBlur;
    applyLaunchAtStartup(saved.settings.launchAtStartup);
    return { ok: true, data: saved };
  } catch {
    return { ok: false, error: 'The selected file is not a valid DotDay backup.' };
  }
});
ipcMain.handle('ak-daily:open-data-folder', () => shell.openPath(dirname(getDataFilePath())));
ipcMain.handle('dotday:set-widget-mode', (_event, mode: WidgetMode) => {
  placeWindow(mode);
});
ipcMain.handle('dotday:set-auto-collapse-on-blur', (_event, enabled: boolean) => {
  autoCollapseOnBlur = enabled;
});
ipcMain.handle('dotday:show-notification', (_event, notification: { title?: string; body?: string }) => {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title: notification.title || 'DotDay',
    body: notification.body || '',
    silent: false,
  }).show();
});
ipcMain.handle('dotday:close-window', () => {
  mainWindow?.close();
});

app.whenReady().then(async () => {
  const data = await readData();
  autoCollapseOnBlur = data.settings.autoCollapseOnBlur;
  lastCollapsedPosition = data.settings.windowPosition;
  applyLaunchAtStartup(data.settings.launchAtStartup);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
