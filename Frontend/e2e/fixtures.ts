import { spawn, execFile as nodeExecFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as base } from '@playwright/test';

const BASE_PORT = 6001;

const execFile = promisify(nodeExecFile);

async function runBackendScript(
	script: string,
	args?: string[],
): Promise<void> {
	const cwd = '../Backend';
	const scriptPath = path.join(cwd, script);

	await execFile(scriptPath, args ?? [], {
		cwd,
	});
}

// biome-ignore lint/suspicious/noConfusingVoidType: used as parameter type for use()
export const test = base.extend<{ forEachWorker: void; forEachTest: void }>({
	// @ts-expect-error
	forEachWorker: [
		async ({}, use) => {
			const workerIndex = test.info().workerIndex;
			const port = BASE_PORT + workerIndex;
			const databaseURI = `sqlite:///ci${workerIndex}.db`;

			const server = spawn(
				'poetry',
				[
					'run',
					'flask',
					'--app',
					`tsh:create_app('ci.cfg', {'SQLALCHEMY_DATABASE_URI': '${databaseURI}'})`,
					'run',
					'-p',
					port.toString(),
				],
				{ cwd: '../Backend' },
			);
			await new Promise<void>((resolve, reject) => {
				server.stdout.on('data', (data: string) => {
					console.log(`stdout: ${data}`);
				});
				server.stderr.on('data', (data: string) => {
					console.log(`stderr: ${data}`);
					if (data.includes('Running on')) {
						resolve();
					}
				});

				server.on('exit', () => reject('Server died'));
			});
			await use();
			server.kill();
		},
		{ scope: 'worker', auto: true },
	],
	forEachTest: [
		async ({ page }, use) => {
			const workerIndex = test.info().workerIndex;
			const port = BASE_PORT + workerIndex;
			const databaseURI = `sqlite:///ci${workerIndex}.db`;

			await page.route(/.*:5000\/api\/.*/, async route => {
				const oldReq = route.request();

				const url = new URL(oldReq.url());
				url.port = port.toString();

				const req = new Request(url, {
					headers: oldReq.headers(),
					method: oldReq.method(),
					body: oldReq.postData(),
				});
				try {
					const res = await fetch(req);
					route.fulfill({
						status: res.status,
						headers: Object.fromEntries(res.headers.entries()),
						contentType: res.headers.get('Content-Type') ?? undefined,
						body: await res.text(),
					});
				} catch (e) {
					console.error(e);
					route.abort('connectionfailed');
				}
			});

			await runBackendScript('down.py', ['ci.cfg', databaseURI]);
			await runBackendScript('up.py', ['ci.cfg', databaseURI]);
			await runBackendScript('populate.py', ['ci.cfg', databaseURI]);
			await use();
		},
		{ auto: true },
	],
});
