import net from 'net';
import { randomUUID } from 'crypto';

// ============================
// Discord Rich Presence (依存パッケージなし)
// ============================
// 設計: discord-rpc 等のライブラリを使わず、ローカルの Discord クライアントが
// 公開している IPC ソケット（Windows: 名前付きパイプ \\?\pipe\discord-ipc-N）に
// 直接接続してアクティビティを送る。プロトコルは
//   フレーム = [op:int32LE][length:int32LE][utf8 JSON]
//   op: 0=HANDSHAKE, 1=FRAME, 2=CLOSE, 3=PING, 4=PONG
// Discord が起動していない場合は静かに諦め、一定間隔で再接続を試みる。

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;

export interface DiscordActivity {
  details?: string;
  state?: string;
  startTimestamp?: number; // ms epoch
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  buttons?: { label: string; url: string }[];
}

const ipcPipePath = (id: number): string => {
  // Windows は名前付きパイプ、それ以外は UNIX ドメインソケット
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${id}`;
  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    '/tmp';
  return `${base.replace(/\/$/, '')}/discord-ipc-${id}`;
};

const encode = (op: number, data: unknown): Buffer => {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
};

export class DiscordRPC {
  private clientId: string;
  private socket: net.Socket | null = null;
  private connected = false; // HANDSHAKE 後 READY を受信済み
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private currentActivity: DiscordActivity | null = null;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  // 接続を開始する。Discord が未起動でも例外にはせず再接続で待つ。
  // activity に null を渡すと接続だけ行い、プレゼンスは表示しない。
  start(activity: DiscordActivity | null): void {
    this.currentActivity = activity;
    this.destroyed = false;
    this.connect(0);
  }

  // 現在のアクティビティを差し替える（接続済みなら即送信）。
  // null を渡すとプレゼンスを消去する。
  setActivity(activity: DiscordActivity | null): void {
    this.currentActivity = activity;
    if (this.connected) this.sendActivity();
  }

  private connect(pipeId: number): void {
    if (this.destroyed || this.connected || this.socket) return;
    if (pipeId > 9) {
      // 0〜9 まで試して繋がらなければ Discord 未起動とみなし、後で再試行
      this.scheduleReconnect();
      return;
    }

    const socket = net.createConnection(ipcPipePath(pipeId));
    this.socket = socket;

    socket.on('connect', () => {
      // ハンドシェイク送信
      socket.write(encode(OP_HANDSHAKE, { v: 1, client_id: this.clientId }));
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      // 受信バッファから完結したフレームを取り出す
      while (buffer.length >= 8) {
        const op = buffer.readInt32LE(0);
        const len = buffer.readInt32LE(4);
        if (buffer.length < 8 + len) break;
        const payload = buffer.subarray(8, 8 + len).toString('utf8');
        buffer = buffer.subarray(8 + len);
        this.handleFrame(op, payload);
      }
    });

    socket.on('error', () => {
      // このパイプ ID では繋がらなかった → 次の ID を試す
      this.cleanupSocket();
      if (!this.destroyed && !this.connected) this.connect(pipeId + 1);
    });

    socket.on('close', () => {
      const wasConnected = this.connected;
      this.cleanupSocket();
      if (this.destroyed) return;
      if (wasConnected) {
        // 一度繋がっていた（Discord 終了など）→ 再接続を待つ
        this.scheduleReconnect();
      }
    });
  }

  private handleFrame(op: number, payload: string): void {
    if (op === OP_CLOSE) {
      this.cleanupSocket();
      this.scheduleReconnect();
      return;
    }
    if (op !== OP_FRAME) return;
    try {
      const data = JSON.parse(payload);
      if (data.evt === 'READY') {
        this.connected = true;
        this.sendActivity();
      }
    } catch {
      // 無視
    }
  }

  private sendActivity(): void {
    if (!this.socket || !this.connected) return;

    // currentActivity が null のときは activity を省いて送信し、プレゼンスを消去する
    if (!this.currentActivity) {
      const clearFrame = encode(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid },
        nonce: randomUUID(),
      });
      try { this.socket.write(clearFrame); } catch {}
      return;
    }

    const a = this.currentActivity;
    const activity: any = {};
    if (a.details) activity.details = a.details;
    if (a.state) activity.state = a.state;
    if (a.startTimestamp) activity.timestamps = { start: a.startTimestamp };
    if (a.largeImageKey || a.smallImageKey) {
      activity.assets = {};
      if (a.largeImageKey) activity.assets.large_image = a.largeImageKey;
      if (a.largeImageText) activity.assets.large_text = a.largeImageText;
      if (a.smallImageKey) activity.assets.small_image = a.smallImageKey;
      if (a.smallImageText) activity.assets.small_text = a.smallImageText;
    }
    if (a.buttons && a.buttons.length) activity.buttons = a.buttons.slice(0, 2);

    const frame = encode(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: randomUUID(),
    });
    try {
      this.socket.write(frame);
    } catch {
      // 書き込み失敗は close ハンドラに任せる
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(0);
    }, 15000);
  }

  private cleanupSocket(): void {
    this.connected = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
  }

  // アプリ終了時に呼ぶ。CLOSE を送ってソケットを片付ける。
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        if (this.connected) this.socket.write(encode(OP_CLOSE, {}));
      } catch {}
    }
    this.cleanupSocket();
  }
}
