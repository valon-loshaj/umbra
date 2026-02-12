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
