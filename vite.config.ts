import { defineConfig } from 'vite';

// 纯前端单页应用，零后端。base 用相对路径，便于静态托管（GitHub Pages / 双击打开）。
export default defineConfig({
  base: './',
  // 优先用环境变量 PORT（便于多实例并行/预览工具分配端口），否则回退默认 5173
  server: { port: Number(process.env.PORT) || 5173, open: false },
  build: { outDir: 'dist', target: 'es2022' },
});
