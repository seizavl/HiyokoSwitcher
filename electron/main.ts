import { app, BrowserWindow, Menu, ipcMain, globalShortcut, shell, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { ChildProcess, spawn } from 'child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPT_KEY = scryptSync('valorant-manager-secret', 'salt-v1', 32);

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(data: string): string {
  const [ivHex, encHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// ============================
// Riot Cookie YAML helpers
// ============================
// 設計: 認証のたびに jar から最新クッキーを取り出し、YAML の value だけを
// 正規表現で差し替えてアトミック書き込み（tmp → rename）で永続化する。
// 「最初のセッション YAML を保持する」のではなく、認証のたびに上書き更新する。

interface RiotCookies {
  ssid?: string;
  asid?: string;
  csid?: string;
  ccid?: string;
  clid?: string;
  sub?: string;
  tdid?: string;
}

const RIOT_SESSION_COOKIE_NAMES = ['ssid', 'asid', 'csid', 'ccid', 'clid', 'sub'] as const;

// YAML からクッキーを抽出
function extractRiotCookiesFromYaml(yamlContent: string): RiotCookies | null {
  const content = yamlContent.replace(/\r\n/g, '\n');
  const cookies: RiotCookies = {};
  for (const name of RIOT_SESSION_COOKIE_NAMES) {
    const regex = new RegExp(
      `name:\\s*"?${name}"?\\s*\\n(?:\\s+\\w+:.*\\n)*?\\s+value:\\s*"([^"]*)"`,
      'm'
    );
    const match = content.match(regex);
    if (match) (cookies as any)[name] = match[1];
  }
  const tdidMatch = content.match(
    /rso-authenticator:\s*\n\s+tdid:[\s\S]*?value:\s*"([^"]*)"/
  );
  if (tdidMatch) cookies.tdid = tdidMatch[1];
  if (!cookies.ssid) return null;
  return cookies;
}

// YAML 内のクッキー value だけを差し替え（フォーマットは保持・CRLF 許容）
function applyRiotCookieUpdates(yamlContent: string, cookies: RiotCookies): string {
  let updated = yamlContent;
  for (const name of RIOT_SESSION_COOKIE_NAMES) {
    const value = cookies[name];
    if (!value) continue;
    const re = new RegExp(
      `(name:\\s*"?${name}"?\\s*\\r?\\n(?:\\s+\\w+:.*\\r?\\n)*?\\s+value:\\s*)"[^"]*"`,
      'm'
    );
    updated = updated.replace(re, `$1"${value}"`);
  }
  if (cookies.tdid) {
    const tdidRe =
      /(rso-authenticator:\s*\r?\n\s+tdid:\s*\r?\n(?:\s+\w+:.*\r?\n)*?\s+value:\s*)"[^"]*"/m;
    updated = updated.replace(tdidRe, `$1"${cookies.tdid}"`);
  }
  return updated;
}

// 認証で得た最新クッキーを YAML に書き戻す（アトミック）。
// 認証のたびに必ず呼ぶことで、保存済み YAML を最新セッションで上書き更新する。
function persistRiotCookies(yamlPath: string, cookies: RiotCookies): boolean {
  if (!fs.existsSync(yamlPath)) return false;
  const original = fs.readFileSync(yamlPath, 'utf-8');
  const updated = applyRiotCookieUpdates(original, cookies);
  const tmp = yamlPath + '.tmp';
  fs.writeFileSync(tmp, updated, 'utf-8');
  fs.renameSync(tmp, yamlPath);
  return true;
}

let mainWindow: BrowserWindow | null = null;
let isDev = false;

// プロジェクトルートを確実に取得
const getProjectRoot = (): string => {
  // package.json があるディレクトリを探す
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return __dirname;
};
let pythonProcess: ChildProcess | null = null;

const waitForPortFree = (port: number, maxWaitMs: number = 5000): Promise<void> => {
  return new Promise((resolve) => {
    const net = require('net');
    const start = Date.now();
    const check = () => {
      const tester = net.createServer();
      tester.once('error', () => {
        // ポートがまだ使用中
        if (Date.now() - start < maxWaitMs) {
          setTimeout(check, 300);
        } else {
          resolve(); // タイムアウト: そのまま起動を試みる
        }
      });
      tester.once('listening', () => {
        tester.close(() => resolve()); // ポートが空いた
      });
      tester.listen(port, '127.0.0.1');
    };
    check();
  });
};

const startPythonBackend = async (showConsole: boolean = false): Promise<void> => {
  const projectRoot = getProjectRoot();
  const baseDir = app.isPackaged ? path.dirname(app.getPath('exe')) : projectRoot;

  // PyInstaller でビルドした standalone exe を優先
  const bundledExe = path.join(baseDir, 'backend.exe');

  // dev かつ bundled exe がない場合は concurrently が起動するので skip
  if (isDev && !fs.existsSync(bundledExe)) return;

  let cmd: string;
  let args: string[];

  if (fs.existsSync(bundledExe)) {
    cmd = bundledExe;
    args = [];
    console.log(`[Python] Using bundled exe: ${bundledExe}`);
  } else {
    // フォールバック: システム Python + スクリプト
    const scriptPath = path.join(baseDir, 'backend', 'main.py');
    if (!fs.existsSync(scriptPath)) {
      console.error('Python backend not found:', scriptPath);
      return;
    }
    cmd = 'python';
    args = [scriptPath];
    console.log(`[Python] cmd=${cmd}, script=${scriptPath}`);
  }

  // 前のインスタンスの Python がポート 8000 を解放するまで待つ
  await waitForPortFree(8000, 5000);

  const spawnOptions = showConsole
    ? { stdio: 'ignore' as const, creationFlags: 0x00000010 /* CREATE_NEW_CONSOLE */ }
    : { stdio: 'pipe' as const };

  pythonProcess = spawn(cmd, args, spawnOptions);

  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Python] ${data}`);
  });
  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Python] ${data}`);
  });
  pythonProcess.on('close', (code) => {
    console.log(`Python backend exited with code ${code}`);
    pythonProcess = null;
  });
  pythonProcess.on('error', (err) => {
    console.error('[Python] Failed to start:', err);
    pythonProcess = null;
  });
};

