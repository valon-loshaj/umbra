import { MainLayout } from './components/MainLayout'
import { ConfigProvider } from './contexts/ConfigContext'
import { FileSystemProvider } from './contexts/FileSystemContext'

export function App() {
	return (
		<ConfigProvider>
			<FileSystemProvider>
				<MainLayout />
			</FileSystemProvider>
		</ConfigProvider>
	)
}
