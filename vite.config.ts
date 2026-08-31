import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages などのサブパス配信に対応するため base を環境変数で切り替える
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), '').BASE_PATH || '/',
  plugins: [react()],
  server: { host: true },
}));
