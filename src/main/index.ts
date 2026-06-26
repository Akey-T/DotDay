import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AkDailyData, DotDaySettings, EventItem, EventTimeType, PlanNote, WidgetMode, WindowPosition } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaultSettings: DotDaySettings = {
  widgetOpacity: 88,
  reminderLeadMinutes: 5,
  autoCollapseOnBlur: true,
  launchAtStartup: false,
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
    habits: Array.isArray(incoming.habits) ? incoming.habits : [],
    habitRecords:
      incoming.habitRecords && typeof incoming.habitRecords === 'object' && !Array.isArray(incoming.habitRecords)
        ? incoming.habitRecords
        : {},
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
ipcMain.handle('dotday:set-widget-mode', (_event, mode: WidgetMode) => {
  placeWindow(mode);
});
ipcMain.handle('dotday:set-auto-collapse-on-blur', (_event, enabled: boolean) => {
  autoCollapseOnBlur = enabled;
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
