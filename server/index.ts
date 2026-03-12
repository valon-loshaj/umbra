import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { VectorService } from './services/VectorService';
import {
	SearchRequest,
	SearchResponse,
	EmbedRequest,
	EmbedResponse,
	RemoveVectorRequest,
	RemoveVectorResponse,
	HealthResponse,
	LexicalSearchRequest,
	LexicalSearchResponse,
	LibrarianProcessRequest,
	LibrarianProcessResponse,
	LibrarianApplyRequest,
	LibrarianApplyResponse,
} from './types';
import { LexicalService } from './services/LexicalService';
import { ArchiveService } from './services/ArchiveService';
import { AnthropicProvider } from './llm';
import { LibrarianAgent } from './librarian';
import fs from 'fs/promises';

const PORT = 37240;
const VERSION = '0.1.0';
const SERVER_START_TIME = Date.now();

// Read auth token from environment variable
const AUTH_TOKEN = process.env.UMBRA_AUTH_TOKEN;

if (!AUTH_TOKEN) {
	console.error('FATAL: UMBRA_AUTH_TOKEN environment variable not set');
	process.exit(1);
}

console.log('Auth token configured for session');

// Default data directory in user's home
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.umbra', 'lancedb');

const app = express();

// Enable CORS for Obsidian app only (tightened for security)
app.use(cors({
	origin: ['app://obsidian.md', 'capacitor://localhost'],
	credentials: true,
}));

app.use(express.json());

/**
 * Authentication middleware - validates Bearer token
 */
function authenticateToken(req: Request, res: Response, next: NextFunction) {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

	if (!token) {
		res.status(401).json({ error: 'Authentication required' });
		return;
	}

	if (token !== AUTH_TOKEN) {
		res.status(403).json({ error: 'Invalid authentication token' });
		return;
	}

	next();
}

// Initialize services
const vectorService = new VectorService(DEFAULT_DATA_DIR);
const lexicalService = new LexicalService();
const archiveService = new ArchiveService();

// Health check endpoint (no auth required - for monitoring)
app.get('/api/health', (_req: Request, res: Response<HealthResponse>) => {
	const uptime = Date.now() - SERVER_START_TIME;
	res.json({
		status: vectorService.isAvailable() ? 'ok' : 'error',
		version: VERSION,
		uptime,
	});
});

// Semantic search endpoint (auth required)
app.post('/api/search', authenticateToken, async (req: Request<{}, {}, SearchRequest>, res: Response<SearchResponse>) => {
	try {
		const { query, limit = 10, vaultPath } = req.body;

		if (!query || !vaultPath) {
			res.status(400).json({ results: [] });
			return;
		}

		const results = await vectorService.search(query, vaultPath, limit);
		res.json({ results });
	} catch (error) {
		console.error('Search error:', error);
		res.status(500).json({ results: [] });
	}
});

// Lexical search endpoint (auth required)
app.post('/api/search/lexical', authenticateToken, async (req: Request<{}, {}, LexicalSearchRequest>, res: Response<LexicalSearchResponse>) => {
	try {
		const { query, vaultPath, limit = 20, caseSensitive = false } = req.body;

		if (!query || !vaultPath) {
			res.status(400).json({ results: [] });
			return;
		}

		const results = await lexicalService.search(query, vaultPath, limit, caseSensitive);
		res.json({ results });
	} catch (error) {
		console.error('Lexical search error:', error);
		res.status(500).json({ results: [] });
	}
});

