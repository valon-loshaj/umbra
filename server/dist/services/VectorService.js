"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorService = void 0;
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("fs/promises"));
const module_1 = require("module");
const path_1 = __importDefault(require("path"));
const TABLE_NAME = 'notes';
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;
/** Validates that a string is a valid SHA-256 hex hash */
function isValidHexHash(value) {
    return /^[a-f0-9]{64}$/i.test(value);
}
// Use createRequire for native modules that can't be bundled
const nativeRequire = (0, module_1.createRequire)(__filename);
class VectorService {
    dataDir;
    lancedb = null;
    transformers = null;
    db = null;
    table = null;
    embeddingPipeline = null;
    initError = null;
    constructor(dataDir) {
        this.dataDir = dataDir;
    }
    getLanceDb() {
        if (!this.lancedb) {
            console.log('Loading LanceDB...');
            this.lancedb = nativeRequire('@lancedb/lancedb');
        }
        return this.lancedb;
    }
    getTransformers() {
        if (!this.transformers) {
            console.log('Loading Transformers.js...');
            this.transformers = nativeRequire('@xenova/transformers');
        }
        return this.transformers;
    }
    async getDb() {
        if (!this.db) {
            const lancedb = this.getLanceDb();
            await promises_1.default.mkdir(this.dataDir, { recursive: true });
            console.log('Connecting to LanceDB at:', this.dataDir);
            this.db = await lancedb.connect(this.dataDir);
        }
        return this.db;
    }
    async getTable() {
        if (!this.table) {
            const db = await this.getDb();
            const tableNames = await db.tableNames();
            if (tableNames.includes(TABLE_NAME)) {
                this.table = await db.openTable(TABLE_NAME);
            }
            else {
                // Create table with explicit schema using a sample record
                const schemaRecord = {
                    id: '__schema__',
                    vector: new Array(EMBEDDING_DIM).fill(0),
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
    async getPipeline() {
        if (!this.embeddingPipeline) {
            const transformers = this.getTransformers();
            console.log('Loading embedding pipeline...');
            this.embeddingPipeline = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL);
        }
        return this.embeddingPipeline;
    }
    async embed(text) {
        const embedder = await this.getPipeline();
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
    hashContent(content) {
        return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
    }
    toRelativePath(filePath, vaultPath) {
        return path_1.default.relative(vaultPath, filePath);
    }
    toAbsolutePath(relativePath, vaultPath) {
        return path_1.default.join(vaultPath, relativePath);
    }
    /**
     * Safely query by ID, validating the hash to prevent injection
     */
    async findById(table, id) {
        if (!isValidHexHash(id)) {
            throw new Error(`Invalid ID format: ${id}`);
        }
        return await table.query().where(`id = "${id}"`).limit(1).toArray();
    }
    /**
     * Safely delete by ID, validating the hash to prevent injection
     */
    async deleteById(table, id) {
        if (!isValidHexHash(id)) {
            throw new Error(`Invalid ID format: ${id}`);
        }
        await table.delete(`id = "${id}"`);
    }
    /**
     * Check if the service initialized successfully
     */
    isAvailable() {
        return this.initError === null;
    }
    /**
     * Embed a file's content and store in the vector database.
     * Skips unchanged files based on content hash.
     */
    async embedFile(filePath, content, vaultPath) {
        const table = await this.getTable();
        const relativePath = this.toRelativePath(filePath, vaultPath);
        const contentHash = this.hashContent(content);
        const id = this.hashContent(relativePath);
        const existing = await this.findById(table, id);
        if (existing.length > 0 && existing[0].content_hash === contentHash) {
            return; // Skip unchanged file
        }
        const vector = await this.embed(content);
        const record = {
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
     * Returns empty array on error (graceful degradation).
     */
    async search(query, vaultPath, limit = 10) {
        try {
            const table = await this.getTable();
            const queryVector = await this.embed(query);
            const results = await table
                .search(queryVector)
                .limit(limit)
                .toArray();
            return results.map((row) => ({
                path: this.toAbsolutePath(row.path, vaultPath),
                score: row._distance,
            }));
        }
        catch (error) {
            console.error('Vector search failed:', error);
            return [];
        }
    }
    /**
     * Index all markdown files in the vault.
     * Also cleans up stale vectors for deleted files.
     */
    async indexVault(vaultPath, excludeFolders = []) {
        const table = await this.getTable();
        const files = await this.getMarkdownFiles(vaultPath, excludeFolders);
        // Build set of current file IDs
        const currentFileIds = new Set();
        for (const file of files) {
            const relativePath = this.toRelativePath(file, vaultPath);
            currentFileIds.add(this.hashContent(relativePath));
        }
        // Get all existing vectors and find stale ones
        const allRecords = await table.query().toArray();
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
                const content = await promises_1.default.readFile(file, 'utf-8');
                await this.embedFile(file, content, vaultPath);
                indexedCount++;
            }
            catch (error) {
                console.error(`Failed to index ${file}:`, error);
            }
        }
        return { indexed: indexedCount, removed: staleIds.length };
    }
    /**
     * Remove a single file's vector from the database.
     */
    async removeVector(filePath, vaultPath) {
        const table = await this.getTable();
        const relativePath = this.toRelativePath(filePath, vaultPath);
        const id = this.hashContent(relativePath);
        await this.deleteById(table, id);
    }
    /**
     * Get all markdown files in a directory, respecting exclude folders.
     */
    async getMarkdownFiles(dir, excludeFolders = []) {
        const files = [];
        try {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                // Skip hidden files and directories
                if (entry.name.startsWith('.'))
                    continue;
                const fullPath = path_1.default.join(dir, entry.name);
                // Check if this path should be excluded
                const shouldExclude = excludeFolders.some(folder => {
                    const normalizedFolder = path_1.default.normalize(folder);
                    return fullPath.includes(normalizedFolder);
                });
                if (shouldExclude)
                    continue;
                if (entry.isDirectory()) {
                    const nested = await this.getMarkdownFiles(fullPath, excludeFolders);
                    files.push(...nested);
                }
                else if (entry.isFile() && entry.name.endsWith('.md')) {
                    files.push(fullPath);
                }
            }
        }
        catch (error) {
            console.error(`Failed to read directory ${dir}:`, error);
        }
        return files;
    }
    /**
     * Close database connections
     */
    async close() {
        this.db = null;
        this.table = null;
        this.embeddingPipeline = null;
    }
}
exports.VectorService = VectorService;
