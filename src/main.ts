import { Plugin } from 'obsidian';

export default class UmbraPlugin extends Plugin {
	async onload() {
		console.log('Loading Umbra plugin');

		// TODO: Initialize VectorService
		// TODO: Register commands
		// TODO: Register event handlers
		// TODO: Add status bar item
	}

	onunload() {
		console.log('Unloading Umbra plugin');
	}
}
