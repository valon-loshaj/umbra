import { SearchResult, IndexStats, ChangePlan, LibrarianAction, ApplyResult } from '../types';
import { ServerManager } from './ServerManager';

const SERVER_URL = 'http://localhost:37240';

export interface ApiHealthResponse {
	status: 'ok' | 'error';
	version: string;
	uptime: number;
}

export class ApiClient {
	private vaultPath: string;
	private serverManager: ServerManager;

	constructor(vaultPath: string, serverManager: ServerManager) {
		this.vaultPath = vaultPath;
		this.serverManager = serverManager;
	}

	/**
	 * Get auth headers for API requests
	 */
	private getAuthHeaders(): Record<string, string> {
		const token = this.serverManager.getAuthToken();
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		return headers;
	}

	/**
	 * Check if the server is healthy and responding
	 */
	async checkHealth(silent: boolean = false): Promise<ApiHealthResponse | null> {
		try {
			const response = await fetch(`${SERVER_URL}/api/health`);
			if (!response.ok) {
				return null;
			}
			return await response.json();
		} catch (error) {
			// Only log if not in silent mode
			if (!silent) {
				console.error('Health check failed:', error);
			}
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
				headers: this.getAuthHeaders(),
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
	 * Index all markdown files in the vault with optional progress updates via SSE
	 */
	async indexVault(
		excludeFolders: string[] = [],
		onProgress?: (current: number, total: number) => void
	): Promise<IndexStats> {
		return new Promise((resolve, reject) => {
			const token = this.serverManager.getAuthToken();
			const params = new URLSearchParams({
				vaultPath: this.vaultPath,
				excludeFolders: excludeFolders.join(','),
				token: token || '',
			});

			const eventSource = new EventSource(
				`${SERVER_URL}/api/index/stream?${params}`
			);

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.type === 'progress') {
						onProgress?.(data.current, data.total);
					} else if (data.type === 'complete') {
						eventSource.close();
						resolve(data.stats);
					} else if (data.type === 'error') {
						eventSource.close();
						reject(new Error(data.message));
					}
				} catch (parseError) {
					console.error('Failed to parse SSE data:', parseError);
				}
			};

			eventSource.onerror = () => {
				eventSource.close();
				reject(new Error('Connection lost during indexing'));
			};
		});
	}

	/**
	 * Embed a single file
	 */
	async embedFile(filePath: string, content: string): Promise<boolean> {
		try {
			const response = await fetch(`${SERVER_URL}/api/embed`, {
				method: 'POST',
				headers: this.getAuthHeaders(),
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
				headers: this.getAuthHeaders(),
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

	/**
	 * Process daily notes with the librarian agent
	 */
	async librarianProcess(
		dailyNotesFolder: string,
		apiKey: string,
		maxNotes?: number
	): Promise<{ plan: ChangePlan | null; error?: string }> {
		try {
			const response = await fetch(`${SERVER_URL}/api/librarian/process`, {
				method: 'POST',
				headers: this.getAuthHeaders(),
				body: JSON.stringify({
					vaultPath: this.vaultPath,
					dailyNotesFolder,
					maxNotes,
					apiKey,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				return { plan: null, error: error.error || response.statusText };
			}

			const data = await response.json();
			if (data.success && data.plan) {
				return { plan: data.plan };
			}
			return { plan: null, error: data.error || 'Unknown error' };
		} catch (error) {
			console.error('Librarian process failed:', error);
			return { plan: null, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	}

	/**
	 * Apply approved librarian changes
	 */
	async librarianApply(
		actions: LibrarianAction[],
		archiveFolder: string,
		notesToArchive: string[]
	): Promise<ApplyResult> {
		try {
			const response = await fetch(`${SERVER_URL}/api/librarian/apply`, {
				method: 'POST',
				headers: this.getAuthHeaders(),
				body: JSON.stringify({
					vaultPath: this.vaultPath,
					actions,
					archiveFolder,
					notesToArchive,
				}),
			});

			if (!response.ok) {
				return {
					success: false,
					applied: [],
					archived: [],
					errors: [{ action: 'request', error: response.statusText }],
				};
			}

			return await response.json();
		} catch (error) {
			console.error('Librarian apply failed:', error);
			return {
				success: false,
				applied: [],
				archived: [],
				errors: [{ action: 'request', error: error instanceof Error ? error.message : 'Unknown error' }],
			};
		}
	}
}
