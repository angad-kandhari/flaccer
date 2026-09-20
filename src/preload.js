'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('flaccer', {
  template: () => ipcRenderer.invoke('template'),
  debugState: () => ipcRenderer.invoke('debugState'),
  openFiles: () => ipcRenderer.invoke('dialog:open'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  relink: (name) => ipcRenderer.invoke('dialog:relink', name),
  scan: (paths) => ipcRenderer.invoke('scan', paths),
  exists: (paths) => ipcRenderer.invoke('exists', paths),
  fit: (w, h) => ipcRenderer.send('fit', { w, h }),
  zoom: (z) => ipcRenderer.send('zoom', z),
  pin: (flag) => ipcRenderer.send('pin', !!flag),
  ready: () => ipcRenderer.send('ready'),
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch (e) { return ''; } },
  mediaUrl: (p) => 'flaccer://app/media/' + encodeURIComponent(p),
  reveal: (p) => ipcRenderer.send('reveal', p),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, id) => cb(id)),
  onOpen: (cb) => ipcRenderer.on('open', (_e, paths) => cb(paths)),
});
