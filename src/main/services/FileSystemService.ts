import { watch, FSWatcher } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import { FileNode } from '../../shared/types'

export class FileSystemService {
	private watchers: Map<string, FSWatcher> = new Map()

	async ensureVaultDir(vaultPath: string): Promise<void> {
		try {
			await fs.access(vaultPath)
		} catch {
			await fs.mkdir(vaultPath, { recursive: true })
		}
	}

	async readFile(filePath: string): Promise<string> {
		return await fs.readFile(filePath, 'utf-8')
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const dir = path.dirname(filePath)
		await fs.mkdir(dir, { recursive: true })
		await fs.writeFile(filePath, content, 'utf-8')
	}

	async deleteFile(filePath: string): Promise<void> {
		await fs.unlink(filePath)
	}

	async createDirectory(dirPath: string): Promise<void> {
		await fs.mkdir(dirPath, { recursive: true })
	}

	async deleteDirectory(dirPath: string): Promise<void> {
		await fs.rm(dirPath, { recursive: true, force: true })
	}

	async getFileTree(rootPath: string): Promise<FileNode> {
		const stats = await fs.stat(rootPath)
		const name = path.basename(rootPath)

		if (!stats.isDirectory()) {
			return {
				name,
				path: rootPath,
				type: 'file',
			}
		}

		const entries = await fs.readdir(rootPath)
		const children: FileNode[] = []

		for (const entry of entries) {
			if (entry.startsWith('.')) continue

			const fullPath = path.join(rootPath, entry)
			try {
				const child = await this.getFileTree(fullPath)
				children.push(child)
			} catch (error) {
				console.error(`Error reading ${fullPath}:`, error)
			}
		}

		children.sort((a, b) => {
			if (a.type === b.type) return a.name.localeCompare(b.name)
			return a.type === 'directory' ? -1 : 1
		})

		return {
			name,
			path: rootPath,
			type: 'directory',
			children,
		}
	}

	watchDirectory(
		dirPath: string,
		callback: (eventType: string, filename: string) => void,
	): void {
		if (this.watchers.has(dirPath)) {
			return
		}

		const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
			if (filename) {
				callback(eventType, filename)
			}
		})

		this.watchers.set(dirPath, watcher)
	}

	unwatchDirectory(dirPath: string): void {
		const watcher = this.watchers.get(dirPath)
		if (watcher) {
			watcher.close()
			this.watchers.delete(dirPath)
		}
	}

	async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath)
			return true
		} catch {
			return false
		}
	}

	async getFileStats(filePath: string): Promise<{
		size: number
		modified: number
		created: number
	}> {
		const stats = await fs.stat(filePath)
		return {
			size: stats.size,
			modified: stats.mtimeMs,
			created: stats.birthtimeMs,
		}
	}
}

export const fileSystemService = new FileSystemService()
