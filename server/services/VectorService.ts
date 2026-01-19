import { createHash } from 'crypto';
import fs from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';

import { NoteVector, NoteVectorQueryResult, SearchResult, IndexStats } from '../types';

const TABLE_NAME = 'notes';
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

/** Validates that a string is a valid SHA-256 hex hash */
function isValidHexHash(value: string): boolean {
	return /^[a-f0-9]{64}$/i.test(value);
}

/** Transformers.js pipeline output shape for feature extraction */
interface EmbeddingOutput {
	data: Float32Array;
}

// Types for dynamically imported modules
type LanceDbModule = typeof import('@lancedb/lancedb');
type TransformersModule = typeof import('@xenova/transformers');
type Connection = Awaited<ReturnType<LanceDbModule['connect']>>;
type Table = Awaited<ReturnType<Connection['openTable']>>;
type FeatureExtractionPipeline = Awaited<ReturnType<TransformersModule['pipeline']>>;

// Use createRequire for native modules that can't be bundled
const nativeRequire = createRequire(__filename);

export class VectorService {
	private baseDataDir: string;
	private lancedb: LanceDbModule | null = null;
	private transformers: TransformersModule | null = null;
	// Store per-vault database connections and tables
	private vaultDbs: Map<string, Connection> = new Map();
	private vaultTables: Map<string, Table> = new Map();
	private embeddingPipeline: FeatureExtractionPipeline | null = null;
	private initError: Error | null = null;

	constructor(baseDataDir: string) {
		this.baseDataDir = baseDataDir;
	}

	/**
	 * Create a vault-specific hash for namespacing
	 */
	private getVaultHash(vaultPath: string): string {
		return createHash('sha256').update(vaultPath).digest('hex').substring(0, 16);
	}

	/**
	 * Get the data directory for a specific vault
	 */
	private getVaultDataDir(vaultPath: string): string {
		const vaultHash = this.getVaultHash(vaultPath);
		return path.join(this.baseDataDir, vaultHash);
	}

	private getLanceDb(): LanceDbModule {
		if (!this.lancedb) {
			console.log('Loading LanceDB...');
			this.lancedb = nativeRequire('@lancedb/lancedb') as LanceDbModule;
		}
		return this.lancedb;
	}

	private getTransformers(): TransformersModule {
		if (!this.transformers) {
			console.log('Loading Transformers.js...');
			this.transformers = nativeRequire('@xenova/transformers') as TransformersModule;
		}
		return this.transformers;
	}

	private async getDb(vaultPath: string): Promise<Connection> {
		const vaultHash = this.getVaultHash(vaultPath);

		if (!this.vaultDbs.has(vaultHash)) {
			const lancedb = this.getLanceDb();
			const vaultDataDir = this.getVaultDataDir(vaultPath);
			await fs.mkdir(vaultDataDir, { recursive: true });
			console.log(`Connecting to LanceDB for vault ${vaultHash} at:`, vaultDataDir);
			const db = await lancedb.connect(vaultDataDir);
			this.vaultDbs.set(vaultHash, db);
		}

		return this.vaultDbs.get(vaultHash)!;
	}

	private async getTable(vaultPath: string): Promise<Table> {
		const vaultHash = this.getVaultHash(vaultPath);

		if (!this.vaultTables.has(vaultHash)) {
			const db = await this.getDb(vaultPath);
			const tableNames = await db.tableNames();

			let table: Table;
			if (tableNames.includes(TABLE_NAME)) {
				table = await db.openTable(TABLE_NAME);
			} else {
				// Create table with explicit schema using a sample record
				const schemaRecord: NoteVector = {
					id: '__schema__',
					vector: new Array<number>(EMBEDDING_DIM).fill(0),
					path: '',
					content_hash: '',
					last_updated: 0,
				};
				table = await db.createTable(TABLE_NAME, [schemaRecord]);
				// Remove the schema placeholder
				await table.delete('id = "__schema__"');
			}

			this.vaultTables.set(vaultHash, table);
		}

		return this.vaultTables.get(vaultHash)!;
	}

