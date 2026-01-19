import { SearchResult, IndexStats } from '../types';

const SERVER_URL = 'http://localhost:37240';

export interface ApiHealthResponse {
	status: 'ok' | 'error';
	version: string;
	uptime: number;
}

export class ApiClient {
	private vaultPath: string;

	constructor(vaultPath: string) {
		this.vaultPath = vaultPath;
	}

	/**
	 * Check if the server is healthy and responding
	 */
	async checkHealth(): Promise<ApiHealthResponse | null> {
		try {
			const response = await fetch(`${SERVER_URL}/api/health`);
			if (!response.ok) {
				return null;
			}
			return await response.json();
		} catch (error) {
			console.error('Health check failed:', error);
			return null;
		}
	}

	/**
	 * Search for notes semantically similar to the query
	 */
	async search(query: string, limit = 10): Promise<SearchResult[]> {
		try {
			const response = await fetch(`${SERVER_URL}/api/search`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query,
					limit,
					vaultPath: this.vaultPath,
				}),
			});

			if (!response.ok) {
				console.error('Search request failed:', response.statusText);
				return [];
			}

			const data = await response.json();
			return data.results || [];
		} catch (error) {
			console.error('Search failed:', error);
			return [];
		}
	}

	/**
	 * Index all markdown files in the vault
	 */
	async indexVault(excludeFolders: string[] = [], onProgress?: (current: number, total: number) => void): Promise<IndexStats> {
		try {
			const response = await fetch(`${SERVER_URL}/api/index`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					vaultPath: this.vaultPath,
					excludeFolders,
				}),
			});

			if (!response.ok) {
				console.error('Index request failed:', response.statusText);
				return { indexed: 0, removed: 0 };
			}

			const data = await response.json();
			return data.stats || { indexed: 0, removed: 0 };
		} catch (error) {
			console.error('Index failed:', error);
			return { indexed: 0, removed: 0 };
		}
	}

	/**
	 * Embed a single file
	 */
	async embedFile(filePath: string, content: string): Promise<boolean> {
		try {
			const response = await fetch(`${SERVER_URL}/api/embed`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					filePath,
					content,
					vaultPath: this.vaultPath,
				}),
			});

			if (!response.ok) {
				console.error('Embed request failed:', response.statusText);
				return false;
			}

			const data = await response.json();
			return data.success || false;
		} catch (error) {
			console.error('Embed failed:', error);
			return false;
		}
	}

	/**
	 * Remove a file's vector from the database
	 */
	async removeVector(filePath: string): Promise<boolean> {
		try {
			const response = await fetch(`${SERVER_URL}/api/vector`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					filePath,
					vaultPath: this.vaultPath,
				}),
			});

			if (!response.ok) {
				console.error('Remove vector request failed:', response.statusText);
				return false;
			}

			const data = await response.json();
			return data.success || false;
		} catch (error) {
			console.error('Remove vector failed:', error);
			return false;
		}
	}
}
