import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared';
const bridge: Bridge = { request: request => ipcRenderer.invoke('lantern', request) };
contextBridge.exposeInMainWorld('lantern', bridge);
