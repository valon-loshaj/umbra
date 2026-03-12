"use strict";
/**
 * Lexical (text-based) search service.
 * Complements semantic search with exact term/phrase matching.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LexicalService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const MAX_CONTEXT_CHARS = 150;
class LexicalService {
    /**
     * Search for exact text matches in markdown files.
     * @param query Search term or phrase
     * @param vaultPath Absolute path to vault root
     * @param limit Maximum number of files to return
     * @param caseSensitive Whether to match case
     */
    async search(query, vaultPath, limit = 20, caseSensitive = false) {
        if (!query.trim()) {
            return [];
        }
        const files = await this.getMarkdownFiles(vaultPath);
        const results = [];
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        for (const file of files) {
            if (results.length >= limit)
                break;
            try {
                const content = await promises_1.default.readFile(file, 'utf-8');
                const searchContent = caseSensitive ? content : content.toLowerCase();
                if (!searchContent.includes(searchQuery)) {
                    continue;
                }
                const matches = this.findMatches(content, query, caseSensitive);
                if (matches.length > 0) {
                    const relativePath = this.toRelativePath(file, vaultPath);
                    results.push({ path: relativePath, matches });
                }
            }
            catch (error) {
                // Skip files that can't be read
                console.error(`Failed to read ${file}:`, error);
            }
        }
        return results;
    }
    /**
     * Find all matches of query in content with line numbers.
     */
    findMatches(content, query, caseSensitive) {
        const lines = content.split('\n');
        const matches = [];
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const searchLine = caseSensitive ? line : line.toLowerCase();
            let searchStart = 0;
            while (true) {
                const index = searchLine.indexOf(searchQuery, searchStart);
                if (index === -1)
                    break;
                // Extract context around the match
                const contextStart = Math.max(0, index - 30);
                const contextEnd = Math.min(line.length, index + query.length + MAX_CONTEXT_CHARS);
                let context = line.slice(contextStart, contextEnd);
                // Add ellipsis if truncated
                if (contextStart > 0)
                    context = '...' + context;
                if (contextEnd < line.length)
                    context = context + '...';
                matches.push({
                    line: i + 1, // 1-based line numbers
                    content: context.trim(),
                    column: index + 1, // 1-based column
                });
                searchStart = index + 1;
            }
        }
        return matches;
    }
    /**
     * Convert absolute path to vault-relative path with forward slashes.
     */
    toRelativePath(filePath, vaultPath) {
        const relative = path_1.default.relative(vaultPath, filePath);
        return relative.split(path_1.default.sep).join('/');
    }
    /**
     * Get all markdown files in vault, excluding hidden folders.
     */
    async getMarkdownFiles(dir, vaultPath) {
        const files = [];
        const actualVaultPath = vaultPath || dir;
        try {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.'))
                    continue;
                const fullPath = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const nested = await this.getMarkdownFiles(fullPath, actualVaultPath);
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
}
exports.LexicalService = LexicalService;
