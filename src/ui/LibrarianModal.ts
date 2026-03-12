import { App, Modal, Notice, Setting } from 'obsidian';
import { ApiClient } from '../services/ApiClient';
import { ChangePlan, LibrarianAction, LibrarianSettings } from '../types';

type LibrarianState = 'idle' | 'processing' | 'review' | 'applying';

export class LibrarianModal extends Modal {
	private apiClient: ApiClient;
	private settings: LibrarianSettings;
	private state: LibrarianState = 'idle';
	private plan: ChangePlan | null = null;
	private selectedActions: Set<number> = new Set();

	constructor(app: App, apiClient: ApiClient, settings: LibrarianSettings) {
		super(app);
		this.apiClient = apiClient;
		this.settings = settings;
	}

	onOpen() {
		this.render();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('umbra-librarian-modal');

		switch (this.state) {
			case 'idle':
				this.renderIdleState();
				break;
			case 'processing':
				this.renderProcessingState();
				break;
			case 'review':
				this.renderReviewState();
				break;
			case 'applying':
				this.renderApplyingState();
				break;
		}
	}

	private renderIdleState() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Librarian' });
		contentEl.createEl('p', {
			text: 'Analyze your daily notes and organize them into your knowledge base.',
			cls: 'umbra-librarian-description',
		});

		// Settings summary
		const settingsDiv = contentEl.createDiv('umbra-librarian-settings-summary');
		settingsDiv.createEl('p', { text: `Daily notes folder: ${this.settings.dailyNotesFolder}` });
		settingsDiv.createEl('p', { text: `Archive folder: ${this.settings.archiveFolder}` });
		settingsDiv.createEl('p', { text: `Max notes per run: ${this.settings.maxNotesPerRun}` });

		if (!this.settings.apiKey) {
			contentEl.createEl('p', {
				text: 'Please configure your API key in the Umbra settings first.',
				cls: 'umbra-librarian-warning',
			});
			return;
		}

