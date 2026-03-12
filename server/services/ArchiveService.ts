/**
 * Daily notes archive service.
 * Moves processed daily notes to archive folder while preserving content.
 */

import fs from 'fs/promises';
import path from 'path';

export interface ArchiveResult {
	archived: string[];
	failed: { path: string; error: string }[];
}

export class ArchiveService {
	/**
	 * Archive a single note by moving it to the archive folder.
	 * Creates archive folder if it doesn't exist.
	 *
	 * @param notePath Vault-relative path to the note (e.g., "daily/2024-01-15.md")
	 * @param vaultPath Absolute path to vault root
	 * @param archiveFolder Vault-relative archive folder (e.g., "daily/.archive")
	 * @returns The new vault-relative path of the archived note
	 */
	async archiveNote(
		notePath: string,
		vaultPath: string,
		archiveFolder: string
	): Promise<string> {
		const absoluteSource = this.toAbsolutePath(notePath, vaultPath);
		const fileName = path.basename(notePath);
		const archivePath = `${archiveFolder}/${fileName}`;
		const absoluteTarget = this.toAbsolutePath(archivePath, vaultPath);

		// Ensure archive folder exists
		const archiveDir = path.dirname(absoluteTarget);
		await fs.mkdir(archiveDir, { recursive: true });

		// Check if source exists
		try {
			await fs.access(absoluteSource);
		} catch {
			throw new Error(`Note not found: ${notePath}`);
		}

		// Handle naming conflicts by appending timestamp
		let finalTarget = absoluteTarget;
		let finalPath = archivePath;
		try {
			await fs.access(finalTarget);
			// File exists, add timestamp
			const ext = path.extname(fileName);
			const base = path.basename(fileName, ext);
			const timestamp = Date.now();
			const newName = `${base}-${timestamp}${ext}`;
			finalPath = `${archiveFolder}/${newName}`;
			finalTarget = this.toAbsolutePath(finalPath, vaultPath);
		} catch {
			// File doesn't exist, use original path
		}

		// Move the file
		await fs.rename(absoluteSource, finalTarget);

		return finalPath;
	}

	/**
	 * Archive multiple notes at once.
	 * Continues even if individual notes fail.
	 */
	async archiveNotes(
		notePaths: string[],
		vaultPath: string,
		archiveFolder: string
	): Promise<ArchiveResult> {
		const archived: string[] = [];
		const failed: { path: string; error: string }[] = [];

		for (const notePath of notePaths) {
			try {
				await this.archiveNote(notePath, vaultPath, archiveFolder);
				archived.push(notePath);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				failed.push({ path: notePath, error: message });
			}
		}

		return { archived, failed };
	}

	/**
	 * List notes in a folder that match the daily note pattern.
	 * Default pattern matches YYYY-MM-DD.md format.
	 *
	 * @param folder Vault-relative folder path
	 * @param vaultPath Absolute path to vault root
	 * @param pattern Regex pattern to match note names
	 * @returns Array of vault-relative paths
	 */
	async listDailyNotes(
		folder: string,
		vaultPath: string,
		pattern = /^\d{4}-\d{2}-\d{2}\.md$/
	): Promise<string[]> {
		const absoluteFolder = this.toAbsolutePath(folder, vaultPath);
		const notes: string[] = [];

		try {
			const entries = await fs.readdir(absoluteFolder, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isFile() && pattern.test(entry.name)) {
					notes.push(`${folder}/${entry.name}`);
				}
			}
		} catch (error) {
			// Folder doesn't exist or can't be read
			console.error(`Failed to read daily notes folder ${folder}:`, error);
		}

		// Sort by name (which sorts by date for YYYY-MM-DD format)
		return notes.sort();
	}

	/**
	 * Convert vault-relative path to absolute path.
	 */
	private toAbsolutePath(relativePath: string, vaultPath: string): string {
		const normalized = relativePath.split('/').join(path.sep);
		return path.join(vaultPath, normalized);
	}
}
