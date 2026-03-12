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
	chunk_index: number;
	header_path: string;
	start_line: number;
	end_line: number;
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

// API Request/Response types
export interface SearchRequest {
	query: string;
	limit?: number;
	vaultPath: string;
}

export interface SearchResponse {
	results: SearchResult[];
}

export interface IndexRequest {
	vaultPath: string;
	excludeFolders?: string[];
}

export interface IndexResponse {
	stats: IndexStats;
}

export interface EmbedRequest {
	filePath: string;
	content: string;
	vaultPath: string;
}

export interface EmbedResponse {
	success: boolean;
}

export interface RemoveVectorRequest {
	filePath: string;
	vaultPath: string;
}

export interface RemoveVectorResponse {
	success: boolean;
}

export interface HealthResponse {
	status: 'ok' | 'error';
	version: string;
	uptime: number;
}

// Lexical search types
export interface LexicalSearchRequest {
	query: string;
	vaultPath: string;
	limit?: number;
	caseSensitive?: boolean;
}

export interface LexicalSearchResult {
	path: string;
	matches: LexicalMatch[];
}

export interface LexicalMatch {
	line: number;
	content: string;
	column: number;
}

export interface LexicalSearchResponse {
	results: LexicalSearchResult[];
}

// Librarian types
export interface LibrarianProcessRequest {
	vaultPath: string;
	dailyNotesFolder: string;
	maxNotes?: number;
	apiKey: string;
}

export interface LibrarianProcessResponse {
	success: boolean;
	plan?: {
		processedNotes: { path: string; summary: string }[];
		actions: LibrarianAction[];
		summary: string;
		usage: { inputTokens: number; outputTokens: number };
	};
	error?: string;
}

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

export interface LibrarianApplyRequest {
	vaultPath: string;
	actions: LibrarianAction[];
	archiveFolder: string;
	notesToArchive: string[];
}

export interface LibrarianApplyResponse {
	success: boolean;
	applied: string[];
	archived: string[];
	errors: { action: string; error: string }[];
}
