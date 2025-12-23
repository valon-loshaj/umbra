export interface AppConfig {
	vault_path: string
	anthropic_api_key: string
	aws_access_key_id: string
	aws_secret_access_key: string
	s3_bucket_name: string
	encryption_key_hash: string
}

export interface FileNode {
	name: string
	path: string
	type: 'file' | 'directory'
	children?: FileNode[]
}

/**
 * Vector record stored in LanceDB.
 * Index signature required for LanceDB compatibility.
 */
export interface NoteVector {
	id: string
	vector: number[]
	path: string
	content_hash: string
	last_updated: number
	[key: string]: unknown
}

/** LanceDB query result includes distance metric */
export interface NoteVectorQueryResult extends NoteVector {
	_distance: number
}

export interface SearchResult {
	path: string
	score: number
}
