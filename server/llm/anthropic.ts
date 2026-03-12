/**
 * Anthropic Claude provider implementation.
 */

import { LLMProvider } from './provider';
import {
	Message,
	ChatResponse,
	ChatOptions,
	ContentBlock,
	StopReason,
	TextContent,
	ToolUseContent,
} from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Anthropic API message format */
interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicContentBlock[];
}

/** Anthropic content block types */
type AnthropicContentBlock =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** Anthropic API response */
interface AnthropicResponse {
	content: AnthropicContentBlock[];
	stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
	usage: {
		input_tokens: number;
		output_tokens: number;
	};
}

/** Anthropic API error response */
interface AnthropicError {
	type: 'error';
	error: {
		type: string;
		message: string;
	};
}

export class AnthropicProvider implements LLMProvider {
	readonly name = 'anthropic';
	private apiKey: string;
	private defaultModel: string;

	constructor(apiKey: string, model?: string) {
		this.apiKey = apiKey;
		this.defaultModel = model || DEFAULT_MODEL;
	}

	async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
		const model = options?.model || this.defaultModel;
		const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;

		const body: Record<string, unknown> = {
			model,
			max_tokens: maxTokens,
			messages: this.convertMessages(messages),
		};

		if (options?.system) {
			body.system = options.system;
		}

		if (options?.temperature !== undefined) {
			body.temperature = options.temperature;
		}

		if (options?.tools && options.tools.length > 0) {
			body.tools = options.tools;
		}

		const response = await fetch(API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.apiKey,
				'anthropic-version': API_VERSION,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const error = (await response.json()) as AnthropicError;
			throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
		}

		const data = (await response.json()) as AnthropicResponse;
		return this.convertResponse(data);
	}

	private convertMessages(messages: Message[]): AnthropicMessage[] {
		return messages.map((msg) => ({
			role: msg.role,
			content: typeof msg.content === 'string' ? msg.content : msg.content as AnthropicContentBlock[],
		}));
	}

	private convertResponse(response: AnthropicResponse): ChatResponse {
		const content: ContentBlock[] = response.content.map((block) => {
			if (block.type === 'text') {
				return { type: 'text', text: block.text } as TextContent;
			} else if (block.type === 'tool_use') {
				return {
					type: 'tool_use',
					id: block.id,
					name: block.name,
					input: block.input,
				} as ToolUseContent;
			}
			// Shouldn't happen in responses, but handle gracefully
			return { type: 'text', text: '' } as TextContent;
		});

		const stopReasonMap: Record<string, StopReason> = {
			end_turn: 'end_turn',
			tool_use: 'tool_use',
			max_tokens: 'max_tokens',
			stop_sequence: 'stop_sequence',
		};

		return {
			content,
			stopReason: stopReasonMap[response.stop_reason] || 'end_turn',
			usage: {
				inputTokens: response.usage.input_tokens,
				outputTokens: response.usage.output_tokens,
			},
		};
	}
}
