import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

import { AppConfig } from '@shared/types'

interface ConfigContextType {
	config: AppConfig | null
	isLoading: boolean
	saveConfig: (config: AppConfig) => Promise<void>
	configExists: boolean
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState<AppConfig | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [configExists, setConfigExists] = useState(false)

	useEffect(() => {
		loadConfig()
	}, [])

	const loadConfig = async () => {
		try {
			setIsLoading(true)
			const exists = await window.electron.config.exists()
			setConfigExists(exists)

			if (exists) {
				const loadedConfig = await window.electron.config.load()
				setConfig(loadedConfig)
			}
		} catch (error) {
			console.error('Failed to load config:', error)
		} finally {
			setIsLoading(false)
		}
	}

	const saveConfig = async (newConfig: AppConfig) => {
		try {
			await window.electron.config.save(newConfig)
			setConfig(newConfig)
			setConfigExists(true)
		} catch (error) {
			console.error('Failed to save config:', error)
			throw error
		}
	}

	return (
		<ConfigContext.Provider value={{ config, isLoading, saveConfig, configExists }}>
			{children}
		</ConfigContext.Provider>
	)
}

export function useConfig() {
	const context = useContext(ConfigContext)
	if (context === undefined) {
		throw new Error('useConfig must be used within a ConfigProvider')
	}
	return context
}
