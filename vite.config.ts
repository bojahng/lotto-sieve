import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4280,
    proxy: {
      '/sporttery-api': {
        target: 'https://webapi.sporttery.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sporttery-api/, ''),
        headers: {
          Accept: 'application/json,text/plain,*/*',
          Referer: 'https://www.sporttery.cn/kj/kjlb.html?game=dlt',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        },
      },
    },
  },
});
