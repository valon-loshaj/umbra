"use strict";
/**
 * Librarian agent tools.
 * These tools allow the agent to explore the vault and gather context.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIBRARIAN_TOOLS = void 0;
exports.executeTool = executeTool;
exports.createToolResult = createToolResult;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
/** Tool definitions for the LLM */
exports.LIBRARIAN_TOOLS = [
    {
        name: 'semantic_search',
        description: 'Search for notes semantically related to a query. Returns notes with similar meaning, not just matching text. Use this to find conceptually related content.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language query describing what to find',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 5)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'lexical_search',
        description: 'Search for exact text matches in notes. Use this to find specific terms, names, or phrases.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Exact text to search for',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of files to return (default: 10)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'read_file',
        description: 'Read the content of a note. Use this to get the full text of a specific file.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Vault-relative path to the note (e.g., "projects/my-project.md")',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'list_structure',
        description: 'List the folder structure of the vault or a specific folder. Shows files and subfolders.',
        input_schema: {
            type: 'object',
            properties: {
                folder: {
                    type: 'string',
                    description: 'Vault-relative folder path (empty or "/" for root)',
                },
                depth: {
                    type: 'number',
                    description: 'How many levels deep to list (default: 1, max: 3)',
                },
            },
        },
    },
    {
        name: 'get_note_metadata',
        description: 'Get metadata about a note including frontmatter, file stats, and links. Does not return full content.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Vault-relative path to the note',
                },
            },
            required: ['path'],
        },
    },
];
/** Tool executor implementations */
const toolExecutors = {
    async semantic_search(input, context) {
        const query = input.query;
        const limit = input.limit || 5;
        const results = await context.vectorService.search(query, context.vaultPath, limit);
        if (results.length === 0) {
            return 'No results found.';
        }
        return results
            .map((r, i) => `${i + 1}. ${r.path} (score: ${r.score.toFixed(3)})${r.headerPath ? ` - ${r.headerPath}` : ''}`)
            .join('\n');
    },
    async lexical_search(input, context) {
        const query = input.query;
        const limit = input.limit || 10;
        const results = await context.lexicalService.search(query, context.vaultPath, limit);
        if (results.length === 0) {
            return 'No matches found.';
        }
        const output = [];
        for (const result of results) {
            output.push(`${result.path}:`);
            for (const match of result.matches.slice(0, 3)) {
                output.push(`  Line ${match.line}: ${match.content}`);
            }
            if (result.matches.length > 3) {
                output.push(`  ... and ${result.matches.length - 3} more matches`);
            }
        }
        return output.join('\n');
    },
    async read_file(input, context) {
        const relativePath = input.path;
        const absolutePath = toAbsolutePath(relativePath, context.vaultPath);
        try {
            const content = await promises_1.default.readFile(absolutePath, 'utf-8');
            // Truncate very long files
            if (content.length > 10000) {
                return content.slice(0, 10000) + '\n\n[Content truncated - file too long]';
            }
            return content;
        }
        catch (error) {
            return `Error: Could not read file "${relativePath}"`;
        }
    },
    async list_structure(input, context) {
        const folder = input.folder || '';
        const depth = Math.min(input.depth || 1, 3);
        const absoluteFolder = folder
            ? toAbsolutePath(folder, context.vaultPath)
            : context.vaultPath;
        try {
            const structure = await listDirectory(absoluteFolder, context.vaultPath, depth);
            return structure || 'Empty folder.';
        }
        catch (error) {
            return `Error: Could not list folder "${folder}"`;
        }
    },
    async get_note_metadata(input, context) {
        const relativePath = input.path;
        const absolutePath = toAbsolutePath(relativePath, context.vaultPath);
        try {
            const content = await promises_1.default.readFile(absolutePath, 'utf-8');
            const stats = await promises_1.default.stat(absolutePath);
            const metadata = {
                path: relativePath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                created: stats.birthtime.toISOString(),
            };
            // Parse frontmatter
            const frontmatter = parseFrontmatter(content);
            if (frontmatter) {
                metadata.frontmatter = frontmatter;
            }
            // Extract wiki links
            const links = extractWikiLinks(content);
            if (links.length > 0) {
                metadata.links = links;
            }
            return JSON.stringify(metadata, null, 2);
        }
        catch (error) {
            return `Error: Could not get metadata for "${relativePath}"`;
        }
    },
};
/**
 * Execute a tool by name with given input.
 */
async function executeTool(name, input, context) {
    const executor = toolExecutors[name];
    if (!executor) {
        return `Error: Unknown tool "${name}"`;
    }
    return executor(input, context);
}
/**
 * Create a tool result content block for the LLM.
 */
function createToolResult(toolUseId, result, isError = false) {
    return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result,
        is_error: isError,
    };
}
// Helper functions
function toAbsolutePath(relativePath, vaultPath) {
    const normalized = relativePath.split('/').join(path_1.default.sep);
    return path_1.default.join(vaultPath, normalized);
}
async function listDirectory(dir, vaultPath, depth, indent = '') {
    if (depth <= 0)
        return '';
    const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
    const lines = [];
    // Sort: folders first, then files
    const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory())
            return -1;
        if (!a.isDirectory() && b.isDirectory())
            return 1;
        return a.name.localeCompare(b.name);
    });
    for (const entry of sorted) {
        if (entry.name.startsWith('.'))
            continue;
        const icon = entry.isDirectory() ? '/' : '';
        lines.push(`${indent}${entry.name}${icon}`);
        if (entry.isDirectory() && depth > 1) {
            const subPath = path_1.default.join(dir, entry.name);
            const subContent = await listDirectory(subPath, vaultPath, depth - 1, indent + '  ');
            if (subContent) {
                lines.push(subContent);
            }
        }
    }
    return lines.join('\n');
}
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
        return null;
    const yaml = match[1];
    const result = {};
    // Simple YAML parsing for common patterns
    for (const line of yaml.split('\n')) {
        const keyMatch = line.match(/^(\w+):\s*(.*)$/);
        if (keyMatch) {
            const [, key, value] = keyMatch;
            // Handle arrays
            if (value.startsWith('[') && value.endsWith(']')) {
                result[key] = value
                    .slice(1, -1)
                    .split(',')
                    .map((s) => s.trim().replace(/^["']|["']$/g, ''));
            }
            else {
                result[key] = value.replace(/^["']|["']$/g, '');
            }
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}
function extractWikiLinks(content) {
    const links = [];
    const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        links.push(match[1]);
    }
    return [...new Set(links)]; // Dedupe
}
