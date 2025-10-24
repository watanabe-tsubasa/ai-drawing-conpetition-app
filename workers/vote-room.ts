export class VoteRoomDO {
	private sessions: WebSocket[] = [];

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const _url = new URL(request.url);

		// WebSocket接続の処理
		if (request.headers.get("Upgrade") === "websocket") {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);

			server.accept();
			this.sessions.push(server);

			// 切断時の処理
			server.addEventListener("close", () => {
				this.sessions = this.sessions.filter((s) => s !== server);
			});

			server.addEventListener("error", () => {
				this.sessions = this.sessions.filter((s) => s !== server);
			});

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}

		// ブロードキャストメッセージの受信（Worker側から呼ばれる）
		if (request.method === "POST") {
			const data = await request.json();
			this.broadcast(data);
			return new Response(JSON.stringify({ success: true }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response("Expected WebSocket or POST request", { status: 400 });
	}

	// biome-ignore lint/suspicious/noExplicitAny: message can be any JSON-serializable data
	broadcast(message: any): void {
		const payload = JSON.stringify(message);
		this.sessions.forEach((ws) => {
			try {
				ws.send(payload);
			} catch (_err) {
				// 送信失敗時はセッションから削除
				this.sessions = this.sessions.filter((s) => s !== ws);
			}
		});
	}
}
