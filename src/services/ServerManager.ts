import { ChildProcess, spawn } from 'child_process';
import { Notice } from 'obsidian';

const SERVER_PORT = 37240;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_START_TIMEOUT = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 1000; // 1 second

export class ServerManager {
	private serverProcess: ChildProcess | null = null;
	private pluginDir: string;
	private isStarting: boolean = false;

	constructor(pluginDir: string) {
		this.pluginDir = pluginDir;
	}

	/**
	 * Check if server is responding
	 */
	async checkHealth(): Promise<boolean> {
		try {
			const response = await fetch(`${SERVER_URL}/api/health`, {
				method: 'GET',
				signal: AbortSignal.timeout(3000), // 3 second timeout
			});
			return response.ok;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Start the Umbra server
	 */
	async start(): Promise<boolean> {
		if (this.isStarting) {
			console.log('Server is already starting...');
			return false;
		}

		// Check if server is already running
		if (await this.checkHealth()) {
			console.log('Server is already running');
			return true;
		}

		this.isStarting = true;
		new Notice('Starting Umbra server...');

		try {
			// Path to server entry point
			const serverPath = `${this.pluginDir}/server`;
			const serverScript = `${serverPath}/index.ts`;

			console.log('Starting server from:', serverScript);

			// Spawn server process using tsx (TypeScript runner)
			this.serverProcess = spawn(
				'npx',
				['tsx', serverScript],
				{
					cwd: serverPath,
					detached: false,
					stdio: ['ignore', 'pipe', 'pipe'],
				}
			);

			// Log server output
			this.serverProcess.stdout?.on('data', (data) => {
				console.log('[Umbra Server]', data.toString().trim());
			});

			this.serverProcess.stderr?.on('data', (data) => {
				console.error('[Umbra Server Error]', data.toString().trim());
			});

			this.serverProcess.on('exit', (code) => {
				console.log(`Server process exited with code ${code}`);
				this.serverProcess = null;
			});

			this.serverProcess.on('error', (error) => {
				console.error('Server process error:', error);
				this.serverProcess = null;
			});

			// Wait for server to be ready
			const isReady = await this.waitForServer(SERVER_START_TIMEOUT);

			if (isReady) {
				new Notice('Umbra server started successfully');
				return true;
			} else {
				new Notice('Failed to start Umbra server - check console for details');
				this.stop();
				return false;
			}
		} catch (error) {
			console.error('Failed to start server:', error);
			new Notice('Failed to start Umbra server');
			return false;
		} finally {
			this.isStarting = false;
		}
	}

	/**
	 * Wait for server to become ready
	 */
	private async waitForServer(timeout: number): Promise<boolean> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeout) {
			if (await this.checkHealth()) {
				return true;
			}
			await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
		}

		return false;
	}

	/**
	 * Stop the server
	 */
	stop(): void {
		if (this.serverProcess) {
			console.log('Stopping Umbra server...');
			this.serverProcess.kill('SIGTERM');
			this.serverProcess = null;
		}
	}

	/**
	 * Restart the server
	 */
	async restart(): Promise<boolean> {
		this.stop();
		await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
		return await this.start();
	}

	/**
	 * Check if server process is running
	 */
	isRunning(): boolean {
		return this.serverProcess !== null && !this.serverProcess.killed;
	}
}