const stopPythonBackend = (): void => {
  if (pythonProcess) {
    const pid = pythonProcess.pid;
    try {
      if (pid && process.platform === 'win32') {
        // /T で子プロセスも含めてツリーごと強制終了
        require('child_process').execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } else {
        pythonProcess.kill();
      }
    } catch (_) {}
    pythonProcess = null;
  }
};

// バックエンドが応答するまで待つ（IPC ハンドラー内で呼ぶ用）
const waitForPythonReady = (maxWaitMs: number = 30000): Promise<void> => {
  const http = require('http');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get('http://127.0.0.1:8000/api/health', (res: any) => {
        if (res.statusCode === 200) { resolve(); } else { retry(); }
        res.resume();
      });
      req.on('error', () => retry());
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - start >= maxWaitMs) {
        reject(new Error('バックエンドの起動がタイムアウトしました。しばらく待ってから再試行してください。'));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
};

// バックエンドが応答するまでポーリングし、結果を renderer に送信
const pollPythonReady = (maxWaitMs: number = 30000): void => {
  const http = require('http');
  const start = Date.now();
  let resolved = false;

  mainWindow?.webContents.send('python:status', 'starting');

  const check = () => {
    if (resolved || !mainWindow || mainWindow.isDestroyed()) return;

    const req = http.get('http://127.0.0.1:8000/api/health', (res: any) => {
      if (res.statusCode === 200) {
        resolved = true;
        mainWindow?.webContents.send('python:status', 'ready');
      } else {
        retry();
      }
      res.resume();
    });
    req.on('error', () => retry());
    req.setTimeout(1000, () => { req.destroy(); retry(); });
  };

  const retry = () => {
    if (resolved) return;
    if (Date.now() - start >= maxWaitMs) {
      mainWindow?.webContents.send('python:status', 'error');
      return;
    }
    setTimeout(check, 500);
  };

  check();
};

// アカウントデータの読み込み
const loadAccounts = (accountsFilePath: string): any[] => {
  try {
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load accounts:', error);
  }
  return [];
};

// アカウントデータの保存
const saveAccounts = (accountsFilePath: string, accounts: any[]): void => {
  try {
    fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save accounts:', error);
  }
};

// 設定データの読み込み
const loadSettings = (settingsFilePath: string): any => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return { apiKey: '' };
};

// 設定データの保存
const saveSettings = (settingsFilePath: string, settings: any): void => {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};

// Valorant API呼び出し
const fetchValorantAPI = (url: string, apiKey: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': apiKey,
        'Accept': '*/*'
      }
    };

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
};

const createWindow = (): void => {
  isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#000000',
    icon: app.isPackaged
      ? path.join(path.dirname(app.getPath('exe')), 'resources/app/public/hiyokologos.ico')
      : path.join(getProjectRoot(), 'public/hiyokologos.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true, // 開発者ツールを明示的に有効化
    },
  });


  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../index.html')}`;

  mainWindow.loadURL(startUrl);

  // Reactの描画完了通知を受け取ってからウィンドウを表示
  let appReadyReceived = false;
  ipcMain.once('app-ready', () => {
    appReadyReceived = true;
    if (!mainWindow) return;
    mainWindow.setOpacity(0);
    mainWindow.show();
    setTimeout(() => {
      mainWindow?.setOpacity(1);
    }, 50);
    // ウィンドウが表示されたらバックエンドのポーリングを開始
    pollPythonReady(30000);
  });

  // app-ready が一定時間内に来なければ強制表示（レンダラークラッシュ対策）
  setTimeout(() => {
    if (!appReadyReceived && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.setOpacity(1);
      if (isDev) {
        mainWindow.webContents.openDevTools();
      }
    }
  }, 15000);

  // 開発者ツールを開く（開発モードの場合）
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // キーボードショートカットでDevToolsを開く
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12キー - keyDownイベントのみ処理
    if (input.type === 'keyDown' && input.key.toLowerCase() === 'f12') {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
      event.preventDefault();
    }
    // Ctrl+Shift+I または Cmd+Shift+I
    if (input.type === 'keyDown' && (input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
      event.preventDefault();
    }
  });

  mainWindow.on('closed', (): void => {
    mainWindow = null;
  });
};

app.setAppUserModelId('com.hiyoko.switcher');

