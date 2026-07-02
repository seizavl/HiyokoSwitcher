# HiyokoSwitcher Website

HiyokoSwitcher のランディングページ（Vite + React + TypeScript）。

`main` ブランチへの push で `website/**` に変更があると、GitHub Actions
（[`.github/workflows/deploy-website.yml`](../.github/workflows/deploy-website.yml)）が
自動的にビルドして GitHub Pages（`https://seizavl.github.io/HiyokoSwitcher/`）へデプロイする。

## 開発

```bash
npm install
npm run dev
```

## ビルド確認

```bash
npm run build
npm run preview
```
