import { Plugin, Notice } from 'obsidian';
import { VectorService } from './services/VectorService';

export default class UmbraPlugin extends Plugin {
	vectorService: VectorService;

	async onload() {
		console.log('Loading Umbra plugin');

		// Initialize VectorService with plugin data directory
		const dataDir = `${this.manifest.dir}/data/lancedb`;
		this.vectorService = new VectorService(this.app.vault, dataDir);

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
