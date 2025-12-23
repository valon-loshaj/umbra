import { useState, useEffect, useRef, useCallback } from 'react'

import { SearchResult } from '../../../shared/types'
import { useConfig } from '../../contexts/ConfigContext'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

interface SearchModalProps {
	onClose: () => void
	onSelect: (path: string) => void
}

/** Cross-platform path separator regex */
const PATH_SEPARATOR = /[/\\]/

/**
 * Extract filename from a path (works on both Windows and Unix)
 */
function getFileName(filePath: string): string {
	const parts = filePath.split(PATH_SEPARATOR)
	return parts[parts.length - 1] || filePath
}

/**
 * Convert absolute path to relative path from vault root
 */
function toRelativePath(filePath: string, vaultPath: string): string {
	if (!vaultPath) return filePath

	// Normalize separators for comparison
	const normalizedFile = filePath.replace(/\\/g, '/')
	const normalizedVault = vaultPath.replace(/\\/g, '/')

	if (normalizedFile.startsWith(normalizedVault)) {
		return normalizedFile.slice(normalizedVault.length).replace(/^\//, '')
	}
	return filePath
}

/**
 * Convert distance score to relevance percentage (0-100)
 * LanceDB returns L2 distance where lower = more similar
 */
function scoreToRelevance(distance: number): number {
	// Clamp and invert: distance 0 = 100%, distance 2+ = 0%
	const clamped = Math.min(Math.max(distance, 0), 2)
	return Math.round((1 - clamped / 2) * 100)
}

export function SearchModal({ onClose, onSelect }: SearchModalProps) {
	const { config } = useConfig()
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<SearchResult[]>([])
	const [isSearching, setIsSearching] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)

	const debouncedQuery = useDebouncedValue(query)

	const search = useCallback(async (searchQuery: string) => {
		if (!config?.vault_path || !searchQuery.trim()) {
			setResults([])
			return
		}

		setIsSearching(true)
		try {
			const searchResults = await window.electron.vector.search(searchQuery, config.vault_path, 10)

			// Deduplicate results by path (keep first occurrence)
			const seen = new Set<string>()
			const uniqueResults = searchResults.filter(result => {
				if (seen.has(result.path)) {
					return false
				}
				seen.add(result.path)
				return true
			})

			setResults(uniqueResults)
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
		search(debouncedQuery)
	}, [debouncedQuery, search])

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
							<div className="search-modal__result-header">
								<span className="search-modal__result-name">{getFileName(result.path)}</span>
								<span className="search-modal__result-score">{scoreToRelevance(result.score)}%</span>
							</div>
							<span className="search-modal__result-path">
								{toRelativePath(result.path, config?.vault_path ?? '')}
							</span>
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
