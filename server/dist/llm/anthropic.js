"use strict";
/**
 * Anthropic Claude provider implementation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
class AnthropicProvider {
    name = 'anthropic';
    apiKey;
    defaultModel;
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.defaultModel = model || DEFAULT_MODEL;
    }
    async chat(messages, options) {
        const model = options?.model || this.defaultModel;
        const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
        const body = {
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
            const error = (await response.json());
            throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
        }
        const data = (await response.json());
        return this.convertResponse(data);
    }
    convertMessages(messages) {
        return messages.map((msg) => ({
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : msg.content,
        }));
    }
    convertResponse(response) {
        const content = response.content.map((block) => {
            if (block.type === 'text') {
                return { type: 'text', text: block.text };
            }
            else if (block.type === 'tool_use') {
                return {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input,
                };
            }
            // Shouldn't happen in responses, but handle gracefully
            return { type: 'text', text: '' };
        });
        const stopReasonMap = {
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
exports.AnthropicProvider = AnthropicProvider;
