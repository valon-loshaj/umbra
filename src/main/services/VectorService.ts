import { createHash } from 'crypto'
import fs from 'fs/promises'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

import { SearchResult } from '../../shared/types'

const LANCEDB_DIR = path.join(os.homedir(), '.umbra', 'lancedb')
const TABLE_NAME = 'notes'
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIM = 384

interface NoteVectorRecord {
	id: string
	vector: number[]
	path: string
	content_hash: string
	last_updated: number
	[key: string]: unknown
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
				const placeholder: NoteVectorRecord = {
					id: '',
					vector: Array(EMBEDDING_DIM).fill(0) as number[],
					path: '',
					content_hash: '',
					last_updated: 0,
				}
				this.table = await db.createTable(TABLE_NAME, [placeholder])
				await this.table.delete('id = ""')
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const output = await (embedder as any)(text, { pooling: 'mean', normalize: true })
		return Array.from(output.data as Float32Array)
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

	async embedFile(filePath: string, content: string, vaultPath: string): Promise<void> {
		const table = await this.getTable()
		const relativePath = this.toRelativePath(filePath, vaultPath)
		const contentHash = this.hashContent(content)
		const id = this.hashContent(relativePath)

		const existing = await table.search([]).where(`id = "${id}"`).limit(1).toArray()
		if (existing.length > 0 && existing[0].content_hash === contentHash) {
			return
		}

		const vector = await this.embed(content)
		const record: NoteVectorRecord = {
			id,
			vector,
			path: relativePath,
			content_hash: contentHash,
			last_updated: Date.now(),
		}

		if (existing.length > 0) {
			await table.delete(`id = "${id}"`)
		}
		await table.add([record])
	}

	async search(query: string, vaultPath: string, limit = 10): Promise<SearchResult[]> {
		const table = await this.getTable()
		const queryVector = await this.embed(query)

		const results = await table
			.search(queryVector)
			.limit(limit)
			.toArray()

		return results.map((row) => ({
			path: this.toAbsolutePath(row.path as string, vaultPath),
			score: row._distance as number,
		}))
	}

	async indexVault(vaultPath: string): Promise<void> {
		const files = await this.getMarkdownFiles(vaultPath)

		for (const file of files) {
			try {
				const content = await fs.readFile(file, 'utf-8')
				await this.embedFile(file, content, vaultPath)
			} catch (error) {
				console.error(`Failed to index ${file}:`, error)
			}
		}
	}

	async removeVector(filePath: string, vaultPath: string): Promise<void> {
		const table = await this.getTable()
		const relativePath = this.toRelativePath(filePath, vaultPath)
		const id = this.hashContent(relativePath)
		await table.delete(`id = "${id}"`)
	}

	private async getMarkdownFiles(dir: string): Promise<string[]> {
		const files: string[] = []
		const entries = await fs.readdir(dir, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				const nested = await this.getMarkdownFiles(fullPath)
				files.push(...nested)
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				files.push(fullPath)
			}
		}

		return files
	}
}

export const vectorService = new VectorService()
