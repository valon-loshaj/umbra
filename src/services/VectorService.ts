import { createHash } from 'crypto';
import { createRequire } from 'module';
import { normalizePath, TFile, Vault } from 'obsidian';

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

// Lazy-loaded module types
type LanceDbModule = any;
type TransformersModule = any;
type Connection = any;
type Table = any;
type FeatureExtractionPipeline = any;

export class VectorService {
	private vault: Vault;
	private dataDir: string;
	private pluginDir: string;
	private pluginRequire: NodeRequire | null = null;
	private lancedb: LanceDbModule | null = null;
	private transformers: TransformersModule | null = null;
	private db: Connection | null = null;
	private table: Table | null = null;
	private embeddingPipeline: FeatureExtractionPipeline | null = null;
	private initError: Error | null = null;

	constructor(vault: Vault, dataDir: string, pluginDir: string) {
		this.vault = vault;
		this.dataDir = dataDir;
		this.pluginDir = pluginDir;

		// Create a require function that resolves modules from the plugin directory
		try {
			// Create a fake module path in the plugin directory for createRequire
			const fakePath = `${pluginDir}/package.json`;
			this.pluginRequire = createRequire(fakePath);
			console.log('Created plugin require from:', fakePath);
		} catch (error) {
			console.error('Failed to create plugin require:', error);
			this.initError = error as Error;
		}
	}

	private async getLanceDb(): Promise<LanceDbModule> {
		if (!this.lancedb && this.pluginRequire) {
			console.log('Loading LanceDB with plugin require...');
			this.lancedb = this.pluginRequire('@lancedb/lancedb');
		}
		return this.lancedb;
	}

	private async getTransformers(): Promise<TransformersModule> {
		if (!this.transformers && this.pluginRequire) {
			console.log('Loading Transformers.js with plugin require...');
			this.transformers = this.pluginRequire('@xenova/transformers');
		}
		return this.transformers;
	}

	private async getDb(): Promise<Connection> {
		if (!this.db) {
			const lancedb = await this.getLanceDb();
			this.db = await lancedb.connect(this.dataDir);
		}
		return this.db;
	}

	private async getTable(): Promise<Table> {
		if (!this.table) {
			const db = await this.getDb();
			const tableNames = await db.tableNames();

			if (tableNames.includes(TABLE_NAME)) {
				this.table = await db.openTable(TABLE_NAME);
			} else {
				// Create table with explicit schema using a sample record
				const schemaRecord: NoteVector = {
					id: '__schema__',
					vector: new Array<number>(EMBEDDING_DIM).fill(0),
					path: '',
					content_hash: '',
					last_updated: 0,
				};
				this.table = await db.createTable(TABLE_NAME, [schemaRecord]);
				// Remove the schema placeholder
				await this.table.delete('id = "__schema__"');
			}
		}
		return this.table;
	}

	private async getPipeline(): Promise<FeatureExtractionPipeline> {
		if (!this.embeddingPipeline) {
			const transformers = await this.getTransformers();
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
	async embedFile(file: TFile): Promise<void> {
		try {
			const table = await this.getTable();
			const content = await this.vault.read(file);
			const contentHash = this.hashContent(content);
			const id = this.hashContent(file.path);

			const existing = await this.findById(table, id);
			if (existing.length > 0 && existing[0].content_hash === contentHash) {
				return; // Skip unchanged file
			}

			const vector = await this.embed(content);
			const record: NoteVector = {
				id,
				vector,
				path: file.path,
				content_hash: contentHash,
				last_updated: Date.now(),
			};

			if (existing.length > 0) {
				await this.deleteById(table, id);
			}
			await table.add([record]);
		} catch (error) {
			console.error(`Failed to embed file ${file.path}:`, error);
			throw error;
		}
	}

	/**
	 * Search for notes semantically similar to the query.
	 * Returns empty array on error (graceful degradation).
	 */
	async search(query: string, limit = 10): Promise<SearchResult[]> {
		try {
			const table = await this.getTable();
			const queryVector = await this.embed(query);

			const results = await table
				.search(queryVector)
				.limit(limit)
				.toArray() as NoteVectorQueryResult[];

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
	async indexVault(
		excludeFolders: string[] = [],
		onProgress?: (current: number, total: number) => void
	): Promise<IndexStats> {
		const table = await this.getTable();
		const files = this.vault.getMarkdownFiles();

		// Filter out excluded folders
		const filteredFiles = files.filter(file => {
			return !excludeFolders.some(folder => file.path.startsWith(folder));
		});

		// Build set of current file IDs
		const currentFileIds = new Set<string>();
		for (const file of filteredFiles) {
			currentFileIds.add(this.hashContent(file.path));
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
		for (let i = 0; i < filteredFiles.length; i++) {
			try {
				await this.embedFile(filteredFiles[i]);
				indexedCount++;
				if (onProgress) {
					onProgress(i + 1, filteredFiles.length);
				}
			} catch (error) {
				console.error(`Failed to index ${filteredFiles[i].path}:`, error);
			}
		}

		return { indexed: indexedCount, removed: staleIds.length };
	}

	/**
	 * Remove a single file's vector from the database.
	 */
	async removeVector(file: TFile): Promise<void> {
		try {
			const table = await this.getTable();
			const id = this.hashContent(file.path);
			await this.deleteById(table, id);
		} catch (error) {
			console.error(`Failed to remove vector for ${file.path}:`, error);
		}
	}

	/**
	 * Handle file rename by removing old vector and adding new one.
	 */
	async handleRename(file: TFile, oldPath: string): Promise<void> {
		try {
			const table = await this.getTable();
			const oldId = this.hashContent(oldPath);
			await this.deleteById(table, oldId);
			await this.embedFile(file);
		} catch (error) {
			console.error(`Failed to handle rename for ${file.path}:`, error);
		}
	}

	/**
	 * Close database connections
	 */
	async close(): Promise<void> {
		// LanceDB connections are automatically managed
		this.db = null;
		this.table = null;
		this.embeddingPipeline = null;
	}
}
