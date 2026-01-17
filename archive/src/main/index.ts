import path from 'node:path'

import { app, BrowserWindow, ipcMain } from 'electron'
import started from 'electron-squirrel-startup'

import { AppConfig } from '../shared/types'

import { configService } from './services/ConfigService'
import { fileSystemService } from './services/FileSystemService'
import { vectorService } from './services/VectorService'

if (started) {
	app.quit()
}

const createWindow = () => {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	})

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
	} else {
		mainWindow.loadFile(
			path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
		)
	}

	mainWindow.webContents.openDevTools()

	return mainWindow
}

function setupIpcHandlers(mainWindow: BrowserWindow) {
	ipcMain.handle('config:load', async () => {
		return await configService.loadConfig()
	})

	ipcMain.handle('config:save', async (_event, config: AppConfig) => {
		await configService.saveConfig(config)
	})

	ipcMain.handle('config:exists', async () => {
		return await configService.configExists()
	})

	ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
		return await fileSystemService.readFile(filePath)
	})

	ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
		await fileSystemService.writeFile(filePath, content)
	})

	ipcMain.handle('fs:delete-file', async (_event, filePath: string) => {
		await fileSystemService.deleteFile(filePath)
	})

	ipcMain.handle('fs:create-directory', async (_event, dirPath: string) => {
		await fileSystemService.createDirectory(dirPath)
	})

	ipcMain.handle('fs:delete-directory', async (_event, dirPath: string) => {
		await fileSystemService.deleteDirectory(dirPath)
	})

	ipcMain.handle('fs:get-file-tree', async (_event, rootPath: string) => {
		return await fileSystemService.getFileTree(rootPath)
	})

	ipcMain.handle('fs:file-exists', async (_event, filePath: string) => {
		return await fileSystemService.fileExists(filePath)
	})

	ipcMain.handle('fs:get-file-stats', async (_event, filePath: string) => {
		return await fileSystemService.getFileStats(filePath)
	})

	ipcMain.handle('fs:watch-directory', async (_event, dirPath: string) => {
		fileSystemService.watchDirectory(dirPath, (eventType, filename) => {
			mainWindow.webContents.send('fs:file-changed', eventType, filename)
		})
	})

	ipcMain.handle('fs:unwatch-directory', async (_event, dirPath: string) => {
		fileSystemService.unwatchDirectory(dirPath)
	})

	ipcMain.handle('vector:embed-file', async (_event, filePath: string, content: string, vaultPath: string) => {
		await vectorService.embedFile(filePath, content, vaultPath)
	})

	ipcMain.handle('vector:search', async (_event, query: string, vaultPath: string, limit?: number) => {
		return await vectorService.search(query, vaultPath, limit ?? 10)
	})

	ipcMain.handle('vector:index-vault', async (_event, vaultPath: string) => {
		return await vectorService.indexVault(vaultPath)
	})

	ipcMain.handle('vector:remove', async (_event, filePath: string, vaultPath: string) => {
		await vectorService.removeVector(filePath, vaultPath)
	})
}

app.on('ready', async () => {
	const mainWindow = createWindow()
	setupIpcHandlers(mainWindow)

	await configService.loadConfig()
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow()
	}
})
