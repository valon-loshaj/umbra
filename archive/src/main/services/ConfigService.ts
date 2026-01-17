import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { AppConfig } from '../../shared/types'

const CONFIG_DIR = path.join(os.homedir(), '.umbra')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

export class ConfigService {
	private config: AppConfig | null = null

	async ensureConfigDir(): Promise<void> {
		try {
			await fs.access(CONFIG_DIR)
		} catch {
			await fs.mkdir(CONFIG_DIR, { recursive: true })
		}
	}

	async loadConfig(): Promise<AppConfig | null> {
		try {
			await this.ensureConfigDir()
			const data = await fs.readFile(CONFIG_PATH, 'utf-8')
			this.config = JSON.parse(data) as AppConfig
			return this.config
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return null
			}
			throw error
		}
	}

	async saveConfig(config: AppConfig): Promise<void> {
		await this.ensureConfigDir()
		await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
		this.config = config
	}

	getConfig(): AppConfig | null {
		return this.config
	}

	async configExists(): Promise<boolean> {
		try {
			await fs.access(CONFIG_PATH)
			return true
		} catch {
			return false
		}
	}
}

export const configService = new ConfigService()
