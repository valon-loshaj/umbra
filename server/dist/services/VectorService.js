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
const MarkdownChunker_1 = require("./MarkdownChunker");
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
    baseDataDir;
    lancedb = null;
    transformers = null;
    // Store per-vault database connections and tables
    vaultDbs = new Map();
    vaultTables = new Map();
    embeddingPipeline = null;
    initError = null;
    constructor(baseDataDir) {
        this.baseDataDir = baseDataDir;
    }
    /**
     * Create a vault-specific hash for namespacing
     */
    getVaultHash(vaultPath) {
        return (0, crypto_1.createHash)('sha256').update(vaultPath).digest('hex').substring(0, 16);
    }
    /**
     * Get the data directory for a specific vault
     */
    getVaultDataDir(vaultPath) {
        const vaultHash = this.getVaultHash(vaultPath);
        return path_1.default.join(this.baseDataDir, vaultHash);
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
    async getDb(vaultPath) {
        const vaultHash = this.getVaultHash(vaultPath);
        if (!this.vaultDbs.has(vaultHash)) {
            const lancedb = this.getLanceDb();
            const vaultDataDir = this.getVaultDataDir(vaultPath);
            await promises_1.default.mkdir(vaultDataDir, { recursive: true });
            console.log(`Connecting to LanceDB for vault ${vaultHash} at:`, vaultDataDir);
            const db = await lancedb.connect(vaultDataDir);
            this.vaultDbs.set(vaultHash, db);
        }
        return this.vaultDbs.get(vaultHash);
    }
    async getTable(vaultPath) {
        const vaultHash = this.getVaultHash(vaultPath);
        if (!this.vaultTables.has(vaultHash)) {
            const db = await this.getDb(vaultPath);
            const tableNames = await db.tableNames();
            let table;
            if (tableNames.includes(TABLE_NAME)) {
                table = await db.openTable(TABLE_NAME);
                // Check if schema migration is needed
                const needsMigration = await this.checkSchemaMigration(table);
                if (needsMigration) {
                    console.log('Schema upgrade required - dropping old table');
                    await db.dropTable(TABLE_NAME);
                    table = await this.createTableWithSchema(db);
                }
            }
            else {
                table = await this.createTableWithSchema(db);
            }
            this.vaultTables.set(vaultHash, table);
        }
        return this.vaultTables.get(vaultHash);
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
    /**
     * Convert absolute file path to vault-relative path with forward slashes
     * (Obsidian API expects forward slashes regardless of OS)
     */
    toRelativePath(filePath, vaultPath) {
        const relative = path_1.default.relative(vaultPath, filePath);
        // Normalize to forward slashes for cross-platform compatibility
        return relative.split(path_1.default.sep).join('/');
    }
    /**
     * Convert vault-relative path to absolute path
     * (handles both forward and backslashes)
     */
    toAbsolutePath(relativePath, vaultPath) {
        // Normalize vault-relative path to OS-specific separators
        const normalized = relativePath.split('/').join(path_1.default.sep);
        return path_1.default.join(vaultPath, normalized);
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
     * Check if schema migration is needed by looking for new fields.
     * Returns true if migration is needed.
     */
    async checkSchemaMigration(table) {
        const sample = (await table.query().limit(1).toArray());
        if (sample.length === 0) {
            return false; // Empty table, schema is fine
        }
        // Check for new chunk_index field
        if (!('chunk_index' in sample[0])) {
            console.log('Index schema upgraded. Please re-index your vault.');
            return true;
        }
        return false;
    }
    /**
     * Create table with the current schema including chunk fields.
     */
    async createTableWithSchema(db) {
        const schemaRecord = {
            id: '__schema__',
            vector: new Array(EMBEDDING_DIM).fill(0),
            path: '',
            content_hash: '',
            last_updated: 0,
            chunk_index: 0,
            header_path: '',
            start_line: 0,
            end_line: 0,
        };
        const table = await db.createTable(TABLE_NAME, [schemaRecord]);
        await table.delete('id = "__schema__"');
        return table;
    }
    /**
     * Get all chunks for a file by path.
     */
    async getChunksForFile(table, relativePath) {
        const escapedPath = relativePath.replace(/"/g, '\\"');
        return (await table.query().where(`path = "${escapedPath}"`).toArray());
    }
    /**
     * Delete all chunks for a file by path.
     */
    async deleteChunksForFile(table, relativePath) {
        const escapedPath = relativePath.replace(/"/g, '\\"');
        await table.delete(`path = "${escapedPath}"`);
    }
    /**
     * Check if the service initialized successfully
     */
    isAvailable() {
        return this.initError === null;
    }
    /**
     * Embed a file's content and store in the vector database.
     * Uses markdown chunking to store separate vectors for each section.
     * Skips unchanged files based on content hash.
     */
    async embedFile(filePath, content, vaultPath) {
        const table = await this.getTable(vaultPath);
        const relativePath = this.toRelativePath(filePath, vaultPath);
        const fileHash = this.hashContent(content);
        // Check if file changed (compare against any existing chunk's content_hash)
        const existing = await this.getChunksForFile(table, relativePath);
        if (existing.length > 0 && existing[0].content_hash === fileHash) {
            return; // File unchanged, skip
        }
        // File changed or new - delete old chunks, create new ones
        if (existing.length > 0) {
            await this.deleteChunksForFile(table, relativePath);
        }
        const chunks = (0, MarkdownChunker_1.chunkMarkdown)(content);
        // Handle empty files - no chunks to create
        if (chunks.length === 0) {
            return;
        }
        const records = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const id = this.hashContent(`${relativePath}#${i}`);
            const vector = await this.embed(chunk.content);
            records.push({
                id,
                vector,
                path: relativePath,
                content_hash: fileHash, // Same for all chunks of this file
                last_updated: Date.now(),
                chunk_index: i,
                header_path: chunk.headerPath,
                start_line: chunk.startLine,
                end_line: chunk.endLine,
            });
        }
        await table.add(records);
    }
    /**
     * Search for notes semantically similar to the query.
     * Returns vault-relative paths with forward slashes (as Obsidian expects).
     * Returns empty array on error (graceful degradation).
     */
    async search(query, vaultPath, limit = 10) {
        try {
            const table = await this.getTable(vaultPath);
            const queryVector = await this.embed(query);
            const results = (await table.search(queryVector).limit(limit).toArray());
            // Return vault-relative paths (already stored with forward slashes)
            return results.map((row) => ({
                path: row.path,
                score: row._distance,
                headerPath: row.header_path,
                startLine: row.start_line,
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
     * @param onProgress Optional callback for progress updates (current, total)
     */
    async indexVault(vaultPath, excludeFolders = [], onProgress) {
        const table = await this.getTable(vaultPath);
        const files = await this.getMarkdownFiles(vaultPath, excludeFolders);
        // Build set of current file paths
        const currentFilePaths = new Set();
        for (const file of files) {
            const relativePath = this.toRelativePath(file, vaultPath);
            currentFilePaths.add(relativePath);
        }
        // Get all existing vectors and find stale file paths
        const allRecords = (await table.query().toArray());
        const stalePaths = new Set();
        for (const record of allRecords) {
            if (!currentFilePaths.has(record.path)) {
                stalePaths.add(record.path);
            }
        }
        // Remove stale vectors by file path
        for (const stalePath of stalePaths) {
            await this.deleteChunksForFile(table, stalePath);
        }
        // Index current files
        const totalFiles = files.length;
        let indexedCount = 0;
        for (const file of files) {
            try {
                const content = await promises_1.default.readFile(file, 'utf-8');
                await this.embedFile(file, content, vaultPath);
                indexedCount++;
                onProgress?.(indexedCount, totalFiles);
            }
            catch (error) {
                console.error(`Failed to index ${file}:`, error);
            }
        }
        return { indexed: indexedCount, removed: stalePaths.size };
    }
    /**
     * Remove all vectors for a file from the database.
     */
    async removeVector(filePath, vaultPath) {
        const table = await this.getTable(vaultPath);
        const relativePath = this.toRelativePath(filePath, vaultPath);
        await this.deleteChunksForFile(table, relativePath);
    }
    /**
     * Get all markdown files in a directory, respecting exclude folders.
     * Uses segment-aware matching to avoid false positives.
     */
    async getMarkdownFiles(dir, excludeFolders = [], vaultPath) {
        const files = [];
        const actualVaultPath = vaultPath || dir;
        // Normalize exclude folders to forward-slash separated segments
        const normalizedExcludes = excludeFolders.map(folder => {
            // Remove leading/trailing slashes and normalize to forward slashes
            return folder.replace(/^\/+|\/+$/g, '').split(path_1.default.sep).join('/');
        });
        try {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                // Skip hidden files and directories
                if (entry.name.startsWith('.'))
                    continue;
                const fullPath = path_1.default.join(dir, entry.name);
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
                if (shouldExclude)
                    continue;
                if (entry.isDirectory()) {
                    const nested = await this.getMarkdownFiles(fullPath, excludeFolders, actualVaultPath);
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
        this.vaultDbs.clear();
        this.vaultTables.clear();
        this.embeddingPipeline = null;
    }
}
exports.VectorService = VectorService;
