import { createRequestHandler } from "react-router";
import { getDB } from "../app/lib/db";
import { votes } from "../app/lib/schema";
import type { AIName, VoteCounts, VoteMessage } from "../app/lib/types";
import { VoteRoomDO } from "./vote-room";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// POST /api/vote - 投票登録
		if (url.pathname === "/api/vote" && request.method === "POST") {
			try {
				const { ai_name } = (await request.json()) as VoteMessage;

				// バリデーション
				const validAINames: AIName[] = ["Codex", "Claude", "Gemini"];
				if (!ai_name || !validAINames.includes(ai_name)) {
					return new Response(
						JSON.stringify({
							error: "Invalid ai_name. Must be Codex, Claude, or Gemini.",
						}),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}

				// D1に投票を保存
				const db = getDB(env.DB);
				await db.insert(votes).values({ ai_name });

				// Durable Objectへブロードキャスト
				const roomId = env.VOTE_ROOM.idFromName("main");
				const room = env.VOTE_ROOM.get(roomId);
				const message: VoteMessage = { ai_name };
				ctx.waitUntil(
					room.fetch("https://dummy/broadcast", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(message),
					}),
				);

				return new Response(JSON.stringify({ success: true }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				console.error("Error in /api/vote:", error);
				return new Response(
					JSON.stringify({ error: "Internal server error" }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}
		}

		// GET /api/votes - 投票集計取得
		if (url.pathname === "/api/votes" && request.method === "GET") {
			try {
				const db = getDB(env.DB);

				// 全投票データを取得してai_name別に集計
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

				return new Response(JSON.stringify(counts), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				console.error("Error in /api/votes:", error);
				return new Response(
					JSON.stringify({ error: "Internal server error" }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
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

		// その他のリクエストはReact Routerへ
		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<Env>;

// Durable Objectのエクスポート
export { VoteRoomDO };
