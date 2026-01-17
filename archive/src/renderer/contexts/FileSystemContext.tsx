import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

import { FileNode } from '@shared/types'

interface FileSystemContextType {
	fileTree: FileNode | null
	currentFile: string | null
	currentFileContent: string | null
	isLoadingTree: boolean
	isLoadingFile: boolean
	loadFileTree: (vaultPath: string) => Promise<void>
	readFile: (filePath: string) => Promise<void>
	writeFile: (filePath: string, content: string) => Promise<void>
	deleteFile: (filePath: string) => Promise<void>
	createDirectory: (dirPath: string) => Promise<void>
	deleteDirectory: (dirPath: string) => Promise<void>
	watchDirectory: (dirPath: string) => Promise<void>
	unwatchDirectory: (dirPath: string) => Promise<void>
}

const FileSystemContext = createContext<FileSystemContextType | undefined>(undefined)

export function FileSystemProvider({ children }: { children: ReactNode }) {
	const [fileTree, setFileTree] = useState<FileNode | null>(null)
	const [currentFile, setCurrentFile] = useState<string | null>(null)
	const [currentFileContent, setCurrentFileContent] = useState<string | null>(null)
	const [isLoadingTree, setIsLoadingTree] = useState(false)
	const [isLoadingFile, setIsLoadingFile] = useState(false)

	useEffect(() => {
		const unsubscribe = window.electron.fs.onFileChanged((eventType, filename) => {
			console.log(`File changed: ${eventType} - ${filename}`)
		})

		return () => {
			if (unsubscribe) {
				unsubscribe()
			}
		}
	}, [])

	const loadFileTree = async (vaultPath: string) => {
		try {
			setIsLoadingTree(true)
			const tree = await window.electron.fs.getFileTree(vaultPath)
			setFileTree(tree)
		} catch (error) {
			console.error('Failed to load file tree:', error)
			throw error
		} finally {
			setIsLoadingTree(false)
		}
	}

	const readFile = async (filePath: string) => {
		try {
			setIsLoadingFile(true)
			const content = await window.electron.fs.readFile(filePath)
			setCurrentFile(filePath)
			setCurrentFileContent(content)
		} catch (error) {
			console.error('Failed to read file:', error)
			throw error
		} finally {
			setIsLoadingFile(false)
		}
	}

	const writeFile = async (filePath: string, content: string) => {
		try {
			await window.electron.fs.writeFile(filePath, content)
			if (currentFile === filePath) {
				setCurrentFileContent(content)
			}
		} catch (error) {
			console.error('Failed to write file:', error)
			throw error
		}
	}

	const deleteFile = async (filePath: string) => {
		try {
			await window.electron.fs.deleteFile(filePath)
			if (currentFile === filePath) {
				setCurrentFile(null)
				setCurrentFileContent(null)
			}
		} catch (error) {
			console.error('Failed to delete file:', error)
			throw error
		}
	}

	const createDirectory = async (dirPath: string) => {
		try {
			await window.electron.fs.createDirectory(dirPath)
		} catch (error) {
			console.error('Failed to create directory:', error)
			throw error
		}
	}

	const deleteDirectory = async (dirPath: string) => {
		try {
			await window.electron.fs.deleteDirectory(dirPath)
		} catch (error) {
			console.error('Failed to delete directory:', error)
			throw error
		}
	}

	const watchDirectory = async (dirPath: string) => {
		try {
			await window.electron.fs.watchDirectory(dirPath)
		} catch (error) {
			console.error('Failed to watch directory:', error)
			throw error
		}
	}

	const unwatchDirectory = async (dirPath: string) => {
		try {
			await window.electron.fs.unwatchDirectory(dirPath)
		} catch (error) {
			console.error('Failed to unwatch directory:', error)
			throw error
		}
	}

	return (
		<FileSystemContext.Provider
			value={{
				fileTree,
				currentFile,
				currentFileContent,
				isLoadingTree,
				isLoadingFile,
				loadFileTree,
				readFile,
				writeFile,
				deleteFile,
				createDirectory,
				deleteDirectory,
				watchDirectory,
				unwatchDirectory,
			}}
		>
			{children}
		</FileSystemContext.Provider>
	)
}

export function useFileSystem() {
	const context = useContext(FileSystemContext)
	if (context === undefined) {
		throw new Error('useFileSystem must be used within a FileSystemProvider')
	}
	return context
}
