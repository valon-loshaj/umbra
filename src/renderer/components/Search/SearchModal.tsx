import { useState, useEffect, useRef, useCallback } from 'react'

import { SearchResult } from '../../../shared/types'
import { useConfig } from '../../contexts/ConfigContext'

interface SearchModalProps {
	onClose: () => void
	onSelect: (path: string) => void
}

export function SearchModal({ onClose, onSelect }: SearchModalProps) {
	const { config } = useConfig()
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<SearchResult[]>([])
	const [isSearching, setIsSearching] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const search = useCallback(async (searchQuery: string) => {
		if (!config?.vault_path || !searchQuery.trim()) {
			setResults([])
			return
		}

		setIsSearching(true)
		try {
			const searchResults = await window.electron.vector.search(searchQuery, config.vault_path, 10)
			setResults(searchResults)
			setSelectedIndex(0)
		} catch (error) {
			console.error('Search failed:', error)
			setResults([])
		} finally {
			setIsSearching(false)
		}
	}, [config?.vault_path])

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}

		debounceRef.current = setTimeout(() => {
			search(query)
		}, 300)

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current)
			}
		}
	}, [query, search])

	const handleKeyDown = (e: React.KeyboardEvent) => {
		switch (e.key) {
			case 'Escape':
				onClose()
				break
			case 'ArrowDown':
				e.preventDefault()
				setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
				break
			case 'ArrowUp':
				e.preventDefault()
				setSelectedIndex((prev) => Math.max(prev - 1, 0))
				break
			case 'Enter':
				e.preventDefault()
				if (results[selectedIndex]) {
					onSelect(results[selectedIndex].path)
					onClose()
				}
				break
		}
	}

	const getFileName = (filePath: string): string => {
		const parts = filePath.split('/')
		return parts[parts.length - 1] || filePath
	}

	const getRelativePath = (filePath: string): string => {
		if (!config?.vault_path) return filePath
		return filePath.replace(config.vault_path, '').replace(/^\//, '')
	}

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="search-modal" onClick={(e) => e.stopPropagation()}>
				<div className="search-modal__input-wrapper">
					<input
						ref={inputRef}
						type="text"
						className="search-modal__input"
						placeholder="Search notes..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
					/>
					{isSearching && <span className="search-modal__spinner" />}
				</div>

				<div className="search-modal__results">
					{!query.trim() && (
						<div className="search-modal__empty">Type to search your notes</div>
					)}

					{query.trim() && !isSearching && results.length === 0 && (
						<div className="search-modal__empty">No results found</div>
					)}

					{results.map((result, index) => (
						<button
							key={result.path}
							className={`search-modal__result ${index === selectedIndex ? 'search-modal__result--selected' : ''}`}
							onClick={() => {
								onSelect(result.path)
								onClose()
							}}
							onMouseEnter={() => setSelectedIndex(index)}
						>
							<span className="search-modal__result-name">{getFileName(result.path)}</span>
							<span className="search-modal__result-path">{getRelativePath(result.path)}</span>
						</button>
					))}
				</div>

				<div className="search-modal__hint">
					<kbd>↑↓</kbd>
					{' '}
					navigate
					<kbd>↵</kbd>
					{' '}
					select
					<kbd>esc</kbd>
					{' '}
					close
				</div>
			</div>
		</div>
	)
}
