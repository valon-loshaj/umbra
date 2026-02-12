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
