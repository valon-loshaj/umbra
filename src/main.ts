import { Plugin, Notice, DataAdapter } from 'obsidian';
import { ApiClient } from './services/ApiClient';
import { ServerManager } from './services/ServerManager';
import { SearchModal } from './ui/SearchModal';

/**
 * Extended DataAdapter interface for type-safe access to vault path
 * Desktop adapter has basePath property, mobile has getBasePath() method
 */
interface VaultAdapter extends DataAdapter {
	basePath?: string;
	getBasePath?(): string;
}

/**
 * Type guard to check if adapter has proper vault path access
 */
function isVaultAdapter(adapter: DataAdapter): adapter is VaultAdapter {
	return 'basePath' in adapter || 'getBasePath' in adapter;
}

/**
 * Safely get the vault path from the adapter with runtime guards
 */
function getVaultPath(adapter: DataAdapter): string {
	if (!isVaultAdapter(adapter)) {
		throw new Error('Vault adapter does not have basePath or getBasePath');
	}

	if (adapter.basePath) {
		return adapter.basePath;
	}

	if (adapter.getBasePath) {
		return adapter.getBasePath();
	}

	throw new Error('Unable to determine vault path from adapter');
}

export default class UmbraPlugin extends Plugin {
	apiClient: ApiClient;
	serverManager: ServerManager;
	statusBarItem: HTMLElement;
	healthCheckInterval: NodeJS.Timeout | null = null;

	async onload() {
		console.log('Loading Umbra plugin');

		// Get absolute path to vault root and plugin directory with type safety
		const vaultPath = getVaultPath(this.app.vault.adapter);
		const pluginDir = `${vaultPath}/${this.app.vault.configDir}/plugins/umbra`;

		console.log('Umbra: Vault path:', vaultPath);
		console.log('Umbra: Plugin directory:', pluginDir);

		// Initialize server manager and start server
		this.serverManager = new ServerManager(pluginDir);
		const serverStarted = await this.serverManager.start();

		if (!serverStarted) {
			new Notice('Umbra: Failed to start server. Some features may not work.');
		}

		// Initialize API client with server manager for auth
		this.apiClient = new ApiClient(vaultPath, this.serverManager);

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
		// Check every 10 seconds (silent to avoid console spam)
		this.healthCheckInterval = setInterval(async () => {
			const isHealthy = await this.serverManager.checkHealth(true);
			this.updateStatusBar(isHealthy);

			// Log status changes only
			if (!isHealthy) {
				console.warn('Umbra server connection lost');
			}
		}, 10000);
	}
}
