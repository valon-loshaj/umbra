import './styles/index.css'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { createRoot } from 'react-dom/client'

import { App } from './App'

// Configure Monaco workers
self.MonacoEnvironment = {
	getWorker() {
		return new editorWorker()
	},
}

// Configure Monaco to use locally installed package instead of CDN
loader.config({ monaco })

const root = document.getElementById('root')
if (!root) {
	throw new Error('Root element not found')
}

createRoot(root).render(<App />)
