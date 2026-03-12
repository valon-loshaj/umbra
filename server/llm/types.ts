/**
 * LLM abstraction layer types.
 * Provider-agnostic interfaces for chat completions with tool use.
 */

/** Role of a message in the conversation */
export type MessageRole = 'user' | 'assistant';

/** Text content block */
export interface TextContent {
	type: 'text';
	text: string;
}

/** Tool use request from the model */
export interface ToolUseContent {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** Tool result provided by the caller */
export interface ToolResultContent {
	type: 'tool_result';
	tool_use_id: string;
	content: string;
	is_error?: boolean;
}

/** Content can be text, tool use, or tool result */
export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

/** A message in the conversation */
export interface Message {
	role: MessageRole;
	content: string | ContentBlock[];
}

/** Tool parameter schema (JSON Schema subset) */
export interface ToolParameter {
	type: string;
	description?: string;
	enum?: string[];
	items?: ToolParameter;
	properties?: Record<string, ToolParameter>;
	required?: string[];
}

/** Tool definition for the model */
export interface Tool {
	name: string;
	description: string;
	input_schema: {
		type: 'object';
		properties: Record<string, ToolParameter>;
		required?: string[];
	};
}

/** Reason the model stopped generating */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

/** Response from chat completion */
export interface ChatResponse {
	content: ContentBlock[];
	stopReason: StopReason;
	usage: {
		inputTokens: number;
		outputTokens: number;
	};
}

/** Options for chat completion */
export interface ChatOptions {
	model?: string;
	maxTokens?: number;
	temperature?: number;
	system?: string;
	tools?: Tool[];
}
