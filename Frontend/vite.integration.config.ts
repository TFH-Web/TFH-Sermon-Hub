import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import config from './vite.config.ts';

export default mergeConfig(config, {
	// Do not discover a developer's .env while running the isolated browser fixture.
	envDir: false,
	server: {
		host: '127.0.0.1',
		port: 5360,
		strictPort: true,
		// Worktree developers may share node_modules through a directory junction.
		fs: { allow: [process.cwd(), realpathSync(resolve('node_modules'))] },
		proxy: {
			'/api': { target: 'http://127.0.0.1:6200', changeOrigin: true },
			'/__e2e__': { target: 'http://127.0.0.1:6200', changeOrigin: true },
		},
	},
});
