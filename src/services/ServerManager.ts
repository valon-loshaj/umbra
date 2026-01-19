import { ChildProcess, spawn, execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { Notice } from 'obsidian';
import { randomBytes } from 'crypto';
import * as path from 'path';

const SERVER_PORT = 37240;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_START_TIMEOUT = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 1000; // 1 second

export class ServerManager {
	private serverProcess: ChildProcess | null = null;
	private pluginDir: string;
	private isStarting: boolean = false;
	private nodePath: string | null = null;
	private authToken: string | null = null;

	constructor(pluginDir: string) {
		this.pluginDir = pluginDir;
		this.nodePath = this.findNodePath();
	}

	/**
	 * Generate a random auth token for this session
	 */
	private generateAuthToken(): string {
		return randomBytes(32).toString('hex');
	}

	/**
	 * Get the current auth token (for use by ApiClient)
	 */
	getAuthToken(): string | null {
		return this.authToken;
	}

	/**
	 * Find Node.js executable in common locations
	 */
	private findNodePath(): string | null {
		// Try common locations
		const commonPaths = [
			'/usr/local/bin/node',
			'/opt/homebrew/bin/node',
			'/usr/bin/node',
		];

		// Check common paths first
		for (const path of commonPaths) {
			if (existsSync(path)) {
				console.log('Found node at:', path);
				return path;
			}
		}

		// Try to find nvm node
		try {
			const home = process.env.HOME || process.env.USERPROFILE;
			if (home) {
				// Look for default nvm node
				const nvmDefault = `${home}/.nvm/versions/node`;
				if (existsSync(nvmDefault)) {
					// Try to read the current version or use latest
					try {
						const versions = require('fs').readdirSync(nvmDefault);
						if (versions.length > 0) {
							// Sort and use latest version
							const latest = versions.sort().reverse()[0];
							const nvmNode = `${nvmDefault}/${latest}/bin/node`;
							if (existsSync(nvmNode)) {
								console.log('Found nvm node at:', nvmNode);
								return nvmNode;
							}
						}
					} catch (e) {
						console.error('Error reading nvm versions:', e);
					}
				}
			}
		} catch (error) {
			console.error('Error finding nvm node:', error);
		}

		// Last resort: try which command with shell
		try {
			const which = execSync('which node', { encoding: 'utf8', timeout: 3000 }).trim();
			if (which && existsSync(which)) {
				console.log('Found node via which:', which);
				return which;
			}
		} catch (error) {
			console.error('Error using which command:', error);
		}

		console.error('Could not find node binary');
		return null;
	}

	/**
	 * Verify that all required server files and dependencies are present
	 */
	private verifyServerDependencies(): { success: boolean; error?: string } {
		const serverPath = path.join(this.pluginDir, 'server');
		const serverScript = path.join(serverPath, 'dist', 'index.js');
		const nodeModules = path.join(serverPath, 'node_modules');

		// Check if server script exists
		if (!existsSync(serverScript)) {
			return {
				success: false,
				error: `Server script not found at ${serverScript}. Please reinstall the plugin.`
			};
		}

		// Check if node_modules exists
		if (!existsSync(nodeModules) || !statSync(nodeModules).isDirectory()) {
			return {
				success: false,
				error: 'Server dependencies not found. Please reinstall the plugin.'
			};
		}

		// Check for critical dependencies
		const criticalDeps = [
			'@lancedb/lancedb',
			'@xenova/transformers',
			'express',
			'cors'
		];

		for (const dep of criticalDeps) {
			const depPath = path.join(nodeModules, dep);
			if (!existsSync(depPath)) {
				return {
					success: false,
					error: `Critical dependency '${dep}' not found. Please reinstall the plugin.`
				};
			}
		}

		return { success: true };
	}

	/**
	 * Check if server is responding
	 */
	async checkHealth(silent: boolean = false): Promise<boolean> {
		try {
			const response = await fetch(`${SERVER_URL}/api/health`, {
				method: 'GET',
				signal: AbortSignal.timeout(3000), // 3 second timeout
			});
			return response.ok;
		} catch (error) {
			// Only log if not in silent mode (used during startup polling)
			if (!silent) {
				console.error('Health check failed:', error);
			}
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

		// Check if server is already running (silent check - don't log expected failures)
		if (await this.checkHealth(true)) {
			console.log('Server is already running');
			return true;
		}

		this.isStarting = true;
		new Notice('Starting Umbra server...');

		if (!this.nodePath) {
			new Notice('Node.js not found. Please install Node.js and restart Obsidian.');
			console.error('Node.js binary not found in common locations');
			this.isStarting = false;
			return false;
		}

		// Verify server dependencies before starting
		const verification = this.verifyServerDependencies();
		if (!verification.success) {
			new Notice(`Umbra: ${verification.error}`);
			console.error('Server dependency verification failed:', verification.error);
			this.isStarting = false;
			return false;
		}

		try {
			// Generate auth token for this session
			this.authToken = this.generateAuthToken();
			console.log('Generated auth token for server session');

			// Path to server entry point
			const serverPath = `${this.pluginDir}/server`;
			const serverScript = `${serverPath}/dist/index.js`;

			console.log('Starting server from:', serverScript);
			console.log('Using node at:', this.nodePath);

			// Spawn server process using found node binary
			this.serverProcess = spawn(
				this.nodePath,
				[serverScript],
				{
					cwd: serverPath,
					detached: false,
					stdio: ['pipe', 'pipe', 'pipe'], // Keep stdin open for parent monitoring
					env: {
						...process.env,
						UMBRA_AUTH_TOKEN: this.authToken,
					},
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
			// Silent check - we expect failures while server boots
			if (await this.checkHealth(true)) {
				console.log('Server is ready and responding');
				return true;
			}
			await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
		}

		console.error('Server failed to start within timeout period');
		return false;
	}

	/**
	 * Stop the server
	 */
	stop(): void {
		if (this.serverProcess && !this.serverProcess.killed) {
			console.log('Stopping Umbra server...');

			// Try graceful shutdown first
			this.serverProcess.kill('SIGTERM');

			// Force kill after 5 seconds if still running
			setTimeout(() => {
				if (this.serverProcess && !this.serverProcess.killed) {
					console.log('Server did not stop gracefully, forcing shutdown...');
					this.serverProcess.kill('SIGKILL');
				}
			}, 5000);

			this.serverProcess = null;
		}

		// Clear auth token when server stops
		this.authToken = null;
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
