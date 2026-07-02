import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages のプロジェクトページ https://<user>.github.io/HiyokoSwitcher/ 配下に公開するため
// アセットの参照パスをリポジトリ名でプレフィックスする
export default defineConfig({
  base: '/HiyokoSwitcher/',
  plugins: [react()],
})
