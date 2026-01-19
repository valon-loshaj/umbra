# Umbra - Semantic Search for Obsidian

Semantic search for your Obsidian notes using local vector embeddings. Find notes by meaning, not just keywords.

## Features

- **Semantic Search**: Find notes by meaning and context, not just exact keyword matches
- **Local & Private**: All processing happens on your machine - no data leaves your device
- **Fast**: Powered by LanceDB vector database with efficient similarity search
- **Auto-Indexing**: Automatically indexes your vault and keeps it up-to-date
- **Multi-Vault**: Each vault maintains its own isolated index
- **Keyboard First**: Search with Cmd+K (Mac) / Ctrl+K (Windows/Linux)

## Architecture

Umbra uses a client-server architecture:

- **Plugin (Client)**: Lightweight Obsidian plugin that provides the search UI
- **Server**: Local Node.js server that handles vector embeddings and search

**Why client-server?**

The vector embedding model and database have large dependencies (~367MB) that would make the plugin slow to load in Obsidian. By running these in a separate Node.js process, the plugin remains lightweight while still providing fast semantic search.

The server:
- Runs locally on `localhost:37240`
- Starts automatically when Obsidian loads
- Stops automatically when Obsidian closes
- Uses per-session authentication tokens for security

## Installation

### Requirements

