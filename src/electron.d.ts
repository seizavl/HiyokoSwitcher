export interface Account {
  id: string;
  accountname: string;
  accounttag: string;
  valorant: {
    rank: string;
    rankicon: string;
    level: number;
    usericon: string;
  };
  createdAt: string;
  hasLoginData?: boolean;
  memo?: string;
}

export interface LoginClickPositions {
  stayButtonX?: number;
  stayButtonY?: number;
  loginButtonX?: number;
  loginButtonY?: number;
}

export interface AppSettings {
  apiKey?: string;
  riotClientPath?: string;
  launchSecond?: number;
  loginClickPositions?: LoginClickPositions;
  autoCheckValorant?: boolean;
  autoCheckApp?: boolean;
  liveGameTab?: boolean;
  activeAccountId?: string;
}

interface ElectronAPI {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    once: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    focus: () => void;
    appReady: () => void;
  };
  accounts: {
    getAll: () => Promise<Account[]>;
    add: (account: Omit<Account, 'id' | 'createdAt'>) => Promise<Account>;
    delete: (id: string) => Promise<boolean>;
    login: (id: string) => Promise<{ status: string }>;
    macroLogin: (id: string) => Promise<{ status: string }>;
    updateRank: (id: string) => Promise<Account>;
    update: (id: string, updates: { accountname?: string; accounttag?: string; riotId?: string; riotPassword?: string; memo?: string }) => Promise<Account>;
    reorder: (orderedIds: string[]) => Promise<boolean>;
  };
  clipboard: {
    copy: (text: string) => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<boolean>;
  };
  riot: {
    switchData: (accountId: string | null) => Promise<boolean>;
    clearSession: (accountId: string | null) => Promise<boolean>;
    restoreSession: (accountId: string | null) => Promise<boolean>;
    deleteYamlFolder: (accountId: string) => Promise<boolean>;
    killClient: () => Promise<boolean>;
    launchClient: () => Promise<boolean>;
    launchValorant: () => Promise<boolean>;
    launchLoL: () => Promise<boolean>;
    killGames: () => Promise<boolean>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<void>;
  };
  python: {
    test: () => Promise<{ label: string; status: 'ok' | 'error'; detail: string }[]>;
    onStatus: (listener: (status: 'starting' | 'ready' | 'error') => void) => () => void;
  };
  shop: {
    getStorefront: (accountId: string, force?: boolean) => Promise<ShopStorefront>;
  };
  livegame: {
    getState: () => Promise<'ingame' | 'pregame' | 'menus' | 'not_running'>;
    getMatchData: (force?: boolean) => Promise<LiveGameResult>;
  };
}

export interface LiveGamePlayer {
  puuid: string;
  name: string;
  tag: string;
  team: string;
  agentName: string;
  agentIcon: string;
  rankName: string;
  rankIcon: string;
  accountLevel: number;
  isSelf: boolean;
}

export interface LiveGameResult {
  state: 'not_running' | 'menus' | 'pregame' | 'ingame' | 'error';
  matchId?: string;
  players?: LiveGamePlayer[];
  error?: string;
}

export interface ShopItem {
  skinUuid: string;
  skinName: string;
  skinIcon: string;
  vpCost: number;
  tierColor: string;
  tierIcon: string;
}

export interface NightMarketItem extends ShopItem {
  baseCost: number;
  discountCost: number;
  discountPercent: number;
}

export interface ShopStorefront {
  dailyOffers: ShopItem[];
  dailyRemainingSeconds: number;
  nightMarket: NightMarketItem[] | null;
  nightMarketRemainingSeconds: number | null;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
