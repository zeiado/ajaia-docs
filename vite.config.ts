import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localProxy } from './dev/proxy';
const target = process.env.RECORDS_LOCAL_API || 'http://127.0.0.1:8000';
const proxy = localProxy(target);
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } }, server: { host: '127.0.0.1', proxy }, preview: { host: '127.0.0.1', proxy }, build: { outDir: 'dist' } });
