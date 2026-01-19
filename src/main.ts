import { Plugin, Notice } from 'obsidian';
import { ApiClient } from './services/ApiClient';
import { ServerManager } from './services/ServerManager';
import { SearchModal } from './ui/SearchModal';

export default class UmbraPlugin extends Plugin {
	apiClient: ApiClient;
	serverManager: ServerManager;
	statusBarItem: HTMLElement;
	healthCheckInterval: NodeJS.Timeout | null = null;

	async onload() {
		console.log('Loading Umbra plugin');

		// Get absolute path to vault root and plugin directory
		const adapter = this.app.vault.adapter as any;
		const vaultPath = adapter.basePath || adapter.getBasePath?.() || '';
		const pluginDir = `${vaultPath}/${this.app.vault.configDir}/plugins/umbra`;

		console.log('Umbra: Vault path:', vaultPath);
		console.log('Umbra: Plugin directory:', pluginDir);

		// Initialize server manager and start server
		this.serverManager = new ServerManager(pluginDir);
		const serverStarted = await this.serverManager.start();

		if (!serverStarted) {
			new Notice('Umbra: Failed to start server. Some features may not work.');
		}

		// Initialize API client
		this.apiClient = new ApiClient(vaultPath);

		// Create status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar(serverStarted);

		// Start periodic health check
		this.startHealthCheck();

		// Register search command with hotkey
		this.addCommand({
			id: 'search-notes',
			name: 'Search notes',
			hotkeys: [
				{
					modifiers: ['Mod'],
					key: 'k',
				},
			],
			callback: () => {
				new SearchModal(this.app, this.apiClient).open();
			},
		});

		// Index vault command
		this.addCommand({
			id: 'index-vault',
			name: 'Index vault',
			callback: async () => {
				try {
					new Notice('Indexing vault...');
					const stats = await this.apiClient.indexVault([]);
					new Notice(`Indexed ${stats.indexed} files, removed ${stats.removed} stale vectors`);
				} catch (error) {
					console.error('Indexing failed:', error);
					new Notice('Indexing failed - check console');
				}
			}
		});

		// Server control commands
		this.addCommand({
			id: 'start-server',
			name: 'Start server',
			callback: async () => {
				await this.serverManager.start();
			}
		});

		this.addCommand({
			id: 'stop-server',
			name: 'Stop server',
			callback: () => {
				this.serverManager.stop();
				new Notice('Umbra server stopped');
			}
		});

		this.addCommand({
			id: 'restart-server',
			name: 'Restart server',
			callback: async () => {
				new Notice('Restarting Umbra server...');
				await this.serverManager.restart();
			}
		});

		console.log('Umbra plugin loaded successfully');
	}

	onunload() {
		console.log('Unloading Umbra plugin');

		// Stop health check
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
		}

		// Stop the server
		if (this.serverManager) {
			this.serverManager.stop();
		}
	}

	/**
	 * Update status bar with server connection status
	 */
	private updateStatusBar(isConnected: boolean) {
		if (isConnected) {
			this.statusBarItem.setText('Umbra: ✓ Connected');
			this.statusBarItem.addClass('umbra-status-connected');
			this.statusBarItem.removeClass('umbra-status-disconnected');
		} else {
			this.statusBarItem.setText('Umbra: ✗ Disconnected');
			this.statusBarItem.addClass('umbra-status-disconnected');
			this.statusBarItem.removeClass('umbra-status-connected');
		}
	}

	/**
	 * Start periodic health check
	 */
	private startHealthCheck() {
		// Check every 10 seconds
		this.healthCheckInterval = setInterval(async () => {
			const isHealthy = await this.serverManager.checkHealth();
			this.updateStatusBar(isHealthy);
		}, 10000);
	}
}
