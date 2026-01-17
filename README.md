# Umbra - Semantic Search for Obsidian

Semantic search for your Obsidian notes using local vector embeddings with LanceDB and Transformers.js.

## Features

- **Semantic Search**: Find notes by meaning, not just keywords
- **Local Processing**: All embeddings generated locally using Transformers.js
- **Auto-Indexing**: Automatically indexes your vault on load and when files change
- **Fast Search**: Powered by LanceDB vector database
- **Privacy First**: No data leaves your machine

## Development

### Prerequisites

- Node.js v20 or higher
- Obsidian v0.15.0 or higher

### Setup

1. Install dependencies:
```bash
npm install
```

2. Build the plugin:
```bash
npm run build
```

3. For development with hot reload:
```bash
npm run dev
```

### Testing in Obsidian

To test the plugin during development:

1. Build the plugin:
```bash
npm run build
```

2. Copy the plugin files to your vault's plugin directory:
```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/umbra
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/umbra/
# Also copy node_modules for native dependencies:
cp -r node_modules/@lancedb /path/to/your-vault/.obsidian/plugins/umbra/node_modules/
cp -r node_modules/@xenova /path/to/your-vault/.obsidian/plugins/umbra/node_modules/
```

3. Enable the plugin in Obsidian: Settings → Community plugins → Enable "Umbra"

4. Test the plugin:
   - Run "Umbra: Test Vector Service" to index your vault
   - Press Cmd/Ctrl+K (or use command palette) to open search
   - Type to search, use arrow keys to navigate, Enter to open

**Alternative: Use a symlink for faster development**

Create a symlink from your vault's plugin directory to this project:
```bash
ln -s /path/to/umbra /path/to/your-vault/.obsidian/plugins/umbra
```

Then just run `npm run dev` and Obsidian will reload on changes.

### Project Structure

```
umbra/
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── types.ts                   # Type definitions
│   ├── services/
│   │   └── VectorService.ts       # Vector search implementation
│   └── ui/
│       └── SearchModal.ts         # Search modal component
├── manifest.json                  # Plugin metadata
├── styles.css                     # Plugin styles
├── esbuild.config.mjs             # Build configuration
├── package.json
└── tsconfig.json
```

## Roadmap

### Phase 1: Plugin Setup ✓
- Basic plugin structure
- Build configuration
- Loads in Obsidian

### Phase 2: Vector Service ✓
- Port VectorService from Electron app
- LanceDB + Transformers.js integration
- Vault API integration
- Test command to verify indexing works

### Phase 3: Search Functionality ✓
- Search modal UI with debounced search
- Keyboard navigation (arrows, Enter, Esc)
- Command: "Umbra: Search notes" with Cmd/Ctrl+K hotkey
- Open in current pane (default) or new pane (Cmd/Ctrl held)

### Phase 4: Auto-Indexing
- Index on vault open
- Watch for file changes
- Status bar indicator

### Phase 5: Settings & Polish
- Settings UI
- Manual re-index command
- Custom hotkeys
- Documentation

### Phase 6: AI Features (Future)
- Claude API integration
- AI-powered organization
- PARA method suggestions

## License

MIT