	private async getPipeline(): Promise<FeatureExtractionPipeline> {
		if (!this.embeddingPipeline) {
			const transformers = this.getTransformers();
			console.log('Loading embedding pipeline...');
			this.embeddingPipeline = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL);
		}
		return this.embeddingPipeline;
	}

	private async embed(text: string): Promise<number[]> {
		const embedder = await this.getPipeline();
		const output = await (embedder as (text: string, options: { pooling: string; normalize: boolean }) => Promise<EmbeddingOutput>)(
			text,
			{ pooling: 'mean', normalize: true }
		);
		return Array.from(output.data);
	}

	private hashContent(content: string): string {
		return createHash('sha256').update(content).digest('hex');
	}

	/**
	 * Convert absolute file path to vault-relative path with forward slashes
	 * (Obsidian API expects forward slashes regardless of OS)
	 */
	private toRelativePath(filePath: string, vaultPath: string): string {
		const relative = path.relative(vaultPath, filePath);
		// Normalize to forward slashes for cross-platform compatibility
		return relative.split(path.sep).join('/');
	}

	/**
	 * Convert vault-relative path to absolute path
	 * (handles both forward and backslashes)
	 */
	private toAbsolutePath(relativePath: string, vaultPath: string): string {
		// Normalize vault-relative path to OS-specific separators
		const normalized = relativePath.split('/').join(path.sep);
		return path.join(vaultPath, normalized);
	}

	/**
	 * Safely query by ID, validating the hash to prevent injection
	 */
	private async findById(table: Table, id: string): Promise<NoteVectorQueryResult[]> {
		if (!isValidHexHash(id)) {
			throw new Error(`Invalid ID format: ${id}`);
		}
		return await table.query().where(`id = "${id}"`).limit(1).toArray() as NoteVectorQueryResult[];
	}

	/**
	 * Safely delete by ID, validating the hash to prevent injection
	 */
	private async deleteById(table: Table, id: string): Promise<void> {
		if (!isValidHexHash(id)) {
			throw new Error(`Invalid ID format: ${id}`);
		}
		await table.delete(`id = "${id}"`);
	}

	/**
	 * Check if the service initialized successfully
	 */
	isAvailable(): boolean {
		return this.initError === null;
	}

	/**
	 * Embed a file's content and store in the vector database.
	 * Skips unchanged files based on content hash.
	 */
	async embedFile(filePath: string, content: string, vaultPath: string): Promise<void> {
		const table = await this.getTable(vaultPath);
		const relativePath = this.toRelativePath(filePath, vaultPath);
		const contentHash = this.hashContent(content);
		const id = this.hashContent(relativePath);

		const existing = await this.findById(table, id);
		if (existing.length > 0 && existing[0].content_hash === contentHash) {
			return; // Skip unchanged file
		}

		const vector = await this.embed(content);
		const record: NoteVector = {
			id,
			vector,
			path: relativePath,
			content_hash: contentHash,
			last_updated: Date.now(),
		};

		if (existing.length > 0) {
			await this.deleteById(table, id);
		}
		await table.add([record]);
	}

	/**
	 * Search for notes semantically similar to the query.
	 * Returns vault-relative paths with forward slashes (as Obsidian expects).
	 * Returns empty array on error (graceful degradation).
	 */
	async search(query: string, vaultPath: string, limit = 10): Promise<SearchResult[]> {
		try {
			const table = await this.getTable(vaultPath);
			const queryVector = await this.embed(query);

			const results = await table
				.search(queryVector)
				.limit(limit)
				.toArray() as NoteVectorQueryResult[];

			// Return vault-relative paths (already stored with forward slashes)
			return results.map((row) => ({
				path: row.path,
				score: row._distance,
			}));
		} catch (error) {
			console.error('Vector search failed:', error);
			return [];
		}
	}

	/**
	 * Index all markdown files in the vault.
	 * Also cleans up stale vectors for deleted files.
	 */
	async indexVault(vaultPath: string, excludeFolders: string[] = []): Promise<IndexStats> {
		const table = await this.getTable(vaultPath);
		const files = await this.getMarkdownFiles(vaultPath, excludeFolders);

		// Build set of current file IDs
		const currentFileIds = new Set<string>();
		for (const file of files) {
			const relativePath = this.toRelativePath(file, vaultPath);
			currentFileIds.add(this.hashContent(relativePath));
		}

		// Get all existing vectors and find stale ones
		const allRecords = await table.query().toArray() as NoteVectorQueryResult[];
		const staleIds = allRecords
			.filter(record => !currentFileIds.has(record.id))
			.map(record => record.id);

		// Remove stale vectors
		for (const id of staleIds) {
			await this.deleteById(table, id);
		}

		// Index current files
		let indexedCount = 0;
		for (const file of files) {
			try {
				const content = await fs.readFile(file, 'utf-8');
				await this.embedFile(file, content, vaultPath);
				indexedCount++;
			} catch (error) {
				console.error(`Failed to index ${file}:`, error);
			}
		}

		return { indexed: indexedCount, removed: staleIds.length };
	}

	/**
	 * Remove a single file's vector from the database.
	 */
	async removeVector(filePath: string, vaultPath: string): Promise<void> {
		const table = await this.getTable(vaultPath);
		const relativePath = this.toRelativePath(filePath, vaultPath);
		const id = this.hashContent(relativePath);
		await this.deleteById(table, id);
	}

	/**
	 * Get all markdown files in a directory, respecting exclude folders.
	 * Uses segment-aware matching to avoid false positives.
	 */
	private async getMarkdownFiles(dir: string, excludeFolders: string[] = [], vaultPath?: string): Promise<string[]> {
		const files: string[] = [];
		const actualVaultPath = vaultPath || dir;

		// Normalize exclude folders to forward-slash separated segments
		const normalizedExcludes = excludeFolders.map(folder => {
			// Remove leading/trailing slashes and normalize to forward slashes
			return folder.replace(/^\/+|\/+$/g, '').split(path.sep).join('/');
		});

		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				// Skip hidden files and directories
				if (entry.name.startsWith('.')) continue;

				const fullPath = path.join(dir, entry.name);

				// Convert to vault-relative path with forward slashes for comparison
				const relativePath = this.toRelativePath(fullPath, actualVaultPath);
				const pathSegments = relativePath.split('/');

				// Check if this path should be excluded using segment-aware matching
				const shouldExclude = normalizedExcludes.some(excludeFolder => {
					const excludeSegments = excludeFolder.split('/');

					// Check if the exclude folder matches as a prefix of the path
					if (excludeSegments.length > pathSegments.length) {
						return false;
					}

					// Match each segment
					for (let i = 0; i < excludeSegments.length; i++) {
						if (excludeSegments[i] !== pathSegments[i]) {
							return false;
						}
					}

					return true;
				});

				if (shouldExclude) continue;

				if (entry.isDirectory()) {
					const nested = await this.getMarkdownFiles(fullPath, excludeFolders, actualVaultPath);
					files.push(...nested);
				} else if (entry.isFile() && entry.name.endsWith('.md')) {
					files.push(fullPath);
				}
			}
		} catch (error) {
			console.error(`Failed to read directory ${dir}:`, error);
		}

		return files;
	}

	/**
	 * Close database connections
	 */
	async close(): Promise<void> {
		this.vaultDbs.clear();
		this.vaultTables.clear();
		this.embeddingPipeline = null;
	}
}
