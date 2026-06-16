import { contextBridge, ipcRenderer } from 'electron';
import type { AkDailyApi, AkDailyData, WidgetMode } from '../shared/types';

const api: AkDailyApi = {
  getData: () => ipcRenderer.invoke('ak-daily:get-data'),
  saveData: (data: AkDailyData) => ipcRenderer.invoke('ak-daily:save-data', data),
  setWidgetMode: (mode: WidgetMode) => ipcRenderer.invoke('dotday:set-widget-mode', mode),
  onWidgetModeChanged: (callback: (mode: WidgetMode) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: WidgetMode): void => callback(mode);

    ipcRenderer.on('dotday:widget-mode-changed', listener);

    return () => {
      ipcRenderer.removeListener('dotday:widget-mode-changed', listener);
    };
  },
  closeWindow: () => ipcRenderer.invoke('dotday:close-window'),
};

contextBridge.exposeInMainWorld('akDaily', api);
