# Valorant App

Electron + React + TypeScript で構築されたデスクトップアプリケーション。

## 必要な環境

- Node.js 16.0.0 以上
- npm 8.0.0 以上

## インストール

```bash
npm install
```

## 開発モード

```bash
npm run dev
```

このコマンドで React 開発サーバーと Electron が同時に起動します。

## プロダクションビルド

```bash
npm run build
```

## プロジェクト構造

```
.
├── src/                      # React アプリケーションのソースコード
│   ├── App.tsx              # メインコンポーネント
│   ├── App.css              # スタイル
│   └── index.tsx            # エントリーポイント
├── electron/                # Electron メインプロセスのコード
│   ├── main.ts              # メインプロセス
│   └── preload.ts           # プリロードスクリプト
├── public/                  # 静的資産
│   └── index.html           # HTML テンプレート
├── package.json             # プロジェクト設定
├── tsconfig.json            # TypeScript 設定
└── .vscode/                 # VS Code 設定
    ├── launch.json          # デバッグ設定
    └── tasks.json           # タスク設定
```

## 使用可能なスクリプト

- `npm run dev` - 開発モードで起動
- `npm run build` - プロダクションビルド
- `npm run react-start` - React 開発サーバーのみ起動
- `npm run electron-start` - Electron のみ起動
- `npm run dist` - 配布可能なパッケージを生成

## ライセンス

MIT
