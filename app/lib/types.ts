// 共通の型定義

/**
 * AI名の型
 */
export type AIName = "Codex" | "Claude" | "Gemini";

/**
 * 投票数のカウント
 */
export type VoteCounts = {
	Codex: number;
	Claude: number;
	Gemini: number;
};

/**
 * 投票データ（データベーススキーマに対応）
 */
export type Vote = {
	id: number;
	ai_name: string;
	created_at: string | null;
};

/**
 * WebSocketメッセージの型
 */
export type VoteMessage = {
	ai_name: AIName;
};

/**
 * API レスポンスの型
 */
export type VoteResponse = {
	success: boolean;
	error?: string;
};
