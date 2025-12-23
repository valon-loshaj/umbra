import { contextBridge, ipcRenderer } from 'electron'

import { AppConfig, FileNode, SearchResult } from '../shared/types'

export type Channels
	= | 'config:load'
		| 'config:save'
		| 'config:exists'
		| 'fs:read-file'
		| 'fs:write-file'
		| 'fs:delete-file'
		| 'fs:create-directory'
		| 'fs:delete-directory'
		| 'fs:get-file-tree'
		| 'fs:file-exists'
		| 'fs:get-file-stats'
		| 'fs:watch-directory'
		| 'fs:unwatch-directory'
		| 'fs:file-changed'
		| 'vector:embed-file'
		| 'vector:search'
		| 'vector:index-vault'

const electronHandler = {
	config: {
		load: () => ipcRenderer.invoke('config:load') as Promise<AppConfig | null>,
		save: (config: AppConfig) => ipcRenderer.invoke('config:save', config) as Promise<void>,
		exists: () => ipcRenderer.invoke('config:exists') as Promise<boolean>,
	},
	fs: {
		readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath) as Promise<string>,
		writeFile: (filePath: string, content: string) =>
			ipcRenderer.invoke('fs:write-file', filePath, content) as Promise<void>,
		deleteFile: (filePath: string) => ipcRenderer.invoke('fs:delete-file', filePath) as Promise<void>,
		createDirectory: (dirPath: string) => ipcRenderer.invoke('fs:create-directory', dirPath) as Promise<void>,
		deleteDirectory: (dirPath: string) => ipcRenderer.invoke('fs:delete-directory', dirPath) as Promise<void>,
		getFileTree: (rootPath: string) => ipcRenderer.invoke('fs:get-file-tree', rootPath) as Promise<FileNode>,
		fileExists: (filePath: string) => ipcRenderer.invoke('fs:file-exists', filePath) as Promise<boolean>,
		getFileStats: (filePath: string) =>
			ipcRenderer.invoke('fs:get-file-stats', filePath) as Promise<{
				size: number
				modified: number
				created: number
			}>,
		watchDirectory: (dirPath: string) => ipcRenderer.invoke('fs:watch-directory', dirPath) as Promise<void>,
		unwatchDirectory: (dirPath: string) => ipcRenderer.invoke('fs:unwatch-directory', dirPath) as Promise<void>,
		onFileChanged: (callback: (eventType: string, filename: string) => void) => {
			const subscription = (_event: Electron.IpcRendererEvent, eventType: string, filename: string) =>
				callback(eventType, filename)
			ipcRenderer.on('fs:file-changed', subscription)
			return () => {
				ipcRenderer.removeListener('fs:file-changed', subscription)
			}
		},
	},
	vector: {
		embedFile: (filePath: string, content: string, vaultPath: string) =>
			ipcRenderer.invoke('vector:embed-file', filePath, content, vaultPath) as Promise<void>,
		search: (query: string, vaultPath: string, limit?: number) =>
			ipcRenderer.invoke('vector:search', query, vaultPath, limit) as Promise<SearchResult[]>,
		indexVault: (vaultPath: string) =>
			ipcRenderer.invoke('vector:index-vault', vaultPath) as Promise<void>,
	},
}

contextBridge.exposeInMainWorld('electron', electronHandler)

export type ElectronHandler = typeof electronHandler
