import { createRequestHandler } from "react-router";
import { getDB } from "../app/lib/db";
import { votes } from "../app/lib/schema";
import type { AIName, VoteCounts, VoteMessage } from "../app/lib/types";
import { VoteRoomDO } from "./vote-room";

// API 関数の型定義
export interface ApiContext {
	getVotes: () => Promise<VoteCounts>;
	postVote: (aiName: AIName) => Promise<{ success: boolean }>;
}

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
		api: ApiContext;
	}
}

// 投票集計取得 API ロジック
async function getVotes(env: Env): Promise<VoteCounts> {
	const db = getDB(env.DB);
	const allVotes = await db.select().from(votes);

	const counts: VoteCounts = {
		Codex: 0,
		Claude: 0,
		Gemini: 0,
	};

	allVotes.forEach((vote) => {
		if (vote.ai_name in counts) {
			counts[vote.ai_name as AIName]++;
		}
	});

	return counts;
}

// 投票登録 API ロジック
async function postVote(
	env: Env,
	ctx: ExecutionContext,
	aiName: AIName,
): Promise<{ success: boolean }> {
	// バリデーション
	const validAINames: AIName[] = ["Codex", "Claude", "Gemini"];
	if (!aiName || !validAINames.includes(aiName)) {
		throw new Error("Invalid ai_name. Must be Codex, Claude, or Gemini.");
	}

	// D1に投票を保存
	const db = getDB(env.DB);
	await db.insert(votes).values({ ai_name: aiName });

	// Durable Objectへブロードキャスト
	const roomId = env.VOTE_ROOM.idFromName("main");
	const room = env.VOTE_ROOM.get(roomId);
	const message: VoteMessage = { ai_name: aiName };
	ctx.waitUntil(
		room.fetch("https://dummy/broadcast", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(message),
		}),
	);

	return { success: true };
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// POST /api/vote - 投票登録（フロントエンドからの直接呼び出し用）
		if (url.pathname === "/api/vote" && request.method === "POST") {
			try {
				const { ai_name } = (await request.json()) as VoteMessage;
				const result = await postVote(env, ctx, ai_name);
				return new Response(JSON.stringify(result), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				console.error("Error in /api/vote:", error);
				const errorMessage =
					error instanceof Error ? error.message : "Internal server error";
				return new Response(JSON.stringify({ error: errorMessage }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		// WebSocket /vote-room - リアルタイム投票通知
		if (url.pathname === "/vote-room") {
			// WebSocketアップグレードリクエストのチェック
			const upgradeHeader = request.headers.get("Upgrade");
			if (upgradeHeader !== "websocket") {
				return new Response("Expected WebSocket upgrade", { status: 426 });
			}

			// Durable Objectへプロキシ
			const roomId = env.VOTE_ROOM.idFromName("main");
			const room = env.VOTE_ROOM.get(roomId);

			return room.fetch(request);
		}

		// API コンテキストを作成（self fetch を回避）
		const api: ApiContext = {
			getVotes: () => getVotes(env),
			postVote: (aiName: AIName) => postVote(env, ctx, aiName),
		};

		// React Routerへ（api コンテキストを追加）
		return requestHandler(request, {
			cloudflare: { env, ctx },
			api,
		});
	},
} satisfies ExportedHandler<Env>;

// Durable Objectのエクスポート
export { VoteRoomDO };