		// Process button
		const buttonDiv = contentEl.createDiv('umbra-librarian-buttons');
		const processBtn = buttonDiv.createEl('button', {
			text: 'Analyze Daily Notes',
			cls: 'mod-cta',
		});
		processBtn.addEventListener('click', () => this.startProcessing());
	}

	private renderProcessingState() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Analyzing...' });
		contentEl.createDiv({
			cls: 'umbra-librarian-loading',
			text: 'The librarian is reading your daily notes and exploring your vault to create an organization plan. This may take a minute...',
		});

		// Add a spinner or progress indicator
		const spinner = contentEl.createDiv('umbra-librarian-spinner');
		spinner.innerHTML = '<div class="umbra-spinner"></div>';
	}

	private renderReviewState() {
		const { contentEl } = this;

		if (!this.plan) {
			this.state = 'idle';
			this.render();
			return;
		}

		contentEl.createEl('h2', { text: 'Review Changes' });

		// Summary
		contentEl.createEl('p', {
			text: this.plan.summary,
			cls: 'umbra-librarian-summary',
		});

		// Processed notes
		const notesSection = contentEl.createDiv('umbra-librarian-section');
		notesSection.createEl('h3', { text: 'Notes Analyzed' });
		const notesList = notesSection.createEl('ul');
		for (const note of this.plan.processedNotes) {
			const li = notesList.createEl('li');
			li.createEl('strong', { text: note.path });
			if (note.summary) {
				li.createEl('span', { text: ` - ${note.summary}` });
			}
		}

		// Actions
		if (this.plan.actions.length > 0) {
			const actionsSection = contentEl.createDiv('umbra-librarian-section');
			actionsSection.createEl('h3', { text: 'Proposed Changes' });

			// Select all / none buttons
			const selectDiv = actionsSection.createDiv('umbra-librarian-select-buttons');
			const selectAllBtn = selectDiv.createEl('button', { text: 'Select All' });
			selectAllBtn.addEventListener('click', () => {
				this.plan!.actions.forEach((_, i) => this.selectedActions.add(i));
				this.render();
			});
			const selectNoneBtn = selectDiv.createEl('button', { text: 'Select None' });
			selectNoneBtn.addEventListener('click', () => {
				this.selectedActions.clear();
				this.render();
			});

			// Action list
			const actionsList = actionsSection.createDiv('umbra-librarian-actions');
			this.plan.actions.forEach((action, index) => {
				const actionEl = actionsList.createDiv('umbra-librarian-action');

				// Checkbox
				const checkbox = actionEl.createEl('input', { type: 'checkbox' });
				checkbox.checked = this.selectedActions.has(index);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.selectedActions.add(index);
					} else {
						this.selectedActions.delete(index);
					}
				});

				// Action details
				const details = actionEl.createDiv('umbra-librarian-action-details');
				details.createEl('div', {
					text: this.formatActionTitle(action),
					cls: 'umbra-librarian-action-title',
				});
				details.createEl('div', {
					text: action.reason,
					cls: 'umbra-librarian-action-reason',
				});

				// Preview content for create/update
				if ((action.type === 'create' || action.type === 'update') && action.content) {
					const preview = details.createEl('details', { cls: 'umbra-librarian-action-preview' });
					preview.createEl('summary', { text: 'Preview content' });
					preview.createEl('pre', { text: this.truncateContent(action.content, 500) });
				}
			});
		} else {
			contentEl.createEl('p', {
				text: 'No changes needed - your daily notes are already well organized!',
				cls: 'umbra-librarian-no-changes',
			});
		}

		// Usage stats
		const usageDiv = contentEl.createDiv('umbra-librarian-usage');
		usageDiv.createEl('small', {
			text: `Tokens used: ${this.plan.usage.inputTokens} input, ${this.plan.usage.outputTokens} output`,
		});

		// Action buttons
		const buttonDiv = contentEl.createDiv('umbra-librarian-buttons');

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		if (this.plan.actions.length > 0) {
			const applyBtn = buttonDiv.createEl('button', {
				text: `Apply ${this.selectedActions.size} Changes`,
				cls: 'mod-cta',
			});
			applyBtn.disabled = this.selectedActions.size === 0;
			applyBtn.addEventListener('click', () => this.applyChanges());
		}
	}

	private renderApplyingState() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Applying Changes...' });
		contentEl.createDiv({
			cls: 'umbra-librarian-loading',
			text: 'Applying your approved changes and archiving processed daily notes...',
		});
	}

	private async startProcessing() {
		this.state = 'processing';
		this.render();

		try {
			const result = await this.apiClient.librarianProcess(
				this.settings.dailyNotesFolder,
				this.settings.apiKey,
				this.settings.maxNotesPerRun
			);

			if (result.plan) {
				this.plan = result.plan;
				// Select all actions by default
				this.plan.actions.forEach((_, i) => this.selectedActions.add(i));
				this.state = 'review';
			} else {
				new Notice(`Librarian error: ${result.error}`);
				this.state = 'idle';
			}
		} catch (error) {
			console.error('Librarian processing failed:', error);
			new Notice('Failed to process daily notes. Check console for details.');
			this.state = 'idle';
		}

		this.render();
	}

	private async applyChanges() {
		if (!this.plan) return;

		this.state = 'applying';
		this.render();

		// Get selected actions
		const selectedActions = this.plan.actions.filter((_, i) => this.selectedActions.has(i));
		const notesToArchive = this.plan.processedNotes.map((n) => n.path);

		try {
			const result = await this.apiClient.librarianApply(
				selectedActions,
				this.settings.archiveFolder,
				notesToArchive
			);

			if (result.success) {
				new Notice(`Applied ${result.applied.length} changes, archived ${result.archived.length} notes`);
			} else {
				const errorCount = result.errors.length;
				new Notice(`Completed with ${errorCount} error(s). Check console for details.`);
				console.error('Librarian apply errors:', result.errors);
			}

			this.close();
		} catch (error) {
			console.error('Failed to apply changes:', error);
			new Notice('Failed to apply changes. Check console for details.');
			this.state = 'review';
			this.render();
		}
	}

	private formatActionTitle(action: LibrarianAction): string {
		switch (action.type) {
			case 'create':
				return `Create: ${action.path}`;
			case 'update':
				return `Update: ${action.path} (${action.position})`;
			case 'move':
				return `Move: ${action.fromPath} -> ${action.toPath}`;
			default:
				return 'Unknown action';
		}
	}

	private truncateContent(content: string, maxLength: number): string {
		if (content.length <= maxLength) return content;
		return content.slice(0, maxLength) + '\n...[truncated]';
	}
}
