import { useState, useEffect, useRef } from 'react'

import { useConfig } from '../contexts/ConfigContext'
import { useFileSystem } from '../contexts/FileSystemContext'

import { MarkdownEditor } from './Editor/MarkdownEditor'
import { SearchModal } from './Search/SearchModal'
import { SettingsModal } from './Settings/SettingsModal'
import { Sidebar } from './Sidebar'

export function MainLayout() {
	const { config, configExists } = useConfig()
	const {
		fileTree,
		currentFile,
		currentFileContent,
		isLoadingFile,
		loadFileTree,
		readFile,
		writeFile,
		watchDirectory,
	} = useFileSystem()

	const [selectedFile, setSelectedFile] = useState<string | null>(null)
	const [localEdits, setLocalEdits] = useState<{ file: string, content: string } | null>(null)
	const [showSettings, setShowSettings] = useState(false)
	const [showNewFileDialog, setShowNewFileDialog] = useState(false)
	const [showSearch, setShowSearch] = useState(false)
	const [newFileName, setNewFileName] = useState('')

	// Track which vault we've indexed to detect vault path changes
	const indexedVaultRef = useRef<string | null>(null)

	// Derive editor content: use local edits if they match current file, otherwise use file content
	const hasLocalEdits = localEdits !== null && localEdits.file === currentFile
	const editorContent = hasLocalEdits ? localEdits.content : (currentFileContent ?? '')
	const isDirty = hasLocalEdits && localEdits.content !== currentFileContent

	// Load file tree and watch directory when vault path is set
	useEffect(() => {
		if (config?.vault_path && !fileTree) {
			loadFileTree(config.vault_path)
			watchDirectory(config.vault_path)
		}
	}, [config, fileTree, loadFileTree, watchDirectory])

	// Index vault when vault path changes (separate effect to avoid re-running on fileTree changes)
	useEffect(() => {
		if (!config?.vault_path) return

		// Only index if we haven't indexed this vault yet
		if (indexedVaultRef.current === config.vault_path) return

		indexedVaultRef.current = config.vault_path
		window.electron.vector.indexVault(config.vault_path).catch(console.error)
	}, [config?.vault_path])

	// Cmd/Ctrl+K to open search
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				setShowSearch(true)
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	const handleFileSelect = async (path: string) => {
		if (isDirty && selectedFile) {
			const shouldSave = confirm('You have unsaved changes. Save before switching files?')
			if (shouldSave) {
				await handleSave()
			}
		}
		setSelectedFile(path)
		await readFile(path)
	}

	const handleEditorChange = (value: string) => {
		if (currentFile) {
			setLocalEdits({ file: currentFile, content: value })
		}
	}

	const handleSave = async () => {
		if (selectedFile && hasLocalEdits && config?.vault_path) {
			await writeFile(selectedFile, localEdits.content)
			// Embed file for vector search (fire-and-forget)
			window.electron.vector.embedFile(selectedFile, localEdits.content, config.vault_path).catch(console.error)
			setLocalEdits(null)
		}
	}

	const handleNewFile = () => {
		setNewFileName('')
		setShowNewFileDialog(true)
	}

	const handleCreateNewFile = async () => {
		if (newFileName && config?.vault_path) {
			const filename = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`
			const filePath = `${config.vault_path}/${filename}`
			await writeFile(filePath, '# New Note\n\n')
			await loadFileTree(config.vault_path)
			setShowNewFileDialog(false)
			setNewFileName('')
			setSelectedFile(filePath)
			await readFile(filePath)
		}
	}

	const handleNewFolder = () => {
		alert('New folder creation coming soon!')
	}

	if (!configExists || !config) {
		return (
			<div className="setup-screen">
				<h1 className="setup-screen__title">Welcome to Umbra Notes</h1>
				<p className="setup-screen__text">Please configure your vault to get started.</p>
				<button onClick={() => setShowSettings(true)} className="btn btn--primary btn--lg">
					Open Settings
				</button>
				{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
			</div>
		)
	}

	return (
		<div className="app-container">
			<header className="app-header">
				<h1 className="app-header__title">Umbra Notes</h1>
				<button onClick={() => setShowSettings(true)} className="btn btn--ghost">
					⚙️ Settings
				</button>
			</header>
			<main className="app-main">
				<Sidebar
					onFileSelect={handleFileSelect}
					selectedFile={selectedFile}
					onNewFile={handleNewFile}
					onNewFolder={handleNewFolder}
				/>
				<div className="content-area">
					{isLoadingFile && <div className="state-message state-message--centered">Loading file...</div>}
					{!isLoadingFile && !selectedFile && (
						<div className="state-message state-message--centered">Select a file to start editing</div>
					)}
					{!isLoadingFile && selectedFile && (
						<MarkdownEditor
							value={editorContent}
							onChange={handleEditorChange}
							onSave={handleSave}
							isDirty={isDirty}
						/>
					)}
				</div>
			</main>
			{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
			{showNewFileDialog && (
				<div className="modal-overlay">
					<div className="modal modal--compact">
						<h3 className="modal__title">New Note</h3>
						<input
							type="text"
							placeholder="note-name"
							value={newFileName}
							onChange={(e) => setNewFileName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleCreateNewFile()
								if (e.key === 'Escape') setShowNewFileDialog(false)
							}}
							className="input"
							autoFocus
						/>
						<div className="form-actions">
							<button
								onClick={() => setShowNewFileDialog(false)}
								className="btn btn--secondary"
							>
								Cancel
							</button>
							<button
								onClick={handleCreateNewFile}
								className="btn btn--primary"
								disabled={!newFileName.trim()}
							>
								Create
							</button>
						</div>
					</div>
				</div>
			)}
			{showSearch && (
				<SearchModal
					onClose={() => setShowSearch(false)}
					onSelect={handleFileSelect}
				/>
			)}
		</div>
	)
}
