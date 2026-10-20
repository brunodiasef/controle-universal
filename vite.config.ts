import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// base relativa: o mesmo build funciona em https://usuario.github.io/qualquer-repo/ e em http://IP-DO-PC:4317/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
