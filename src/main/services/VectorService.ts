import { createHash } from 'crypto'
import fs from 'fs/promises'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

import { NoteVector, NoteVectorQueryResult, SearchResult } from '../../shared/types'

const LANCEDB_DIR = path.join(os.homedir(), '.umbra', 'lancedb')
const TABLE_NAME = 'notes'
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIM = 384

/** Validates that a string is a valid SHA-256 hex hash */
function isValidHexHash(value: string): boolean {
	return /^[a-f0-9]{64}$/i.test(value)
}

/** Transformers.js pipeline output shape for feature extraction */
interface EmbeddingOutput {
	data: Float32Array
}

// Types for dynamically imported modules
type LanceDbModule = typeof import('@lancedb/lancedb')
type TransformersModule = typeof import('@xenova/transformers')
type Connection = Awaited<ReturnType<LanceDbModule['connect']>>
type Table = Awaited<ReturnType<Connection['openTable']>>
type FeatureExtractionPipeline = Awaited<ReturnType<TransformersModule['pipeline']>>

// Use createRequire for native modules that can't be bundled
const nativeRequire = createRequire(import.meta.url)

export class VectorService {
	private lancedb: LanceDbModule | null = null
	private transformers: TransformersModule | null = null
	private db: Connection | null = null
	private table: Table | null = null
	private embeddingPipeline: FeatureExtractionPipeline | null = null
	private initError: Error | null = null

	private getLanceDb(): LanceDbModule {
		if (!this.lancedb) {
			this.lancedb = nativeRequire('@lancedb/lancedb') as LanceDbModule
		}
		return this.lancedb
	}

	private getTransformers(): TransformersModule {
		if (!this.transformers) {
			this.transformers = nativeRequire('@xenova/transformers') as TransformersModule
		}
		return this.transformers
	}

	private async getDb(): Promise<Connection> {
		if (!this.db) {
			const lancedb = this.getLanceDb()
			await fs.mkdir(LANCEDB_DIR, { recursive: true })
			this.db = await lancedb.connect(LANCEDB_DIR)
		}
		return this.db
	}

	private async getTable(): Promise<Table> {
		if (!this.table) {
			const db = await this.getDb()
			const tableNames = await db.tableNames()

			if (tableNames.includes(TABLE_NAME)) {
				this.table = await db.openTable(TABLE_NAME)
			} else {
				// Create table with explicit schema using a sample record
				// LanceDB infers schema from the first record's structure
				const schemaRecord: NoteVector = {
					id: '__schema__',
					vector: new Array<number>(EMBEDDING_DIM).fill(0),
					path: '',
					content_hash: '',
					last_updated: 0,
				}
				this.table = await db.createTable(TABLE_NAME, [schemaRecord])
				// Remove the schema placeholder
				await this.table.delete('id = "__schema__"')
			}
		}
		return this.table
	}

