/**
 * Vector record stored in LanceDB.
 * Index signature required for LanceDB compatibility.
 */
export interface NoteVector {
	id: string;
	vector: number[];
	path: string;
	content_hash: string;
	last_updated: number;
	[key: string]: unknown;
}

/** LanceDB query result includes distance metric */
export interface NoteVectorQueryResult extends NoteVector {
	_distance: number;
}

export interface SearchResult {
	path: string;
	score: number;
	headerPath: string;
	startLine: number;
}

export interface IndexStats {
	indexed: number;
	removed: number;
}

// Librarian types
export interface LibrarianAction {
	type: 'create' | 'update' | 'move';
	path?: string;
	fromPath?: string;
	toPath?: string;
	content?: string;
	position?: 'append' | 'prepend' | 'section';
	section?: string;
	reason: string;
}

export interface ProcessedNote {
	path: string;
	summary: string;
}

export interface ChangePlan {
	processedNotes: ProcessedNote[];
	actions: LibrarianAction[];
	summary: string;
	usage: {
		inputTokens: number;
		outputTokens: number;
	};
}

export interface LibrarianSettings {
	apiKey: string;
	dailyNotesFolder: string;
	archiveFolder: string;
	maxNotesPerRun: number;
}

export interface ApplyResult {
	success: boolean;
	applied: string[];
	archived: string[];
	errors: { action: string; error: string }[];
}
