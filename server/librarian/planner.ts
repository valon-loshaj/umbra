/**
 * Librarian change plan types.
 * Represents proposed changes to organize daily notes into the vault.
 */

/** A proposed file creation */
export interface CreateFileAction {
	type: 'create';
	path: string;
	content: string;
	reason: string;
}

/** A proposed file update (append or prepend content) */
export interface UpdateFileAction {
	type: 'update';
	path: string;
	content: string;
	position: 'append' | 'prepend' | 'section';
	section?: string; // Header to insert under if position is 'section'
	reason: string;
}

/** A proposed file move/rename */
export interface MoveFileAction {
	type: 'move';
	fromPath: string;
	toPath: string;
	reason: string;
}

/** Union of all action types */
export type ChangeAction = CreateFileAction | UpdateFileAction | MoveFileAction;

/** Summary of a daily note that was processed */
export interface ProcessedNote {
	path: string;
	summary: string;
}

/** Complete change plan from the librarian agent */
export interface ChangePlan {
	/** Notes that were analyzed */
	processedNotes: ProcessedNote[];
	/** Proposed changes to make */
	actions: ChangeAction[];
	/** High-level summary of what the plan accomplishes */
	summary: string;
	/** Token usage for the planning session */
	usage: {
		inputTokens: number;
		outputTokens: number;
	};
}

/** Validate that a change plan has required fields */
export function isValidChangePlan(plan: unknown): plan is ChangePlan {
	if (!plan || typeof plan !== 'object') return false;

	const p = plan as Record<string, unknown>;

	if (!Array.isArray(p.processedNotes)) return false;
	if (!Array.isArray(p.actions)) return false;
	if (typeof p.summary !== 'string') return false;

	// Validate each action
	for (const action of p.actions as unknown[]) {
		if (!isValidAction(action)) return false;
	}

	return true;
}

function isValidAction(action: unknown): action is ChangeAction {
	if (!action || typeof action !== 'object') return false;

	const a = action as Record<string, unknown>;

	switch (a.type) {
		case 'create':
			return typeof a.path === 'string' && typeof a.content === 'string';
		case 'update':
			return (
				typeof a.path === 'string' &&
				typeof a.content === 'string' &&
				['append', 'prepend', 'section'].includes(a.position as string)
			);
		case 'move':
			return typeof a.fromPath === 'string' && typeof a.toPath === 'string';
		default:
			return false;
	}
}