	private async getPipeline(): Promise<FeatureExtractionPipeline> {
		if (!this.embeddingPipeline) {
			const transformers = this.getTransformers()
			this.embeddingPipeline = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL)
		}
		return this.embeddingPipeline
	}

	private async embed(text: string): Promise<number[]> {
		const embedder = await this.getPipeline()
		const output = await (embedder as (text: string, options: { pooling: string; normalize: boolean }) => Promise<EmbeddingOutput>)(
			text,
			{ pooling: 'mean', normalize: true }
		)
		return Array.from(output.data)
	}

	private hashContent(content: string): string {
		return createHash('sha256').update(content).digest('hex')
	}

	private toRelativePath(filePath: string, vaultPath: string): string {
		return path.relative(vaultPath, filePath)
	}

	private toAbsolutePath(relativePath: string, vaultPath: string): string {
		return path.join(vaultPath, relativePath)
	}

	/**
	 * Safely query by ID, validating the hash to prevent injection
	 */
	private async findById(table: Table, id: string): Promise<NoteVectorQueryResult[]> {
		if (!isValidHexHash(id)) {
			throw new Error(`Invalid ID format: ${id}`)
		}
		return await table.query().where(`id = "${id}"`).limit(1).toArray() as NoteVectorQueryResult[]
	}

	/**
	 * Safely delete by ID, validating the hash to prevent injection
	 */
	private async deleteById(table: Table, id: string): Promise<void> {
		if (!isValidHexHash(id)) {
			throw new Error(`Invalid ID format: ${id}`)
		}
		await table.delete(`id = "${id}"`)
	}

	/**
	 * Check if the service initialized successfully
	 */
	isAvailable(): boolean {
		return this.initError === null
	}

	/**
	 * Embed a file's content and store in the vector database.
	 * Skips unchanged files based on content hash.
	 */
	async embedFile(filePath: string, content: string, vaultPath: string): Promise<void> {
		const table = await this.getTable()
		const relativePath = this.toRelativePath(filePath, vaultPath)
		const contentHash = this.hashContent(content)
		const id = this.hashContent(relativePath)

		const existing = await this.findById(table, id)
		if (existing.length > 0 && existing[0].content_hash === contentHash) {
			return // Skip unchanged file
		}

		const vector = await this.embed(content)
		const record: NoteVector = {
			id,
			vector,
			path: relativePath,
			content_hash: contentHash,
			last_updated: Date.now(),
		}

		if (existing.length > 0) {
			await this.deleteById(table, id)
		}
		await table.add([record])
	}

	/**
	 * Search for notes semantically similar to the query.
	 * Returns empty array on error (graceful degradation).
	 */
	async search(query: string, vaultPath: string, limit = 10): Promise<SearchResult[]> {
		try {
			const table = await this.getTable()
			const queryVector = await this.embed(query)

			const results = await table
				.search(queryVector)
				.limit(limit)
				.toArray() as NoteVectorQueryResult[]

			return results.map((row) => ({
				path: this.toAbsolutePath(row.path, vaultPath),
				score: row._distance,
			}))
		} catch (error) {
			console.error('Vector search failed:', error)
			return []
		}
	}

	/**
	 * Index all markdown files in the vault.
	 * Also cleans up stale vectors for deleted files.
	 */
	async indexVault(vaultPath: string): Promise<{ indexed: number; removed: number }> {
		const table = await this.getTable()
		const files = await this.getMarkdownFiles(vaultPath)

		// Build set of current file IDs
		const currentFileIds = new Set<string>()
		for (const file of files) {
			const relativePath = this.toRelativePath(file, vaultPath)
			currentFileIds.add(this.hashContent(relativePath))
		}

		// Get all existing vectors and find stale ones
		const allRecords = await table.query().toArray() as NoteVectorQueryResult[]
		const staleIds = allRecords
			.filter(record => !currentFileIds.has(record.id))
			.map(record => record.id)

		// Remove stale vectors
		for (const id of staleIds) {
			await this.deleteById(table, id)
		}

		// Index current files
		let indexedCount = 0
		for (const file of files) {
			try {
				const content = await fs.readFile(file, 'utf-8')
				await this.embedFile(file, content, vaultPath)
				indexedCount++
			} catch (error) {
				console.error(`Failed to index ${file}:`, error)
			}
		}

		return { indexed: indexedCount, removed: staleIds.length }
	}

	/**
	 * Remove a single file's vector from the database.
	 */
	async removeVector(filePath: string, vaultPath: string): Promise<void> {
		const table = await this.getTable()
		const relativePath = this.toRelativePath(filePath, vaultPath)
		const id = this.hashContent(relativePath)
		await this.deleteById(table, id)
	}

	private async getMarkdownFiles(dir: string): Promise<string[]> {
		const files: string[] = []

		try {
			const entries = await fs.readdir(dir, { withFileTypes: true })

			for (const entry of entries) {
				// Skip hidden files and directories
				if (entry.name.startsWith('.')) continue

				const fullPath = path.join(dir, entry.name)
				if (entry.isDirectory()) {
					const nested = await this.getMarkdownFiles(fullPath)
					files.push(...nested)
				} else if (entry.isFile() && entry.name.endsWith('.md')) {
					files.push(fullPath)
				}
			}
		} catch (error) {
			console.error(`Failed to read directory ${dir}:`, error)
		}

		return files
	}
}

export const vectorService = new VectorService()
