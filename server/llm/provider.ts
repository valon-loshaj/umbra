/**
 * LLM provider interface.
 * Abstracts the underlying LLM service for easy provider switching.
 */

import { Message, ChatResponse, ChatOptions } from './types';

/** Abstract LLM provider interface */
export interface LLMProvider {
	/** Provider name for logging/debugging */
	readonly name: string;

	/**
	 * Send a chat completion request.
	 * @param messages Conversation history
	 * @param options Model configuration and tools
	 * @returns Model response with content and metadata
	 */
	chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
}

/** Configuration for creating an LLM provider */
export interface LLMProviderConfig {
	provider: 'anthropic';
	apiKey: string;
	model?: string;
}

/** Factory function to create provider instances */
export type LLMProviderFactory = (config: LLMProviderConfig) => LLMProvider;
