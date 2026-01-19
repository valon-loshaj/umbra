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
// Read auth token from environment variable
const AUTH_TOKEN = process.env.UMBRA_AUTH_TOKEN;
if (!AUTH_TOKEN) {
    console.error('FATAL: UMBRA_AUTH_TOKEN environment variable not set');
    process.exit(1);
}
console.log('Auth token configured for session');
// Default data directory in user's home
const DEFAULT_DATA_DIR = path_1.default.join(os_1.default.homedir(), '.umbra', 'lancedb');
const app = (0, express_1.default)();
// Enable CORS for Obsidian app only (tightened for security)
app.use((0, cors_1.default)({
    origin: ['app://obsidian.md', 'capacitor://localhost'],
    credentials: true,
}));
app.use(express_1.default.json());
/**
 * Authentication middleware - validates Bearer token
 */
function authenticateToken(req, res, next) {
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
// Initialize VectorService
const vectorService = new VectorService_1.VectorService(DEFAULT_DATA_DIR);
// Health check endpoint (no auth required - for monitoring)
app.get('/api/health', (_req, res) => {
    const uptime = Date.now() - SERVER_START_TIME;
    res.json({
        status: vectorService.isAvailable() ? 'ok' : 'error',
        version: VERSION,
        uptime,
    });
});
// Search endpoint (auth required)
app.post('/api/search', authenticateToken, async (req, res) => {
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
// Index vault endpoint (auth required)
app.post('/api/index', authenticateToken, async (req, res) => {
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
// Embed file endpoint (auth required)
app.post('/api/embed', authenticateToken, async (req, res) => {
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
// Remove vector endpoint (auth required)
app.delete('/api/vector', authenticateToken, async (req, res) => {
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
    }
    catch (error) {
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
