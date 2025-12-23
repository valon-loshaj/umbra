import { useState } from 'react'

import { FileNode } from '@shared/types'

interface FileTreeProps {
	node: FileNode
	onFileSelect: (path: string) => void
	selectedFile: string | null
	level?: number
}

export function FileTree({ node, onFileSelect, selectedFile, level = 0 }: FileTreeProps) {
	const [isExpanded, setIsExpanded] = useState(level === 0)

	const handleClick = () => {
		if (node.type === 'directory') {
			setIsExpanded(!isExpanded)
		} else {
			onFileSelect(node.path)
		}
	}

	const isSelected = node.type === 'file' && node.path === selectedFile
	const paddingLeft = level * 16 + 8

	const itemClasses = [
		'file-tree-item',
		isSelected && 'file-tree-item--selected',
	].filter(Boolean).join(' ')

	return (
		<div>
			<div
				onClick={handleClick}
				className={itemClasses}
				style={{ paddingLeft: `${paddingLeft}px` }}
			>
				{node.type === 'directory' && (
					<span className="file-tree-item__icon">{isExpanded ? '▼' : '▶'}</span>
				)}
				{node.type === 'file' && <span className="file-tree-item__icon">📄</span>}
				<span className="file-tree-item__name">{node.name}</span>
			</div>
			{node.type === 'directory' && isExpanded && node.children && (
				<div className="file-tree-children">
					{node.children.map((child) => (
						<FileTree
							key={child.path}
							node={child}
							onFileSelect={onFileSelect}
							selectedFile={selectedFile}
							level={level + 1}
						/>
					))}
				</div>
			)}
		</div>
	)
}
