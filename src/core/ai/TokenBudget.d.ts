export interface TokenSettings { provider: string; model: string; maxTokens?: number; maxTokensMode?: 'custom' | 'context'; contextWindow?: number; maxOutputTokens?: number }
export interface TokenLimits { context: number; output: number }
export function modelTokenLimits(settings: TokenSettings, catalogModel?: { limitContext?: number; limitOutput?: number } | null): TokenLimits;
export function resolveTokenBudget(settings: TokenSettings, limits: TokenLimits, messages?: Array<{ content?: unknown; tool_calls?: unknown; name?: string; role?: string }>, tools?: unknown[]): number | undefined;
export function estimateInputTokens(messages: Array<{ content?: unknown; tool_calls?: unknown; name?: string; role?: string }>, tools?: unknown[]): number;
