"use strict";
/**
 * Daily notes archive service.
 * Moves processed daily notes to archive folder while preserving content.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchiveService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
class ArchiveService {
    /**
     * Archive a single note by moving it to the archive folder.
     * Creates archive folder if it doesn't exist.
     *
     * @param notePath Vault-relative path to the note (e.g., "daily/2024-01-15.md")
     * @param vaultPath Absolute path to vault root
     * @param archiveFolder Vault-relative archive folder (e.g., "daily/.archive")
     * @returns The new vault-relative path of the archived note
     */
    async archiveNote(notePath, vaultPath, archiveFolder) {
        const absoluteSource = this.toAbsolutePath(notePath, vaultPath);
        const fileName = path_1.default.basename(notePath);
        const archivePath = `${archiveFolder}/${fileName}`;
        const absoluteTarget = this.toAbsolutePath(archivePath, vaultPath);
        // Ensure archive folder exists
        const archiveDir = path_1.default.dirname(absoluteTarget);
        await promises_1.default.mkdir(archiveDir, { recursive: true });
        // Check if source exists
        try {
            await promises_1.default.access(absoluteSource);
        }
        catch {
            throw new Error(`Note not found: ${notePath}`);
        }
        // Handle naming conflicts by appending timestamp
        let finalTarget = absoluteTarget;
        let finalPath = archivePath;
        try {
            await promises_1.default.access(finalTarget);
            // File exists, add timestamp
            const ext = path_1.default.extname(fileName);
            const base = path_1.default.basename(fileName, ext);
            const timestamp = Date.now();
            const newName = `${base}-${timestamp}${ext}`;
            finalPath = `${archiveFolder}/${newName}`;
            finalTarget = this.toAbsolutePath(finalPath, vaultPath);
        }
        catch {
            // File doesn't exist, use original path
        }
        // Move the file
        await promises_1.default.rename(absoluteSource, finalTarget);
        return finalPath;
    }
    /**
     * Archive multiple notes at once.
     * Continues even if individual notes fail.
     */
    async archiveNotes(notePaths, vaultPath, archiveFolder) {
        const archived = [];
        const failed = [];
        for (const notePath of notePaths) {
            try {
                await this.archiveNote(notePath, vaultPath, archiveFolder);
                archived.push(notePath);
            }
            catch (error) {
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
    async listDailyNotes(folder, vaultPath, pattern = /^\d{4}-\d{2}-\d{2}\.md$/) {
        const absoluteFolder = this.toAbsolutePath(folder, vaultPath);
        const notes = [];
        try {
            const entries = await promises_1.default.readdir(absoluteFolder, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && pattern.test(entry.name)) {
                    notes.push(`${folder}/${entry.name}`);
                }
            }
        }
        catch (error) {
            // Folder doesn't exist or can't be read
            console.error(`Failed to read daily notes folder ${folder}:`, error);
        }
        // Sort by name (which sorts by date for YYYY-MM-DD format)
        return notes.sort();
    }
    /**
     * Convert vault-relative path to absolute path.
     */
    toAbsolutePath(relativePath, vaultPath) {
        const normalized = relativePath.split('/').join(path_1.default.sep);
        return path_1.default.join(vaultPath, normalized);
    }
}
exports.ArchiveService = ArchiveService;
