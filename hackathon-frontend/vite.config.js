import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(configDir, "./src/server"),
      "@": path.resolve(configDir, "./src/client"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (/\/node_modules\/(@reduxjs\/toolkit|react-redux|redux|redux-thunk|reselect)\//.test(id)) return 'redux-vendor';
          if (id.includes('/node_modules/@radix-ui/')) return 'radix-vendor';
          if (id.includes('/node_modules/@tanstack/')) return 'tanstack-vendor';
          if (/\/node_modules\/(antd|@ant-design)\//.test(id)) return 'antd-vendor';
          if (id.includes('/node_modules/recharts/')) return 'recharts-vendor';
          if (id.includes('/node_modules/xlsx/')) return 'xlsx-vendor';
        },
      },
    },
  },
});
