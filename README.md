# HiyokoSwitcher

Valorant のマルチアカウント管理・自動ログインツール。

![Electron](https://img.shields.io/badge/Electron-27-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Python](https://img.shields.io/badge/Python-FastAPI-009688?logo=fastapi)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D4?logo=windows)

---

## 機能

- **アカウント管理** — 複数の Valorant アカウントを暗号化して保存・管理
- **自動ログイン** — Riot Client へのキーボードマクロによる自動ログイン / アカウント切り替え
- **ランク確認** — アカウントごとのランク・レベル・プレイヤーアイコンをまとめて表示
- **一括更新** — セッション・ランクを複数アカウントまとめてバッチ更新
- **ショップ閲覧** — デイリーショップ・ナイトマーケットの確認
- **プレイヤー検索** — 戦績・MMR の検索

---

## 必要なもの

| 項目 | バージョン |
|------|-----------|
| OS | Windows 10 / 11 (x64) |
| Node.js | 16 以上 |
| Python | 3.8 以上（開発時のみ。ビルド済み配布物には不要） |
| Henrik Dev API キー | [取得はこちら](https://docs.henrikdev.xyz/) |

---

## 開発環境のセットアップ

```bash
# 依存関係インストール
npm install --legacy-peer-deps

# Python 依存関係インストール
pip install -r backend/requirements.txt

# 開発サーバー起動（React + Electron + Python バックエンドを同時起動）
npm run dev
```

---

## ビルド

```bash
# Windows インストーラー + ポータブル exe を生成
npm run make
```

ビルドの流れ:
1. Python バックエンドを PyInstaller で `backend.exe` にコンパイル
2. TypeScript (Electron) をコンパイル
3. React を本番ビルド
4. electron-builder でパッケージング

出力先: `release/`

> Python のインストールが不要な単体動作する exe が生成されます。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| デスクトップ | Electron 27 |
| フロントエンド | React 18 / TypeScript 5 |
| バックエンド | Python / FastAPI / Uvicorn |
| 自動化 | pyautogui / pynput / pyperclip / pygetwindow |
| 配布 | electron-builder / PyInstaller |
| 外部 API | Henrik Dev Valorant API |

---

## プロジェクト構成

```
HiyokoSwitcher/
├── src/                # React フロントエンド
│   ├── components/     # 共通コンポーネント
│   └── pages/          # 各ページ (Account / Rank / Search / Setting など)
├── electron/           # Electron メインプロセス
│   ├── main.ts         # IPC ハンドラー・YAML 管理・ショップ取得
│   └── preload.ts      # IPC ブリッジ
├── backend/            # Python FastAPI バックエンド
│   └── main.py         # 自動ログインエンドポイント
└── public/             # 静的アセット・アイコン
```

---

## データの保存場所

アカウント情報・設定は実行ファイルと同じディレクトリの `data/` 以下に保存されます。パスワードは AES-256-CBC で暗号化されます。
