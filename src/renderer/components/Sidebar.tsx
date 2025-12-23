import { useFileSystem } from '../contexts/FileSystemContext'

import { FileTree } from './Sidebar/FileTree'

interface SidebarProps {
	onFileSelect: (path: string) => void
	selectedFile: string | null
	onNewFile: () => void
	onNewFolder: () => void
}

export function Sidebar({ onFileSelect, selectedFile, onNewFile, onNewFolder }: SidebarProps) {
	const { fileTree, isLoadingTree } = useFileSystem()

	return (
		<aside className="sidebar">
			<div className="sidebar__header">
				<h2 className="sidebar__title">Files</h2>
				<div className="sidebar__actions">
					<button onClick={onNewFile} className="btn btn--minimal" title="New file">
						📄
					</button>
					<button onClick={onNewFolder} className="btn btn--minimal" title="New folder">
						📁
					</button>
				</div>
			</div>
			<div className="sidebar__content">
				{isLoadingTree && <div className="state-message sidebar__state">Loading...</div>}
				{!isLoadingTree && !fileTree && (
					<div className="state-message sidebar__state">No vault configured</div>
				)}
				{!isLoadingTree && fileTree && (
					<FileTree
						node={fileTree}
						onFileSelect={onFileSelect}
						selectedFile={selectedFile}
					/>
				)}
			</div>
		</aside>
	)
}
