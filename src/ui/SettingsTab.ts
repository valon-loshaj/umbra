import { App, PluginSettingTab, Setting } from 'obsidian';
import type UmbraPlugin from '../main';

export interface UmbraSettings {
	librarian: {
		apiKey: string;
		dailyNotesFolder: string;
		archiveFolder: string;
		maxNotesPerRun: number;
	};
}

export const DEFAULT_SETTINGS: UmbraSettings = {
	librarian: {
		apiKey: '',
		dailyNotesFolder: 'daily',
		archiveFolder: 'daily/.archive',
		maxNotesPerRun: 5,
	},
};

export class UmbraSettingsTab extends PluginSettingTab {
	plugin: UmbraPlugin;

	constructor(app: App, plugin: UmbraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h1', { text: 'Umbra Settings' });

		// Librarian section
		containerEl.createEl('h2', { text: 'Librarian' });
		containerEl.createEl('p', {
			text: 'Configure the AI-powered librarian that organizes your daily notes.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Anthropic API Key')
			.setDesc('Your Anthropic API key for the Claude model. Get one at console.anthropic.com')
			.addText((text) =>
				text
					.setPlaceholder('sk-ant-...')
					.setValue(this.plugin.settings.librarian.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.librarian.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Daily Notes Folder')
			.setDesc('Folder containing your daily notes (relative to vault root)')
			.addText((text) =>
				text
					.setPlaceholder('daily')
					.setValue(this.plugin.settings.librarian.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.librarian.dailyNotesFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Archive Folder')
			.setDesc('Folder where processed daily notes will be archived')
			.addText((text) =>
				text
					.setPlaceholder('daily/.archive')
					.setValue(this.plugin.settings.librarian.archiveFolder)
					.onChange(async (value) => {
						this.plugin.settings.librarian.archiveFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Max Notes Per Run')
			.setDesc('Maximum number of daily notes to process in a single run (1-10)')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.librarian.maxNotesPerRun)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.librarian.maxNotesPerRun = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
