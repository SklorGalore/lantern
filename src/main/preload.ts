import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared';
const bridge: Bridge = {
  request: request => ipcRenderer.invoke('lantern', request),
  setWindowTheme: theme => ipcRenderer.send('lantern:window-theme', theme),
};
contextBridge.exposeInMainWorld('lantern', bridge);
