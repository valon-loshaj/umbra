"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const VectorService_1 = require("./services/VectorService");
const PORT = 37240;
const VERSION = '0.1.0';
const SERVER_START_TIME = Date.now();
// Default data directory in user's home
const DEFAULT_DATA_DIR = path_1.default.join(os_1.default.homedir(), '.umbra', 'lancedb');
const app = (0, express_1.default)();
// Enable CORS for Obsidian app
app.use((0, cors_1.default)({
    origin: ['app://obsidian.md', 'capacitor://localhost', 'http://localhost'],
    credentials: true,
}));
app.use(express_1.default.json());
// Initialize VectorService
const vectorService = new VectorService_1.VectorService(DEFAULT_DATA_DIR);
// Health check endpoint
app.get('/api/health', (_req, res) => {
    const uptime = Date.now() - SERVER_START_TIME;
    res.json({
        status: vectorService.isAvailable() ? 'ok' : 'error',
        version: VERSION,
        uptime,
    });
});
// Search endpoint
app.post('/api/search', async (req, res) => {
    try {
        const { query, limit = 10, vaultPath } = req.body;
        if (!query || !vaultPath) {
            res.status(400).json({ results: [] });
            return;
        }
        const results = await vectorService.search(query, vaultPath, limit);
        res.json({ results });
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ results: [] });
    }
});
// Index vault endpoint
app.post('/api/index', async (req, res) => {
    try {
        const { vaultPath, excludeFolders = [] } = req.body;
        if (!vaultPath) {
            res.status(400).json({ stats: { indexed: 0, removed: 0 } });
            return;
        }
        const stats = await vectorService.indexVault(vaultPath, excludeFolders);
        res.json({ stats });
    }
    catch (error) {
        console.error('Index error:', error);
        res.status(500).json({ stats: { indexed: 0, removed: 0 } });
    }
});
// Embed file endpoint
app.post('/api/embed', async (req, res) => {
    try {
        const { filePath, content, vaultPath } = req.body;
        if (!filePath || !content || !vaultPath) {
            res.status(400).json({ success: false });
            return;
        }
        await vectorService.embedFile(filePath, content, vaultPath);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Embed error:', error);
        res.status(500).json({ success: false });
    }
});
// Remove vector endpoint
app.delete('/api/vector', async (req, res) => {
    try {
        const { filePath, vaultPath } = req.body;
        if (!filePath || !vaultPath) {
            res.status(400).json({ success: false });
            return;
        }
        await vectorService.removeVector(filePath, vaultPath);
        res.json({ success: true });
    }
    catch (error) {
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
