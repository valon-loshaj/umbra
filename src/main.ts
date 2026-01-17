import { Plugin, Notice, normalizePath } from 'obsidian';
import { VectorService } from './services/VectorService';
import { SearchModal } from './ui/SearchModal';

export default class UmbraPlugin extends Plugin {
	vectorService: VectorService;

	async onload() {
		console.log('Loading Umbra plugin');

		// Initialize VectorService with plugin data directory
		// Get absolute path to vault root
		const adapter = this.app.vault.adapter as any;
		const vaultPath = adapter.basePath || adapter.getBasePath?.() || '';

		// configDir is .obsidian, so plugins are at .obsidian/plugins/umbra
		// Don't use normalizePath on absolute paths - it strips the leading /
		const pluginDir = `${vaultPath}/${this.app.vault.configDir}/plugins/umbra`;
		const dataDir = `${pluginDir}/data/lancedb`;

		console.log('Umbra: Vault path:', vaultPath);
		console.log('Umbra: Plugin directory:', pluginDir);
		console.log('Umbra: Data directory:', dataDir);

		this.vectorService = new VectorService(this.app.vault, dataDir, pluginDir);

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
				new SearchModal(this.app, this.vectorService).open();
			},
		});

		// Add a test command to verify the service works
		this.addCommand({
			id: 'test-vector-service',
			name: 'Test Vector Service',
			callback: async () => {
				try {
					new Notice('Testing vector service...');
					const stats = await this.vectorService.indexVault(
						[],
						(current, total) => {
							console.log(`Indexing: ${current}/${total}`);
						}
					);
					new Notice(`Indexed ${stats.indexed} files, removed ${stats.removed} stale vectors`);
				} catch (error) {
					console.error('Vector service test failed:', error);
					new Notice('Vector service test failed - check console');
				}
			}
		});

		console.log('Umbra plugin loaded successfully');
	}

	onunload() {
		console.log('Unloading Umbra plugin');
		if (this.vectorService) {
			this.vectorService.close();
		}
	}
}
