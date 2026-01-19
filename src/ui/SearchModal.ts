import { App, Modal, TFile, Notice } from 'obsidian';
import { ApiClient } from '../services/ApiClient';
import { SearchResult } from '../types';

export class SearchModal extends Modal {
	private apiClient: ApiClient;
	private inputEl: HTMLInputElement;
	private resultsEl: HTMLElement;
	private results: SearchResult[] = [];
	private selectedIndex: number = 0;
	private debounceTimer: NodeJS.Timeout | null = null;
	private isSearching: boolean = false;

	constructor(app: App, apiClient: ApiClient) {
		super(app);
		this.apiClient = apiClient;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('umbra-search-modal');

		// Create search input
		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			cls: 'umbra-search-input',
			placeholder: 'Search your notes...',
		});

		// Create results container
		this.resultsEl = contentEl.createDiv('umbra-search-results');

		// Focus input
		this.inputEl.focus();

		// Add event listeners
		this.inputEl.addEventListener('input', this.handleInput.bind(this));
		this.inputEl.addEventListener('keydown', this.handleKeyDown.bind(this));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
	}

	private handleInput() {
		const query = this.inputEl.value.trim();

		// Clear existing timer
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		// Debounce search by 300ms
		this.debounceTimer = setTimeout(() => {
			if (query.length > 0) {
				this.performSearch(query);
			} else {
				this.clearResults();
			}
		}, 300);
	}

	private async performSearch(query: string) {
		this.isSearching = true;
		this.showLoading();

		try {
			this.results = await this.apiClient.search(query, 10);
			this.selectedIndex = 0;
			this.renderResults();
		} catch (error) {
			console.error('Search failed:', error);
			this.showError('Search failed. Check console for details.');
		} finally {
			this.isSearching = false;
		}
	}

	private handleKeyDown(evt: KeyboardEvent) {
		if (this.isSearching) return;

		switch (evt.key) {
			case 'ArrowDown':
				evt.preventDefault();
				this.selectNext();
				break;
			case 'ArrowUp':
				evt.preventDefault();
				this.selectPrevious();
				break;
			case 'Enter':
				evt.preventDefault();
				this.openSelected(evt.metaKey || evt.ctrlKey);
				break;
			case 'Escape':
				evt.preventDefault();
				this.close();
				break;
		}
	}

	private selectNext() {
		if (this.results.length === 0) return;
		this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
		this.updateSelection();
	}

	private selectPrevious() {
		if (this.results.length === 0) return;
		this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
		this.updateSelection();
	}

	private updateSelection() {
		const resultElements = this.resultsEl.querySelectorAll('.umbra-search-result');
		resultElements.forEach((el, index) => {
			if (index === this.selectedIndex) {
				el.addClass('is-selected');
				el.scrollIntoView({ block: 'nearest' });
			} else {
				el.removeClass('is-selected');
			}
		});
	}

	private async openSelected(newPane: boolean) {
		if (this.results.length === 0 || this.selectedIndex >= this.results.length) {
			return;
		}

		const result = this.results[this.selectedIndex];
		const file = this.app.vault.getAbstractFileByPath(result.path);

		if (!(file instanceof TFile)) {
			new Notice(`File not found: ${result.path}`);
			return;
		}

		// Get active leaf
		const leaf = newPane
			? this.app.workspace.getLeaf('tab')
			: this.app.workspace.getLeaf(false);

		// Open the file
		await leaf.openFile(file);

		// Close the modal
		this.close();
	}

	private showLoading() {
		this.resultsEl.empty();
		this.resultsEl.createDiv({
			cls: 'umbra-search-loading',
			text: 'Searching...',
		});
	}

	private showError(message: string) {
		this.resultsEl.empty();
		this.resultsEl.createDiv({
			cls: 'umbra-search-error',
			text: message,
		});
	}

	private clearResults() {
		this.results = [];
		this.selectedIndex = 0;
		this.resultsEl.empty();
	}

	private renderResults() {
		this.resultsEl.empty();

		if (this.results.length === 0) {
			this.resultsEl.createDiv({
				cls: 'umbra-search-empty',
				text: 'No results found',
			});
			return;
		}

		this.results.forEach((result, index) => {
			const resultEl = this.resultsEl.createDiv('umbra-search-result');

			if (index === this.selectedIndex) {
				resultEl.addClass('is-selected');
			}

			// Extract filename from path
			const filename = result.path.split('/').pop() || result.path;
			const dirname = result.path.substring(0, result.path.lastIndexOf('/')) || '/';

			// Title
			resultEl.createDiv({
				cls: 'umbra-result-title',
				text: filename.replace('.md', ''),
			});

			// Path
			resultEl.createDiv({
				cls: 'umbra-result-path',
				text: dirname,
			});

			// Click handler
			resultEl.addEventListener('click', (evt) => {
				this.selectedIndex = index;
				this.openSelected(evt.metaKey || evt.ctrlKey);
			});

			// Hover handler
			resultEl.addEventListener('mouseenter', () => {
				this.selectedIndex = index;
				this.updateSelection();
			});
		});
	}
}
