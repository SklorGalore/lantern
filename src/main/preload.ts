import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared';
const bridge: Bridge = { request: request => ipcRenderer.invoke('git-sky', request) };
contextBridge.exposeInMainWorld('gitSky', bridge);
