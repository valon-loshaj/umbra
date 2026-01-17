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

**Option 1: Use the included test vault**

The test vault is located at `.beads/temp-docs/vault/`.

1. Build the plugin: `npm run build`
2. Copy files to test vault: `cp main.js manifest.json styles.css .beads/temp-docs/vault/.obsidian/plugins/umbra/`
3. Open `.beads/temp-docs/vault/` as a vault in Obsidian
4. Enable the plugin in Settings → Community plugins

**Option 2: Link to your own vault**

1. Build the plugin: `npm run build`
2. Create a symlink from your vault's plugin directory to this project:
```bash
ln -s /path/to/umbra /path/to/your-vault/.obsidian/plugins/umbra
```
3. Enable the plugin in Obsidian settings

### Project Structure

```
umbra/
├── src/
│   └── main.ts              # Plugin entry point
├── archive/                 # Original Electron app (archived)
├── manifest.json            # Plugin metadata
├── styles.css               # Plugin styles
├── esbuild.config.mjs       # Build configuration
├── package.json
└── tsconfig.json
```

## Roadmap

### Phase 1: Plugin Setup ✓
- Basic plugin structure
- Build configuration
- Loads in Obsidian

### Phase 2: Vector Service
- Port VectorService from Electron app
- LanceDB + Transformers.js integration
- Vault API integration

### Phase 3: Search Functionality
- Search modal UI
- Keyboard navigation
- Command palette integration

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