- **macOS** (Intel or Apple Silicon)
- **Node.js v20 or higher** - [Download from nodejs.org](https://nodejs.org/)
- **Obsidian v0.15.0 or higher**

### Steps

1. **Download the latest release**

   Go to the [Releases page](https://github.com/valon-loshaj/umbra/releases) and download `umbra-X.X.X-macos.tar.gz`

2. **Extract the archive**

   ```bash
   tar -xzf umbra-X.X.X-macos.tar.gz
   ```

   This creates an `umbra` directory containing the plugin files.

3. **Copy to your vault's plugins directory**

   ```bash
   cp -r umbra /path/to/your-vault/.obsidian/plugins/
   ```

   Replace `/path/to/your-vault` with the actual path to your Obsidian vault.

   Example:
   ```bash
   cp -r umbra ~/Documents/MyVault/.obsidian/plugins/
   ```

4. **Enable the plugin in Obsidian**

   - Open Obsidian
   - Go to Settings → Community plugins
   - Find "Umbra" in the list and toggle it on
   - You should see "Umbra: ✓ Connected" in the status bar

5. **Index your vault**

   - Open the command palette (Cmd/Ctrl+P)
   - Run "Umbra: Index vault"
   - Wait for the indexing to complete (you'll see a notification)

6. **Start searching!**

   - Press Cmd+K (Mac) or Ctrl+K (Windows/Linux)
   - Type your search query
   - Use arrow keys to navigate results
   - Press Enter to open (or Cmd/Ctrl+Enter to open in new tab)

## Usage

### Search

Press **Cmd+K** (Mac) or **Ctrl+K** (Windows/Linux) to open the search modal.

- **Type to search**: Results update as you type (debounced)
- **Arrow keys**: Navigate through results
- **Enter**: Open selected note in current pane
- **Cmd/Ctrl+Enter**: Open selected note in new tab
- **Escape**: Close search modal

### Commands

Open the command palette (Cmd/Ctrl+P) and search for "Umbra":

- **Search notes**: Open the search modal (hotkey: Cmd/Ctrl+K)
- **Index vault**: Manually re-index all notes in your vault
- **Start server**: Manually start the Umbra server (usually automatic)
- **Stop server**: Stop the Umbra server
- **Restart server**: Restart the Umbra server

## Troubleshooting

### "Node.js not found" error

**Problem**: Plugin shows "Node.js not found" notification.

**Solution**:
1. Install Node.js from [nodejs.org](https://nodejs.org/) (v20 or higher)
2. Restart Obsidian completely (quit and reopen, not just reload)

### "Server dependencies not found" error

**Problem**: Plugin shows error about missing server dependencies.

**Solution**:
1. Download a fresh copy of the release from GitHub
2. Extract and reinstall following the installation steps above
3. Make sure you copied the entire `umbra` directory, not just some files

### Server won't start

**Problem**: Status bar shows "Umbra: ✗ Disconnected".

**Solution**:
1. Check if port 37240 is already in use:
   ```bash
   lsof -i :37240
   ```
2. If another process is using it, stop that process or restart your computer
3. Try manually restarting the server:
   - Open command palette (Cmd/Ctrl+P)
   - Run "Umbra: Restart server"

### Search returns no results

**Problem**: Search modal shows "No results found" for queries that should match.

**Solution**:
1. Make sure your vault is indexed:
   - Open command palette (Cmd/Ctrl+P)
   - Run "Umbra: Index vault"
   - Wait for completion notification
2. Check that status bar shows "Umbra: ✓ Connected"

### Search is slow or freezes

**Problem**: Search takes a long time or seems to freeze.

**Solution**:
1. First search after plugin loads is slower (model needs to load)
2. Check Activity Monitor for high CPU usage
3. Try restarting the server:
   - Open command palette (Cmd/Ctrl+P)
   - Run "Umbra: Restart server"

### Still having issues?

1. Check the Developer Console (View → Toggle Developer Tools) for error messages
2. Look for error messages from "[Umbra Server]" or "[Umbra Server Error]"
3. Open an issue on [GitHub](https://github.com/valon-loshaj/umbra/issues) with:
   - The error messages from console
   - Your Obsidian version
   - Your macOS version
   - Your Node.js version (run `node --version` in Terminal)

## Development

### Prerequisites

- Node.js v20 or higher
- npm or yarn
- Obsidian v0.15.0 or higher

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/valon-loshaj/umbra.git
   cd umbra
   ```

2. Install dependencies for both plugin and server:
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Build the server:
   ```bash
   cd server && npm run build && cd ..
   ```

### Development Workflow

1. Create a symlink to your test vault:
   ```bash
   ln -s "$(pwd)" "/path/to/test-vault/.obsidian/plugins/umbra"
   ```

2. Build and deploy:
   ```bash
   npm run build
   cd server && npm run build && cd ..
   ```

3. Reload Obsidian to test changes

### Project Structure

```
umbra/
├── src/                           # Plugin source code
│   ├── main.ts                    # Plugin entry point
│   ├── types.ts                   # Shared type definitions
│   ├── services/
│   │   ├── ServerManager.ts       # Server lifecycle management
│   │   └── ApiClient.ts           # HTTP client for server API
│   └── ui/
│       └── SearchModal.ts         # Search modal UI
├── server/                        # Server source code
│   ├── index.ts                   # Server entry point
│   ├── types.ts                   # Server type definitions
│   └── services/
│       └── VectorService.ts       # Vector embeddings & search
├── manifest.json                  # Plugin metadata
├── styles.css                     # Plugin styles
├── build-release.sh               # Release build script
└── deploy-test.sh                 # Local deployment script
```

### Building a Release

To create a release build:

```bash
./build-release.sh
```

This creates `release/umbra-X.X.X-macos.tar.gz` ready for distribution.

The script:
1. Builds the plugin and server
2. Installs production-only dependencies
3. Creates a compressed archive

### Testing

To deploy to a test vault quickly:

```bash
./deploy-test.sh
```

This builds and copies everything to your configured test vault.

## Technical Details

### Embedding Model

- **Model**: `Xenova/all-MiniLM-L6-v2` via Transformers.js
- **Dimensions**: 384
- **Languages**: English (optimized), works with other languages
- **Speed**: ~10-50ms per note on modern hardware

### Vector Database

- **Database**: LanceDB (Apache Arrow-based)
- **Storage**: `~/.umbra/lancedb/<vault-hash>/`
- **Index**: Automatically created and managed
- **Isolation**: Each vault has separate database

### API Endpoints

The local server exposes these endpoints on `localhost:37240`:

- `GET /api/health` - Health check (no auth required)
- `POST /api/search` - Search for similar notes
- `POST /api/index` - Index entire vault
- `POST /api/embed` - Embed single file
- `DELETE /api/vector` - Remove file from index

All endpoints except `/api/health` require Bearer token authentication.

## Roadmap

### Phase 3.5: Critical Fixes ✓
- Per-session authentication
- Per-vault index storage
- Vault-relative path standardization
- Folder exclusion fixes
- Type safety improvements

### Phase 4: Distribution (Current)
- Release packaging for macOS
- Installation documentation
- Dependency verification
- User troubleshooting guide

### Phase 5: Settings & Polish
- Settings UI for excluded folders
- Custom hotkeys configuration
- Progress indicators for indexing
- Search result previews

### Phase 6: Platform Expansion
- Windows support
- Linux support
- Pre-built binaries for all platforms

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see LICENSE file for details.

## Credits

Built with:
- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- [LanceDB](https://github.com/lancedb/lancedb)
- [Transformers.js](https://github.com/xenova/transformers.js)
- [Express](https://expressjs.com/)
