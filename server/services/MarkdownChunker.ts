/**
 * Chunk produced by parsing markdown content.
 * Pure data structure with no storage concerns.
 */
export interface Chunk {
	content: string;
	headerPath: string; // "# Title > ## Section" or "" for no headers
	startLine: number; // 1-based
	endLine: number; // 1-based
}

/**
 * Parse markdown content into chunks based on headers.
 * Pure function - markdown in, chunks out.
 *
 * Algorithm:
 * 1. Split content by lines
 * 2. Track code fence state to ignore headers in code blocks
 * 3. When header found (outside code block), start new chunk
 * 4. Files with no headers -> single chunk with empty headerPath
 * 5. Skip YAML frontmatter
 */
export function chunkMarkdown(content: string): Chunk[] {
	const lines = content.split('\n');
	const chunks: Chunk[] = [];

	let currentChunk: { lines: string[]; headerPath: string; startLine: number } | null = null;
	let inCodeBlock = false;
	let inFrontmatter = false;
	let frontmatterStarted = false;
	const headerStack: { level: number; text: string }[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1; // 1-based

		// Handle YAML frontmatter (only at start of file)
		if (lineNum === 1 && line.trim() === '---') {
			inFrontmatter = true;
			frontmatterStarted = true;
			continue;
		}

		if (inFrontmatter) {
			if (line.trim() === '---' || line.trim() === '...') {
				inFrontmatter = false;
			}
			continue;
		}

		// Track code fence state
		if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
			inCodeBlock = !inCodeBlock;
		}

		// Check for headers (only outside code blocks)
		const headerMatch = !inCodeBlock && line.match(/^(#{1,6})\s+(.+)$/);

		if (headerMatch) {
			// Save current chunk if it has content
			if (currentChunk && currentChunk.lines.length > 0) {
				chunks.push({
					content: currentChunk.lines.join('\n'),
					headerPath: currentChunk.headerPath,
					startLine: currentChunk.startLine,
					endLine: lineNum - 1,
				});
			}

			// Update header stack
			const level = headerMatch[1].length;
			const text = headerMatch[2].trim();

			// Pop headers of same or greater level
			while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
				headerStack.pop();
			}
			headerStack.push({ level, text });

			// Build header path from stack
			const headerPath = headerStack.map((h) => `${'#'.repeat(h.level)} ${h.text}`).join(' > ');

			// Start new chunk
			currentChunk = {
				lines: [line],
				headerPath,
				startLine: lineNum,
			};
		} else {
			// Add line to current chunk, or start a new chunk if none exists
			if (!currentChunk) {
				currentChunk = {
					lines: [line],
					headerPath: '',
					startLine: lineNum,
				};
			} else {
				currentChunk.lines.push(line);
			}
		}
	}

	// Save final chunk
	if (currentChunk && currentChunk.lines.length > 0) {
		chunks.push({
			content: currentChunk.lines.join('\n'),
			headerPath: currentChunk.headerPath,
			startLine: currentChunk.startLine,
			endLine: lines.length,
		});
	}

	// Handle empty file or file with only frontmatter
	if (chunks.length === 0 && !frontmatterStarted) {
		return [];
	}

	return chunks;
}