// Index vault with SSE progress streaming (auth via query param since EventSource doesn't support headers)
app.get('/api/index/stream', async (req: Request, res: Response) => {
	// Authenticate via query param (EventSource limitation)
	const token = req.query.token as string;
	if (!token || token !== AUTH_TOKEN) {
		res.status(401).json({ error: 'Authentication required' });
		return;
	}

	const vaultPath = req.query.vaultPath as string;
	const excludeFolders = (req.query.excludeFolders as string || '').split(',').filter(Boolean);

	if (!vaultPath) {
		res.status(400).json({ error: 'vaultPath is required' });
		return;
	}

	// Set SSE headers
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');

	const onProgress = (current: number, total: number) => {
		res.write(`data: ${JSON.stringify({ type: 'progress', current, total })}\n\n`);
	};

	try {
		const stats = await vectorService.indexVault(vaultPath, excludeFolders, onProgress);
		res.write(`data: ${JSON.stringify({ type: 'complete', stats })}\n\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
	}
	res.end();
});

// Embed file endpoint (auth required)
app.post('/api/embed', authenticateToken, async (req: Request<{}, {}, EmbedRequest>, res: Response<EmbedResponse>) => {
	try {
		const { filePath, content, vaultPath } = req.body;

		if (!filePath || !content || !vaultPath) {
			res.status(400).json({ success: false });
			return;
		}

		await vectorService.embedFile(filePath, content, vaultPath);
		res.json({ success: true });
	} catch (error) {
		console.error('Embed error:', error);
		res.status(500).json({ success: false });
	}
});

// Remove vector endpoint (auth required)
app.delete('/api/vector', authenticateToken, async (req: Request<{}, {}, RemoveVectorRequest>, res: Response<RemoveVectorResponse>) => {
	try {
		const { filePath, vaultPath } = req.body;

		if (!filePath || !vaultPath) {
			res.status(400).json({ success: false });
			return;
		}

		await vectorService.removeVector(filePath, vaultPath);
		res.json({ success: true });
	} catch (error) {
		console.error('Remove vector error:', error);
		res.status(500).json({ success: false });
	}
});

// Librarian: Process daily notes and generate change plan (auth required)
app.post('/api/librarian/process', authenticateToken, async (req: Request<{}, {}, LibrarianProcessRequest>, res: Response<LibrarianProcessResponse>) => {
	try {
		const { vaultPath, dailyNotesFolder, maxNotes, apiKey } = req.body;

		if (!vaultPath || !dailyNotesFolder || !apiKey) {
			res.status(400).json({ success: false, error: 'Missing required fields' });
			return;
		}

		const llm = new AnthropicProvider(apiKey);
		const agent = new LibrarianAgent(llm, vectorService, lexicalService);

		const result = await agent.process(vaultPath, {
			dailyNotesFolder,
			maxNotes,
		});

		if (result.plan) {
			res.json({ success: true, plan: result.plan });
		} else {
			res.json({ success: false, error: result.error });
		}
	} catch (error) {
		console.error('Librarian process error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ success: false, error: message });
	}
});

// Librarian: Apply approved changes (auth required)
app.post('/api/librarian/apply', authenticateToken, async (req: Request<{}, {}, LibrarianApplyRequest>, res: Response<LibrarianApplyResponse>) => {
	try {
		const { vaultPath, actions, archiveFolder, notesToArchive } = req.body;

		if (!vaultPath || !actions || !archiveFolder) {
			res.status(400).json({ success: false, applied: [], archived: [], errors: [] });
			return;
		}

		const applied: string[] = [];
		const errors: { action: string; error: string }[] = [];

		// Apply each action
		for (const action of actions) {
			try {
				const actionPath = action.path || action.toPath || action.fromPath || 'unknown';

				switch (action.type) {
					case 'create': {
						if (!action.path || !action.content) break;
						const absPath = path.join(vaultPath, action.path);
						await fs.mkdir(path.dirname(absPath), { recursive: true });
						await fs.writeFile(absPath, action.content, 'utf-8');
						applied.push(`create: ${action.path}`);
						break;
					}

					case 'update': {
						if (!action.path || !action.content) break;
						const absPath = path.join(vaultPath, action.path);
						let existing = '';
						try {
							existing = await fs.readFile(absPath, 'utf-8');
						} catch {
							// File doesn't exist, create it
						}

						let newContent: string;
						if (action.position === 'prepend') {
							newContent = action.content + '\n\n' + existing;
						} else if (action.position === 'section' && action.section) {
							// Find section and insert after it
							const sectionRegex = new RegExp(`(${action.section}.*?\n)`, 'i');
							if (sectionRegex.test(existing)) {
								newContent = existing.replace(sectionRegex, `$1\n${action.content}\n`);
							} else {
								newContent = existing + '\n\n' + action.content;
							}
						} else {
							// Default: append
							newContent = existing + '\n\n' + action.content;
						}

						await fs.writeFile(absPath, newContent.trim(), 'utf-8');
						applied.push(`update: ${action.path}`);
						break;
					}

					case 'move': {
						if (!action.fromPath || !action.toPath) break;
						const fromAbs = path.join(vaultPath, action.fromPath);
						const toAbs = path.join(vaultPath, action.toPath);
						await fs.mkdir(path.dirname(toAbs), { recursive: true });
						await fs.rename(fromAbs, toAbs);
						applied.push(`move: ${action.fromPath} -> ${action.toPath}`);
						break;
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				const actionDesc = action.type + ': ' + (action.path || action.fromPath || 'unknown');
				errors.push({ action: actionDesc, error: message });
			}
		}

		// Archive processed notes
		const archiveResult = await archiveService.archiveNotes(
			notesToArchive || [],
			vaultPath,
			archiveFolder
		);

		// Add archive errors to the errors list
		for (const fail of archiveResult.failed) {
			errors.push({ action: `archive: ${fail.path}`, error: fail.error });
		}

		res.json({
			success: errors.length === 0,
			applied,
			archived: archiveResult.archived,
			errors,
		});
	} catch (error) {
		console.error('Librarian apply error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({
			success: false,
			applied: [],
			archived: [],
			errors: [{ action: 'apply', error: message }],
		});
	}
});

// Start server
const server = app.listen(PORT, 'localhost', () => {
	console.log(`Umbra server listening on http://localhost:${PORT}`);
	console.log(`Data directory: ${DEFAULT_DATA_DIR}`);
	console.log(`Server ready to accept requests`);
	console.log(`Parent process: ${process.ppid}`);
});

// Monitor parent process - exit if parent (Obsidian) dies
const parentPid = process.ppid;
const parentCheckInterval = setInterval(() => {
	try {
		// Check if parent process still exists
		// process.kill with signal 0 doesn't kill, just checks if process exists
		process.kill(parentPid, 0);
	} catch (error) {
		console.log('Parent process no longer exists, shutting down...');
		clearInterval(parentCheckInterval);
		shutdown();
	}
}, 2000); // Check every 2 seconds

// Graceful shutdown function
async function shutdown() {
	console.log('Shutting down Umbra server...');
	clearInterval(parentCheckInterval);
	server.close();
	await vectorService.close();
	process.exit(0);
}

// Handle termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGHUP', shutdown); // Parent process died

// Handle stdin close (parent disconnected)
process.stdin.on('end', () => {
	console.log('Parent process disconnected (stdin closed), shutting down...');
	shutdown();
});
process.stdin.resume(); // Enable stdin monitoring