// 多重起動防止: 前のインスタンスがまだ終了中の場合、新しいインスタンスは終了を待ってから起動
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // 前のインスタンスが生きている → 少し待ってから再試行するよう quit して OS に任せる
  app.quit();
} else {
  app.on('second-instance', () => {
    // 別インスタンスが起動しようとしたらこちらのウィンドウを前面に出す
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // デバッグログ
  const debugLog = path.join(path.dirname(app.getPath('exe')), 'debug.log');
  const log = (msg: string) => {
    try { fs.appendFileSync(debugLog, `${new Date().toISOString()} ${msg}\n`); } catch {}
  };
  log(`isPackaged=${app.isPackaged}`);
  log(`exe=${app.getPath('exe')}`);
  log(`__dirname=${__dirname}`);

  // ファイルパス - .exeの近くに保存
  const dataDir = path.join(path.dirname(app.getPath('exe')), 'data');
  log(`dataDir=${dataDir}`);

  // dataディレクトリが存在しなければ作成
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log('dataDir created');
  }

  const accountsFilePath = path.join(dataDir, 'accounts.json');
  const settingsFilePath = path.join(dataDir, 'settings.json');

  // グローバルショートカットを登録（F12キーで開発者ツールを開く）
  globalShortcut.register('F12', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // ウィンドウ操作のIPCハンドラー
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on('window-focus', () => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
    }
  });

  // 設定取得
  ipcMain.handle('settings:get', () => {
    return loadSettings(settingsFilePath);
  });

  // 設定保存
  ipcMain.handle('settings:save', (_event, settings) => {
    saveSettings(settingsFilePath, settings);
    return true;
  });

  // Valorantアカウント情報取得
  ipcMain.handle('valorant:fetchAccount', async (_event, name: string, tag: string) => {
    try {
      const settings = loadSettings(settingsFilePath);
      const apiKey = settings.apiKey;

      if (!apiKey) {
        throw new Error('API key not set');
      }

      const url = `https://api.henrikdev.xyz/valorant/v1/account/${name}/${tag}`;
      const accountData = await fetchValorantAPI(url, apiKey);

      if (accountData.status !== 200) {
        throw new Error(`API Error: ${accountData.status}`);
      }

      return accountData.data;
    } catch (error: any) {
      console.error('Failed to fetch Valorant account:', error);
      throw error;
    }
  });

  // Valorantランク情報取得
  ipcMain.handle('valorant:fetchRank', async (_event, name: string, tag: string) => {
    try {
      const settings = loadSettings(settingsFilePath);
      const apiKey = settings.apiKey;

      if (!apiKey) {
        throw new Error('API key not set');
      }

      const url = `https://api.henrikdev.xyz/valorant/v1/mmr/ap/${name}/${tag}`;
      const rankData = await fetchValorantAPI(url, apiKey);

      if (rankData.status !== 200) {
        return {
          currenttier_patched: 'Unranked',
          images: { small: '', large: '', triangle_down: '', triangle_up: '' }
        };
      }

      return rankData.data;
    } catch (error: any) {
      console.error('Failed to fetch Valorant rank:', error);
      return {
        currenttier_patched: 'Unranked',
        images: { small: '', large: '', triangle_down: '', triangle_up: '' }
      };
    }
  });

  // アカウント取得
  ipcMain.handle('accounts:getAll', () => {
    const accounts = loadAccounts(accountsFilePath);
    return accounts.map(acc => ({
      ...acc,
      hasLoginData: !!(acc.encryptedRiotId && acc.encryptedPassword),
      // フロントに暗号化データを送らない
      encryptedRiotId: undefined,
      encryptedPassword: undefined,
    }));
  });

  // アカウント追加（APIから情報取得）
  ipcMain.handle('accounts:add', async (_event, accountInput) => {
    try {
      const settings = loadSettings(settingsFilePath);
      const apiKey = settings.apiKey;

      if (!apiKey) {
        throw new Error('API key not set. Please set it in Settings.');
      }

      // アカウント情報取得
      const accountUrl = `https://api.henrikdev.xyz/valorant/v1/account/${accountInput.accountname}/${accountInput.accounttag}`;
      const accountData = await fetchValorantAPI(accountUrl, apiKey);

      if (accountData.status !== 200) {
        throw new Error('Account not found');
      }

      // ランク情報取得
      const rankUrl = `https://api.henrikdev.xyz/valorant/v1/mmr/ap/${accountInput.accountname}/${accountInput.accounttag}`;
      const rankData = await fetchValorantAPI(rankUrl, apiKey);

      console.log('Rank API Response:', JSON.stringify(rankData, null, 2));

      const rank = rankData.status === 200 && rankData.data?.currenttierpatched
        ? rankData.data.currenttierpatched
        : 'Unranked';

      const rankIcon = rankData.status === 200 && rankData.data?.images?.large
        ? rankData.data.images.large
        : 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/largeicon.png';

      const accounts = loadAccounts(accountsFilePath);
      const newAccount: any = {
        id: Date.now().toString(),
        accountname: accountInput.accountname,
        accounttag: accountInput.accounttag,
        valorant: {
          rank: rank,
          rankicon: rankIcon,
          level: accountData.data.account_level || 1,
          usericon: accountData.data.card?.small || '',
        },
        createdAt: new Date().toISOString(),
      };

      // Riot ID / Password が渡されていれば暗号化して保存
      if (accountInput.riotId) newAccount.encryptedRiotId = encrypt(accountInput.riotId);
      if (accountInput.riotPassword) newAccount.encryptedPassword = encrypt(accountInput.riotPassword);

      accounts.push(newAccount);
      saveAccounts(accountsFilePath, accounts);
      return newAccount;
    } catch (error: any) {
      console.error('Failed to add account:', error);
      throw error;
    }
  });

  // アカウントログイン（復号して Python に渡す）
  ipcMain.handle('accounts:login', async (_event, id: string) => {
    await waitForPythonReady(30000);

    const accounts = loadAccounts(accountsFilePath);
    const account = accounts.find((a: any) => a.id === id);
    if (!account) throw new Error('アカウントが見つかりません');
    if (!account.encryptedRiotId || !account.encryptedPassword) throw new Error('ログイン情報が保存されていません');

    const settings = loadSettings(settingsFilePath);
    if (!settings.riotClientPath) throw new Error('Riot Client のパスが設定されていません');

    const riotId = decrypt(account.encryptedRiotId);
    const password = decrypt(account.encryptedPassword);

    const params = new URLSearchParams({
      account_id: riotId,
      password,
      riot_client_path: settings.riotClientPath,
      launch_second: String(settings.launchSecond ?? 5),
      extra_wait: 'false',
    });

    const result = await new Promise<any>((resolve, reject) => {
      const req = require('http').get(`http://127.0.0.1:8000/api/riot/login?${params}`, (res: any) => {
        let body = '';
        res.on('data', (d: Buffer) => { body += d.toString(); });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ status: 'error' }); } });
      });
      req.on('error', reject);
      req.setTimeout(120000, () => { req.destroy(); reject(new Error('タイムアウト')); });
    });

    return result;
  });

  // マクロログイン（stayボタンスキップ）
  ipcMain.handle('accounts:macroLogin', async (_event, id: string) => {
    await waitForPythonReady(30000);

    const accounts = loadAccounts(accountsFilePath);
    const account = accounts.find((a: any) => a.id === id);
    if (!account) throw new Error('アカウントが見つかりません');
    if (!account.encryptedRiotId || !account.encryptedPassword) throw new Error('ログイン情報が保存されていません');

    const settings = loadSettings(settingsFilePath);
    if (!settings.riotClientPath) throw new Error('Riot Client のパスが設定されていません');

    const riotId = decrypt(account.encryptedRiotId);
    const password = decrypt(account.encryptedPassword);

    const params = new URLSearchParams({
      account_id: riotId,
      password,
      riot_client_path: settings.riotClientPath,
      launch_second: String(settings.launchSecond ?? 5),
    });

    const result = await new Promise<any>((resolve, reject) => {
      const req = require('http').get(`http://127.0.0.1:8000/api/riot/macro-login?${params}`, (res: any) => {
        let body = '';
        res.on('data', (d: Buffer) => { body += d.toString(); });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ status: 'error' }); } });
      });
      req.on('error', reject);
      req.setTimeout(120000, () => { req.destroy(); reject(new Error('タイムアウト')); });
    });

    return result;
  });

  // Riot Client Data ディレクトリのパスを取得
  const getRiotDataDir = (): string => {
    return path.join(
      app.getPath('home'),
      'AppData', 'Local', 'Riot Games', 'Riot Client', 'Data'
    );
  };

  // RiotClientServices.exe が動いていれば終了する
  ipcMain.handle('riot:killClient', async () => {
    try {
      const { execSync } = require('child_process');
      // プロセスが存在するか確認
      const tasklist = execSync('tasklist /FI "IMAGENAME eq RiotClientServices.exe" /NH', { encoding: 'utf-8' });
      if (tasklist.includes('RiotClientServices.exe')) {
        execSync('taskkill /F /IM RiotClientServices.exe', { encoding: 'utf-8' });
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to kill RiotClientServices:', error);
      return false;
    }
  });

  // VALORANT と LoL のプロセスを終了する
  ipcMain.handle('riot:killGames', async () => {
    const { execSync } = require('child_process');
    const targets = ['VALORANT-Win64-Shipping.exe', 'LeagueClient.exe', 'League of Legends.exe'];
    for (const exe of targets) {
      try {
        execSync(`taskkill /F /IM "${exe}"`, { encoding: 'utf-8' });
      } catch {}
    }
    return true;
  });

  // Riot Clientを起動する
  ipcMain.handle('riot:launchClient', async () => {
    try {
      const settings = loadSettings(settingsFilePath);
      if (!settings.riotClientPath) {
        throw new Error('Riot Client のパスが設定されていません');
      }
      spawn(settings.riotClientPath, [], { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (error: any) {
      console.error('Failed to launch Riot Client:', error);
      throw error;
    }
  });

  // VALORANTを起動する
  ipcMain.handle('riot:launchValorant', async () => {
    try {
      const settings = loadSettings(settingsFilePath);
      if (!settings.riotClientPath) throw new Error('Riot Client のパスが設定されていません');
      spawn(settings.riotClientPath, ['--launch-product=valorant', '--launch-patchline=live'], { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (error: any) {
      console.error('Failed to launch VALORANT:', error);
      throw error;
    }
  });

  // League of Legendsを起動する
  ipcMain.handle('riot:launchLoL', async () => {
    try {
      const settings = loadSettings(settingsFilePath);
      if (!settings.riotClientPath) throw new Error('Riot Client のパスが設定されていません');
      spawn(settings.riotClientPath, ['--launch-product=league_of_legends', '--launch-patchline=live'], { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (error: any) {
      console.error('Failed to launch League of Legends:', error);
      throw error;
    }
  });

  // 管理対象のyamlファイル名一覧
  const RIOT_YAML_FILES = ['RiotGamesPrivateSettings.yaml', 'ShutdownData.yaml'];

  // RiotGamesPrivateSettings.yaml + ShutdownData.yaml を削除
  ipcMain.handle('riot:deleteYaml', async () => {
    const riotDataDir = getRiotDataDir();
    try {
      for (const fileName of RIOT_YAML_FILES) {
        const filePath = path.join(riotDataDir, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      return true;
    } catch (error: any) {
      console.error('Failed to delete yaml:', error);
      throw error;
    }
  });

  // yamlファイルの保存先ディレクトリ
  const yamlDir = path.join(dataDir, 'yaml');
  if (!fs.existsSync(yamlDir)) {
    fs.mkdirSync(yamlDir, { recursive: true });
  }

  // yaml ファイルをセットでコピーしてアカウントに紐づけて保存
  ipcMain.handle('riot:saveYaml', async (_event, accountId: string) => {
    const riotDataDir = getRiotDataDir();
    try {
      // RiotGamesPrivateSettings.yaml は必須
      const mainYaml = path.join(riotDataDir, 'RiotGamesPrivateSettings.yaml');
      if (!fs.existsSync(mainYaml)) {
        throw new Error('RiotGamesPrivateSettings.yaml が見つかりません');
      }
      // アカウント専用ディレクトリに保存
      const accountYamlDir = path.join(yamlDir, accountId);
      if (!fs.existsSync(accountYamlDir)) {
        fs.mkdirSync(accountYamlDir, { recursive: true });
      }
      for (const fileName of RIOT_YAML_FILES) {
        const srcPath = path.join(riotDataDir, fileName);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, path.join(accountYamlDir, fileName));
        }
      }
      return true;
    } catch (error: any) {
      console.error('Failed to save yaml:', error);
      throw error;
    }
  });

  // 保存された yaml ファイルをセットで元の場所に復元する
  ipcMain.handle('riot:restoreYaml', async (_event, accountId: string) => {
    const riotDataDir = getRiotDataDir();
    try {
      const accountYamlDir = path.join(yamlDir, accountId);
      const mainYaml = path.join(accountYamlDir, 'RiotGamesPrivateSettings.yaml');
      if (!fs.existsSync(mainYaml)) {
        console.log('復元するyamlファイルがありません');
        return false;
      }
      // 復元先ディレクトリが存在することを確認
      if (!fs.existsSync(riotDataDir)) {
        fs.mkdirSync(riotDataDir, { recursive: true });
      }
      for (const fileName of RIOT_YAML_FILES) {
        const srcPath = path.join(accountYamlDir, fileName);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, path.join(riotDataDir, fileName));
        }
      }
      return true;
    } catch (error: any) {
      console.error('Failed to restore yaml:', error);
      throw error;
    }
  });

  // 該当アカウントのyamlフォルダを削除
  ipcMain.handle('riot:deleteYamlFolder', (_event, accountId: string) => {
    const accountYamlDir = path.join(yamlDir, accountId);
    if (fs.existsSync(accountYamlDir)) {
      fs.rmSync(accountYamlDir, { recursive: true, force: true });
      console.log(`Deleted yaml folder: ${accountYamlDir}`);
      return true;
    }
    return false;
  });

  // アカウント削除
  ipcMain.handle('accounts:delete', (_event, id) => {
    const accounts = loadAccounts(accountsFilePath);
    const filteredAccounts = accounts.filter(acc => acc.id !== id);
    saveAccounts(accountsFilePath, filteredAccounts);
    // 該当アカウントのyamlフォルダも削除
    const yamlAccountDir = path.join(dataDir, 'yaml', id);
    if (fs.existsSync(yamlAccountDir)) {
      fs.rmSync(yamlAccountDir, { recursive: true, force: true });
      console.log(`Deleted yaml folder: ${yamlAccountDir}`);
    }
    return true;
  });

  // アカウント情報を編集
  ipcMain.handle('accounts:update', async (_event, id: string, updates: { accountname?: string; accounttag?: string; riotId?: string; riotPassword?: string; memo?: string }) => {
    const accounts = loadAccounts(accountsFilePath);
    const account = accounts.find((a: any) => a.id === id);
    if (!account) throw new Error('アカウントが見つかりません');

    const nameChanged = (updates.accountname && updates.accountname !== account.accountname) ||
                        (updates.accounttag && updates.accounttag !== account.accounttag);

    if (updates.accountname) account.accountname = updates.accountname;
    if (updates.accounttag) account.accounttag = updates.accounttag.replace(/^#/, '');
    if (updates.memo !== undefined) account.memo = updates.memo;
    if (updates.riotId !== undefined) {
      account.encryptedRiotId = updates.riotId ? encrypt(updates.riotId) : undefined;
    }
    if (updates.riotPassword !== undefined) {
      account.encryptedPassword = updates.riotPassword ? encrypt(updates.riotPassword) : undefined;
    }

    // 名前・タグが変わったらランク情報を再取得
    if (nameChanged) {
      try {
        const settings = loadSettings(settingsFilePath);
        const apiKey = settings.apiKey;
        if (apiKey) {
          const accountUrl = `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(account.accountname)}/${encodeURIComponent(account.accounttag)}`;
          const accountData = await fetchValorantAPI(accountUrl, apiKey);

          const rankUrl = `https://api.henrikdev.xyz/valorant/v1/mmr/ap/${encodeURIComponent(account.accountname)}/${encodeURIComponent(account.accounttag)}`;
          const rankData = await fetchValorantAPI(rankUrl, apiKey);

          const rank = rankData.status === 200 && rankData.data?.currenttierpatched
            ? rankData.data.currenttierpatched
            : 'Unranked';
          const rankIcon = rankData.status === 200 && rankData.data?.images?.large
            ? rankData.data.images.large
            : 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/largeicon.png';

          account.valorant = {
            rank,
            rankicon: rankIcon,
            level: accountData.data?.account_level || 0,
            usericon: accountData.data?.card?.small || '',
          };
        }
      } catch (error) {
        console.error('Failed to fetch rank on update:', error);
      }
    }

    saveAccounts(accountsFilePath, accounts);
    return {
      ...account,
      hasLoginData: !!(account.encryptedRiotId && account.encryptedPassword),
    };
  });

  // アカウントの並び順を保存
  ipcMain.handle('accounts:reorder', (_event, orderedIds: string[]) => {
    const accounts = loadAccounts(accountsFilePath);
    const ordered = orderedIds
      .map((id) => accounts.find((a: any) => a.id === id))
      .filter(Boolean);
    // orderedIdsに含まれないアカウントがあれば末尾に追加
    const remaining = accounts.filter((a: any) => !orderedIds.includes(a.id));
    saveAccounts(accountsFilePath, [...ordered, ...remaining]);
    return true;
  });

  // アカウントのランク情報を更新
  ipcMain.handle('accounts:updateRank', async (_event, id: string) => {
    const accounts = loadAccounts(accountsFilePath);
    const account = accounts.find((a: any) => a.id === id);
    if (!account) throw new Error('アカウントが見つかりません');

    const settings = loadSettings(settingsFilePath);
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('APIキーが設定されていません');

    const accountUrl = `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(account.accountname)}/${encodeURIComponent(account.accounttag)}`;
    const accountData = await fetchValorantAPI(accountUrl, apiKey);

    const rankUrl = `https://api.henrikdev.xyz/valorant/v1/mmr/ap/${encodeURIComponent(account.accountname)}/${encodeURIComponent(account.accounttag)}`;
    const rankData = await fetchValorantAPI(rankUrl, apiKey);

    const rank = rankData.status === 200 && rankData.data?.currenttierpatched
      ? rankData.data.currenttierpatched
      : 'Unranked';

    const rankIcon = rankData.status === 200 && rankData.data?.images?.large
      ? rankData.data.images.large
      : 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/largeicon.png';

    // accountData が 200 でない（レート制限など）場合は既存の level/usericon を温存する
    const prev = account.valorant ?? {};
    const accountOk = accountData.status === 200;
    account.valorant = {
      rank,
      rankicon: rankIcon,
      level: accountOk ? (accountData.data?.account_level ?? prev.level ?? 0) : (prev.level ?? 0),
      usericon: accountOk ? (accountData.data?.card?.small ?? prev.usericon ?? '') : (prev.usericon ?? ''),
    };

    saveAccounts(accountsFilePath, accounts);
    return account;
  });

  // クリップボードにテキストをコピー
  ipcMain.handle('clipboard:copy', (_event, text: string) => {
    clipboard.writeText(text);
    return true;
  });

  // 外部URLをブラウザで開く
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url);
    return true;
  });

  // Python テスト
  ipcMain.handle('python:test', async () => {
    const results: { label: string; status: 'ok' | 'error'; detail: string }[] = [];

    // 1. Python バージョン確認
    await new Promise<void>((resolve) => {
      const proc = spawn('python', ['-c', 'import sys; print(sys.version)'], { stdio: 'pipe' });
      let out = '';
      let err = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && out.trim()) {
          results.push({ label: 'Python', status: 'ok', detail: out.trim() });
        } else {
          results.push({ label: 'Python', status: 'error', detail: err.trim() || 'Python が見つかりません' });
        }
        resolve();
      });
      proc.on('error', () => {
        results.push({ label: 'Python', status: 'error', detail: 'Python が見つかりません' });
        resolve();
      });
    });

    // 2. FastAPI ヘルスチェック
    await new Promise<void>((resolve) => {
      const req = require('http').get('http://127.0.0.1:8000/api/health', (res: any) => {
        let body = '';
        res.on('data', (d: Buffer) => { body += d.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            results.push({ label: 'FastAPI', status: json.status === 'ok' ? 'ok' : 'error', detail: body.trim() });
          } catch {
            results.push({ label: 'FastAPI', status: 'error', detail: body.trim() || 'レスポンス解析失敗' });
          }
          resolve();
        });
      });
      req.on('error', () => {
        results.push({ label: 'FastAPI', status: 'error', detail: 'サーバーに接続できません (port 8000)' });
        resolve();
      });
      req.setTimeout(3000, () => {
        req.destroy();
        results.push({ label: 'FastAPI', status: 'error', detail: 'タイムアウト (3s)' });
        resolve();
      });
    });

    return results;
  });

  // マクロ実行（macro.py を直接 spawn）
  ipcMain.handle('macro:execute', async (_event, data: { x: number; y: number; text: string }) => {
    try {
      const settings = loadSettings(settingsFilePath);
      const riotClientPath = settings.riotClientPath;

      if (!riotClientPath) {
        throw new Error('Riot Clientのパスが設定されていません');
      }

      const [accountId, password] = data.text.split('\t');

      const macroScript = isDev
        ? path.join(getProjectRoot(), 'backend', 'macro.py')
        : path.join(path.dirname(app.getPath('exe')), 'backend/macro.py');

      const response = await new Promise<any>((resolve) => {
        const proc = spawn('python', [
          macroScript,
          accountId,
          password,
          riotClientPath,
          String(settings.launchSecond ?? 5),
          'false',
        ], {
          detached: true,
          stdio: 'pipe',
        });
        proc.stdout?.on('data', (d: Buffer) => console.log('[macro]', d.toString()));
        proc.stderr?.on('data', (d: Buffer) => console.error('[macro err]', d.toString()));
        proc.on('error', (e: Error) => console.error('[macro spawn error]', e));
        proc.unref();
        resolve({ success: true });
      });

      // ウィンドウを最小化（macro.py が動く間）
      if (mainWindow) {
        mainWindow.minimize();
      }

      // ウィンドウを復元
      if (mainWindow) {
        mainWindow.restore();
        mainWindow.focus();
      }

      if (!response.success) {
        throw new Error(response.error || 'マクロ実行に失敗しました');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to execute auto-login:', error);

      if (mainWindow) {
        mainWindow.restore();
        mainWindow.focus();
      }

      throw error;
    }
  });

  // ============================
  // Shop 機能 (ストアフロント取得)
  // ============================

  // Simple Cookie Jar
  // setInitial で YAML から読んだクッキーを積み、handleSetCookies で
  // 認証レスポンスの Set-Cookie を取り込む。認証後 getCookies() で
  // 構造化された値を取り出し、persistRiotCookies で YAML に書き戻す。
  class SimpleCookieJar {
    private cookies: Map<string, string> = new Map();

    setInitial(cookies: RiotCookies) {
      for (const [name, value] of Object.entries(cookies)) {
        if (value) this.cookies.set(name, value);
      }
    }

    handleSetCookies(setCookies: string[]) {
      for (const header of setCookies) {
        const nameValue = header.split(';')[0];
        const eqIndex = nameValue.indexOf('=');
        if (eqIndex > 0) {
          const name = nameValue.substring(0, eqIndex).trim();
          const value = nameValue.substring(eqIndex + 1).trim();
          this.cookies.set(name, value);
        }
      }
    }

    getCookieString(): string {
      return Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }

    // 永続化対象のクッキーだけ構造化して返す
    getCookies(): RiotCookies {
      const result: RiotCookies = {};
      for (const name of [...RIOT_SESSION_COOKIE_NAMES, 'tdid'] as const) {
        const value = this.cookies.get(name);
        if (value) (result as any)[name] = value;
      }
      return result;
    }
  }

  // HTTPS リクエストヘルパー
  function shopHttpsRequest(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<{
    statusCode: number;
    headers: Record<string, any>;
    body: string;
    setCookies: string[];
  }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const reqOptions: any = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = https.request(reqOptions, (res) => {
        const setCookies = Array.isArray(res.headers['set-cookie'])
          ? res.headers['set-cookie']
          : res.headers['set-cookie']
          ? [res.headers['set-cookie']]
          : [];

        // 3xx リダイレクト → 追従せずそのまま返す
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: '',
            setCookies,
          });
          res.resume();
          return;
        }

        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: data,
            setCookies,
          })
        );
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  // スキン情報キャッシュ (メモリ)
  let skinCache: Map<string, any> | null = null;
  let tierCache: Map<string, any> | null = null;

  async function ensureSkinCache(): Promise<void> {
    if (skinCache && tierCache) return;

    // スキンデータ取得
    const skinsRes = await shopHttpsRequest(
      'https://valorant-api.com/v1/weapons/skins?language=ja-JP',
      {}
    );
    const skinsData = JSON.parse(skinsRes.body);
    skinCache = new Map();
    for (const skin of skinsData.data) {
      if (skin.levels) {
        for (const level of skin.levels) {
          skinCache.set(level.uuid, {
            uuid: skin.uuid,
            displayName: skin.displayName,
            displayIcon: level.displayIcon || skin.displayIcon,
            tierUuid: skin.contentTierUuid,
          });
        }
      }
    }

    // ティアデータ取得
    const tiersRes = await shopHttpsRequest(
      'https://valorant-api.com/v1/contenttiers',
      {}
    );
    const tiersData = JSON.parse(tiersRes.body);
    tierCache = new Map();
    for (const tier of tiersData.data) {
      tierCache.set(tier.uuid, {
        displayName: tier.devName,
        displayIcon: tier.displayIcon,
        highlightColor: tier.highlightColor,
        rank: tier.rank,
      });
    }
  }

  // ストアフロント取得 IPC ハンドラー
  ipcMain.handle('shop:getStorefront', async (_event, accountId: string) => {
    // 1. 保存済み YAML 読み込み
    const yamlPath = path.join(yamlDir, accountId, 'RiotGamesPrivateSettings.yaml');
    if (!fs.existsSync(yamlPath)) {
      throw new Error('ログインデータが見つかりません。セッション更新でログインデータを取得してください。');
    }

    const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
    const cookies = extractRiotCookiesFromYaml(yamlContent);
    if (!cookies) {
      throw new Error('Cookieが見つかりません（再ログインが必要です）');
    }

    // 2. バージョン情報取得
    const versionRes = await shopHttpsRequest('https://valorant-api.com/v1/version', {});
    const versionData = JSON.parse(versionRes.body);
    const clientVersion = versionData.data.riotClientVersion;
    const clientBuild = versionData.data.riotClientBuild;
    const userAgent = `RiotClient/${clientBuild} rso-auth (Windows;10;;Professional, x64)`;

    // 3. Cookie Jar 設定
    const jar = new SimpleCookieJar();
    jar.setInitial(cookies);

    // 4. POST authorization（セッション確立）
    const authBody = JSON.stringify({
      client_id: 'play-valorant-web-prod',
      nonce: '1',
      redirect_uri: 'https://playvalorant.com/opt_in',
      response_type: 'token id_token',
      scope: 'account openid',
    });

    const step1 = await shopHttpsRequest(
      'https://auth.riotgames.com/api/v1/authorization',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: jar.getCookieString(),
          'User-Agent': userAgent,
        },
        body: authBody,
      }
    );
    jar.handleSetCookies(step1.setCookies);

    // 5. GET authorize（リダイレクト → access_token 抽出）
    const authorizeUrl =
      'https://auth.riotgames.com/authorize?client_id=play-valorant-web-prod&nonce=1&redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&response_type=token%20id_token&scope=account%20openid';

    const step2 = await shopHttpsRequest(authorizeUrl, {
      method: 'GET',
      headers: {
        Cookie: jar.getCookieString(),
        'User-Agent': userAgent,
      },
    });
    jar.handleSetCookies(step2.setCookies);

    const location = step2.headers.location;
    if (!location) {
      throw new Error('認証に失敗しました（Cookieが期限切れの可能性があります。更新ボタンを押してください）');
    }

    const tokenMatch = location.match(/access_token=([^&]+)/);
    if (!tokenMatch) {
      throw new Error('認証に失敗しました（access_tokenが取得できません）');
    }
    const accessToken = tokenMatch[1];

    // 6. Entitlements Token 取得
    const step3 = await shopHttpsRequest(
      'https://entitlements.auth.riotgames.com/api/token/v1',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
    const entitlementsToken = JSON.parse(step3.body).entitlements_token;

    // 7. PUUID 取得
    let puuid = cookies.sub || '';
    if (!puuid) {
      const step4 = await shopHttpsRequest('https://auth.riotgames.com/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      puuid = JSON.parse(step4.body).sub;
    }

    // 8. Shard 決定
    let shard = 'ap';
    if (cookies.clid) {
      shard = cookies.clid.replace(/\d+$/, '') || 'ap';
    }

    // 9. Storefront 取得（3 エンドポイントをフォールバック）
    const X_RIOT_CLIENT_PLATFORM =
      'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

    const storeHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'X-Riot-Entitlements-JWT': entitlementsToken,
      'X-Riot-ClientPlatform': X_RIOT_CLIENT_PLATFORM,
      'X-Riot-ClientVersion': clientVersion,
    };

    const storeEndpoints = [
      { method: 'GET', url: `https://pd.${shard}.a.pvp.net/store/v2/storefront/${puuid}` },
      { method: 'POST', url: `https://pd.${shard}.a.pvp.net/store/v3/storefront/${puuid}`, body: '{}' },
      { method: 'GET', url: `https://pd.${shard}.a.pvp.net/store/v1/storefront/${puuid}` },
    ];

    let storefrontData: any = null;
    for (const ep of storeEndpoints) {
      try {
        const res = await shopHttpsRequest(ep.url, {
          method: ep.method,
          headers: {
            ...storeHeaders,
            ...(ep.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: ep.body,
        });
        if (res.statusCode === 200) {
          storefrontData = JSON.parse(res.body);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!storefrontData) {
      throw new Error('ショップデータの取得に失敗しました');
    }

    // 10. スキン情報キャッシュ読み込み
    await ensureSkinCache();

    // 11. デイリーショップ パース
    const skinPanel = storefrontData.SkinsPanelLayout;
    const dailyOfferUuids: string[] = skinPanel?.SingleItemOffers || [];
    const dailyRemainingSeconds: number =
      skinPanel?.SingleItemOffersRemainingDurationInSeconds || 0;

    // コストマップ
    const costMap: Record<string, number> = {};
    if (skinPanel?.SingleItemStoreOffers) {
      for (const offer of skinPanel.SingleItemStoreOffers) {
        costMap[offer.OfferID] = offer.Cost
          ? (Object.values(offer.Cost)[0] as number)
          : 0;
      }
    }

    const resolveSkin = (uuid: string, vpCost: number) => {
      const skin = skinCache!.get(uuid);
      const tier = skin?.tierUuid ? tierCache!.get(skin.tierUuid) : null;
      return {
        skinUuid: uuid,
        skinName: skin?.displayName || 'Unknown',
        skinIcon:
          skin?.displayIcon ||
          `https://media.valorant-api.com/weaponskinlevels/${uuid}/displayicon.png`,
        vpCost,
        tierColor: tier?.highlightColor
          ? '#' + tier.highlightColor.substring(0, 6)
          : '#383e3a',
        tierIcon: tier?.displayIcon || '',
      };
    };

    const dailyOffers = dailyOfferUuids.map((uuid) =>
      resolveSkin(uuid, costMap[uuid] || 0)
    );

    // 12. ナイトマーケット パース
    let nightMarket: any[] | null = null;
    let nightMarketRemainingSeconds: number | null = null;

    if (storefrontData.BonusStore) {
      nightMarketRemainingSeconds =
        storefrontData.BonusStore.BonusStoreRemainingDurationInSeconds || 0;
      nightMarket = (storefrontData.BonusStore.BonusStoreOffers || []).map(
        (offer: any) => {
          const uuid = offer.Offer.OfferID;
          const baseCost = offer.Offer.Cost
            ? (Object.values(offer.Offer.Cost)[0] as number)
            : 0;
          const discountCost = offer.DiscountCosts
            ? (Object.values(offer.DiscountCosts)[0] as number)
            : 0;
          return {
            ...resolveSkin(uuid, discountCost),
            baseCost,
            discountCost,
            discountPercent: offer.DiscountPercent || 0,
          };
        }
      );
    }

    // 13. 認証で得た最新クッキーを YAML に永続化（毎回上書き、アトミック）
    persistRiotCookies(yamlPath, jar.getCookies());

    return {
      dailyOffers,
      dailyRemainingSeconds,
      nightMarket,
      nightMarketRemainingSeconds,
    };
  });

  const settings = loadSettings(settingsFilePath);
  startPythonBackend(settings.showPythonConsole === true); // await しない: ウィンドウ表示と並行して起動
  createWindow();
});

app.on('before-quit', (): void => {
  stopPythonBackend();
});

app.on('window-all-closed', (): void => {
  // Pythonバックエンドを停止
  stopPythonBackend();
  // グローバルショートカットを解除
  globalShortcut.unregisterAll();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', (): void => {
  if (mainWindow === null) {
    createWindow();
  }
});

// メニューの設定
const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Exit',
        accelerator: 'CmdOrCtrl+Q',
        click: (): void => {
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
    ],
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Toggle Developer Tools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: (): void => {
          if (mainWindow) {
            mainWindow.webContents.toggleDevTools();
          }
        },
      },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: (): void => {
          if (mainWindow) {
            mainWindow.reload();
          }
        },
      },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
