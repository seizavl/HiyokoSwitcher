import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) =>
      ipcRenderer.on(channel, listener),
    once: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) =>
      ipcRenderer.once(channel, listener),
    removeListener: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) =>
      ipcRenderer.removeListener(channel, listener),
  },
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    focus: () => ipcRenderer.send('window-focus'),
    appReady: () => ipcRenderer.send('app-ready'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  },
  valorant: {
    fetchAccount: (name: string, tag: string) => ipcRenderer.invoke('valorant:fetchAccount', name, tag),
    fetchRank: (name: string, tag: string) => ipcRenderer.invoke('valorant:fetchRank', name, tag),
  },
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    add: (account: unknown) => ipcRenderer.invoke('accounts:add', account),
    delete: (id: string) => ipcRenderer.invoke('accounts:delete', id),
    login: (id: string) => ipcRenderer.invoke('accounts:login', id),
    macroLogin: (id: string) => ipcRenderer.invoke('accounts:macroLogin', id),
    updateRank: (id: string) => ipcRenderer.invoke('accounts:updateRank', id),
    update: (id: string, updates: { accountname?: string; accounttag?: string; riotId?: string; riotPassword?: string }) => ipcRenderer.invoke('accounts:update', id, updates),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('accounts:reorder', orderedIds),
  },
  clipboard: {
    copy: (text: string) => ipcRenderer.invoke('clipboard:copy', text),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  riot: {
    deleteYaml: () => ipcRenderer.invoke('riot:deleteYaml'),
    saveYaml: (accountId: string) => ipcRenderer.invoke('riot:saveYaml', accountId),
    restoreYaml: (accountId: string) => ipcRenderer.invoke('riot:restoreYaml', accountId),
    deleteYamlFolder: (accountId: string) => ipcRenderer.invoke('riot:deleteYamlFolder', accountId),
    killClient: () => ipcRenderer.invoke('riot:killClient'),
    launchClient: () => ipcRenderer.invoke('riot:launchClient'),
    launchValorant: () => ipcRenderer.invoke('riot:launchValorant'),
    launchLoL: () => ipcRenderer.invoke('riot:launchLoL'),
    killGames: () => ipcRenderer.invoke('riot:killGames'),
  },
  macro: {
    execute: (data: { x: number; y: number; text: string }) => ipcRenderer.invoke('macro:execute', data),
  },
  python: {
    test: () => ipcRenderer.invoke('python:test'),
    onStatus: (listener: (status: 'starting' | 'ready' | 'error') => void) => {
      const wrapped = (_event: unknown, status: 'starting' | 'ready' | 'error') => listener(status);
      ipcRenderer.on('python:status', wrapped);
      return () => ipcRenderer.removeListener('python:status', wrapped);
    },
  },
  shop: {
    getStorefront: (accountId: string) => ipcRenderer.invoke('shop:getStorefront', accountId),
  },
});
