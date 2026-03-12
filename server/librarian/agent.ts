/**
 * Librarian agent core.
 * Implements an agentic loop to process daily notes and generate change plans.
 */

import fs from 'fs/promises';
import path from 'path';
import { LLMProvider } from '../llm/provider';
import { Message, ContentBlock, ToolUseContent } from '../llm/types';
import { VectorService } from '../services/VectorService';
import { LexicalService } from '../services/LexicalService';
import { LIBRARIAN_TOOLS, executeTool, createToolResult, ToolContext } from './tools';
import { ChangePlan, ChangeAction, ProcessedNote } from './planner';

const MAX_ITERATIONS = 10;
const MAX_NOTES_PER_RUN = 5;

const SYSTEM_PROMPT = `You are a librarian agent that organizes daily notes into a knowledge base.

Your task is to:
1. Read and understand the daily notes provided
2. Explore the existing vault structure using the tools available
3. Identify where information from daily notes should be organized
4. Create a plan to move, update, or create files

Guidelines:
- Prefer updating existing files over creating new ones
- Group related information together
- Maintain the existing organizational structure
- Preserve important context when moving content
- Create new files only for genuinely new topics
- Use clear, descriptive file names

When you're done exploring, output your plan as a JSON object with this structure:
{
  "processedNotes": [{"path": "daily/2024-01-15.md", "summary": "Brief summary"}],
  "actions": [
    {"type": "create", "path": "projects/new-project.md", "content": "...", "reason": "..."},
    {"type": "update", "path": "existing.md", "content": "...", "position": "append", "reason": "..."},
    {"type": "move", "fromPath": "old.md", "toPath": "new.md", "reason": "..."}
  ],
  "summary": "Overall summary of changes"
}

Start by exploring the vault structure, then read relevant existing notes, and finally create your plan.`;

export interface LibrarianConfig {
	dailyNotesFolder: string;
	maxNotes?: number;
}

export interface LibrarianResult {
	plan: ChangePlan | null;
	error?: string;
}

export class LibrarianAgent {
	private llm: LLMProvider;
	private vectorService: VectorService;
	private lexicalService: LexicalService;

	constructor(
		llm: LLMProvider,
		vectorService: VectorService,
		lexicalService: LexicalService
	) {
		this.llm = llm;
		this.vectorService = vectorService;
		this.lexicalService = lexicalService;
	}

	/**
	 * Process daily notes and generate a change plan.
	 */
	async process(vaultPath: string, config: LibrarianConfig): Promise<LibrarianResult> {
		const maxNotes = config.maxNotes || MAX_NOTES_PER_RUN;

		// Get daily notes to process
		const dailyNotes = await this.getDailyNotes(vaultPath, config.dailyNotesFolder, maxNotes);

		if (dailyNotes.length === 0) {
			return { plan: null, error: 'No daily notes found to process' };
		}

		// Read content of daily notes
		const noteContents = await this.readNotes(vaultPath, dailyNotes);

		// Build initial user message with daily notes
		const userMessage = this.buildInitialMessage(noteContents);

		// Run agentic loop
		const context: ToolContext = {
			vaultPath,
			vectorService: this.vectorService,
			lexicalService: this.lexicalService,
		};

		const messages: Message[] = [{ role: 'user', content: userMessage }];
		let totalInputTokens = 0;
		let totalOutputTokens = 0;

		for (let i = 0; i < MAX_ITERATIONS; i++) {
			const response = await this.llm.chat(messages, {
				system: SYSTEM_PROMPT,
				tools: LIBRARIAN_TOOLS,
				maxTokens: 4096,
			});

			totalInputTokens += response.usage.inputTokens;
			totalOutputTokens += response.usage.outputTokens;

			// Check if we got a final answer (no tool use)
			if (response.stopReason === 'end_turn') {
				const plan = this.extractPlan(response.content, dailyNotes);
				if (plan) {
					plan.usage = {
						inputTokens: totalInputTokens,
						outputTokens: totalOutputTokens,
					};
					return { plan };
				}
				// No valid plan found, continue or error
				return { plan: null, error: 'Agent did not produce a valid change plan' };
			}

			// Handle tool use
			if (response.stopReason === 'tool_use') {
				// Add assistant message
				messages.push({ role: 'assistant', content: response.content });

				// Execute tools and collect results
				const toolResults: ContentBlock[] = [];
				for (const block of response.content) {
					if (block.type === 'tool_use') {
						const toolUse = block as ToolUseContent;
						const result = await executeTool(toolUse.name, toolUse.input, context);
						toolResults.push(createToolResult(toolUse.id, result));
					}
				}

				// Add tool results as user message
				messages.push({ role: 'user', content: toolResults });
			}
		}

		return { plan: null, error: 'Agent reached maximum iterations without producing a plan' };
	}

