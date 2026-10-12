/// <reference types="vitest/config" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			$: path.resolve(__dirname, './src'),
		},
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:5000',
				changeOrigin: true,
			},
		},
	},
	test: {
		include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],

		coverage: {
			provider: 'v8',

			// Show results in the terminal and create a browser-readable report.
			reporter: ['text', 'html'],

			// Include source files even when no unit test imports them.
			include: ['src/**/*.{ts,tsx}'],

			// Test files and TypeScript declarations are not application code.
			exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
		},
	},
});
