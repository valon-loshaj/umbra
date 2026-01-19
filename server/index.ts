import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { VectorService } from './services/VectorService';
import {
	SearchRequest,
	SearchResponse,
	IndexRequest,
	IndexResponse,
	EmbedRequest,
	EmbedResponse,
	RemoveVectorRequest,
	RemoveVectorResponse,
	HealthResponse,
} from './types';

const PORT = 37240;
const VERSION = '0.1.0';
const SERVER_START_TIME = Date.now();

// Default data directory in user's home
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.umbra', 'lancedb');

const app = express();

// Enable CORS for Obsidian app
app.use(cors({
	origin: ['app://obsidian.md', 'capacitor://localhost', 'http://localhost'],
	credentials: true,
}));

app.use(express.json());

// Initialize VectorService
const vectorService = new VectorService(DEFAULT_DATA_DIR);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response<HealthResponse>) => {
	const uptime = Date.now() - SERVER_START_TIME;
	res.json({
		status: vectorService.isAvailable() ? 'ok' : 'error',
		version: VERSION,
		uptime,
	});
});

// Search endpoint
app.post('/api/search', async (req: Request<{}, {}, SearchRequest>, res: Response<SearchResponse>) => {
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

// Index vault endpoint
app.post('/api/index', async (req: Request<{}, {}, IndexRequest>, res: Response<IndexResponse>) => {
	try {
		const { vaultPath, excludeFolders = [] } = req.body;

		if (!vaultPath) {
			res.status(400).json({ stats: { indexed: 0, removed: 0 } });
			return;
		}

		const stats = await vectorService.indexVault(vaultPath, excludeFolders);
		res.json({ stats });
	} catch (error) {
		console.error('Index error:', error);
		res.status(500).json({ stats: { indexed: 0, removed: 0 } });
	}
});

// Embed file endpoint
app.post('/api/embed', async (req: Request<{}, {}, EmbedRequest>, res: Response<EmbedResponse>) => {
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

// Remove vector endpoint
app.delete('/api/vector', async (req: Request<{}, {}, RemoveVectorRequest>, res: Response<RemoveVectorResponse>) => {
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

// Start server
app.listen(PORT, 'localhost', () => {
	console.log(`Umbra server listening on http://localhost:${PORT}`);
	console.log(`Data directory: ${DEFAULT_DATA_DIR}`);
	console.log(`Server ready to accept requests`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log('SIGTERM received, closing server...');
	await vectorService.close();
	process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('SIGINT received, closing server...');
	await vectorService.close();
	process.exit(0);
});