	/**
	 * Get list of daily notes to process.
	 */
	private async getDailyNotes(
		vaultPath: string,
		dailyFolder: string,
		limit: number
	): Promise<string[]> {
		const absoluteFolder = path.join(vaultPath, dailyFolder);

		try {
			const entries = await fs.readdir(absoluteFolder, { withFileTypes: true });
			const notes: string[] = [];

			// Match YYYY-MM-DD.md pattern
			const pattern = /^\d{4}-\d{2}-\d{2}\.md$/;

			for (const entry of entries) {
				if (entry.isFile() && pattern.test(entry.name)) {
					notes.push(`${dailyFolder}/${entry.name}`);
				}
			}

			// Sort descending (newest first) and take limit
			return notes.sort().reverse().slice(0, limit);
		} catch (error) {
			console.error(`Failed to read daily notes folder: ${error}`);
			return [];
		}
	}

	/**
	 * Read content of multiple notes.
	 */
	private async readNotes(
		vaultPath: string,
		notePaths: string[]
	): Promise<Map<string, string>> {
		const contents = new Map<string, string>();

		for (const notePath of notePaths) {
			const absolutePath = path.join(vaultPath, notePath);
			try {
				const content = await fs.readFile(absolutePath, 'utf-8');
				contents.set(notePath, content);
			} catch (error) {
				console.error(`Failed to read ${notePath}: ${error}`);
			}
		}

		return contents;
	}

	/**
	 * Build the initial message with daily note contents.
	 */
	private buildInitialMessage(noteContents: Map<string, string>): string {
		const parts: string[] = [
			'Please organize the following daily notes into the knowledge base.',
			'',
			'Daily notes to process:',
		];

		for (const [notePath, content] of noteContents) {
			parts.push('');
			parts.push(`=== ${notePath} ===`);
			parts.push(content);
		}

		parts.push('');
		parts.push(
			'Start by exploring the vault structure to understand how it is organized, ' +
			'then search for existing related content, and finally create your change plan.'
		);

		return parts.join('\n');
	}

	/**
	 * Extract a change plan from the model's response.
	 */
	private extractPlan(content: ContentBlock[], processedPaths: string[]): ChangePlan | null {
		// Find text content that contains JSON
		for (const block of content) {
			if (block.type !== 'text') continue;

			const text = block.text;

			// Try to extract JSON from the response
			const jsonMatch = text.match(/\{[\s\S]*"actions"[\s\S]*\}/);
			if (!jsonMatch) continue;

			try {
				const parsed = JSON.parse(jsonMatch[0]);

				// Validate and normalize the plan
				const plan: ChangePlan = {
					processedNotes: parsed.processedNotes || processedPaths.map((p) => ({ path: p, summary: '' })),
					actions: this.normalizeActions(parsed.actions || []),
					summary: parsed.summary || 'Change plan generated',
					usage: { inputTokens: 0, outputTokens: 0 },
				};

				return plan;
			} catch (error) {
				console.error('Failed to parse change plan JSON:', error);
			}
		}

		return null;
	}

	/**
	 * Normalize and validate actions from the plan.
	 */
	private normalizeActions(actions: unknown[]): ChangeAction[] {
		const normalized: ChangeAction[] = [];

		for (const action of actions) {
			if (!action || typeof action !== 'object') continue;

			const a = action as Record<string, unknown>;

			switch (a.type) {
				case 'create':
					if (typeof a.path === 'string' && typeof a.content === 'string') {
						normalized.push({
							type: 'create',
							path: a.path,
							content: a.content,
							reason: (a.reason as string) || '',
						});
					}
					break;

				case 'update':
					if (typeof a.path === 'string' && typeof a.content === 'string') {
						normalized.push({
							type: 'update',
							path: a.path,
							content: a.content,
							position: (['append', 'prepend', 'section'].includes(a.position as string)
								? a.position
								: 'append') as 'append' | 'prepend' | 'section',
							section: a.section as string | undefined,
							reason: (a.reason as string) || '',
						});
					}
					break;

				case 'move':
					if (typeof a.fromPath === 'string' && typeof a.toPath === 'string') {
						normalized.push({
							type: 'move',
							fromPath: a.fromPath,
							toPath: a.toPath,
							reason: (a.reason as string) || '',
						});
					}
					break;
			}
		}

		return normalized;
	}
}
