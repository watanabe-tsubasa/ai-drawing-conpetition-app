import { lazy, Suspense, useEffect, useState } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import type { VoteCounts, VoteMessage } from "~/lib/types";
import type { Route } from "./+types/_index";

const P5Canvas = lazy(() => import("~/components/P5Canvas"));

export function meta() {
	return [
		{ title: "AIお絵描き選手権" },
		{
			name: "description",
			content: "AI Drawing Competition - Vote for your favorite!",
		},
	];
}

// loaderで初期投票データを取得
export async function loader({ request }: Route.LoaderArgs) {
	try {
		const url = new URL(request.url);
		const apiUrl = `${url.origin}/api/votes`;
		const response = await fetch(apiUrl);
		if (!response.ok) {
			throw new Error("Failed to fetch votes");
		}
		const votes = await response.json();
		return { votes };
	} catch (error) {
		console.error("Error fetching votes:", error);
		return { votes: { Codex: 0, Claude: 0, Gemini: 0 } };
	}
}

export default function Index({ loaderData }: Route.ComponentProps) {
	const aiArtists = [
		{ name: "Codex" as const, color: "bg-blue-500", sketchName: "codexSketch" },
		{
			name: "Claude" as const,
			color: "bg-orange-500",
			sketchName: "claudeSketch",
		},
		{
			name: "Gemini" as const,
			color: "bg-purple-500",
			sketchName: "geminiSketch",
		},
	];

	const [votes, setVotes] = useState<VoteCounts>(
		loaderData?.votes || { Codex: 0, Claude: 0, Gemini: 0 },
	);
	const [votedAi, setVotedAi] = useState<string | null>(null);
	const [showResults, setShowResults] = useState(false);
	const [isVoting, setIsVoting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [wsConnected, setWsConnected] = useState(false);

	// localStorageから投票済み状態を確認
	useEffect(() => {
		const voted = localStorage.getItem("voted_ai");
		if (voted) {
			setVotedAi(voted);
			setShowResults(true);
		}
	}, []);

	// WebSocket接続でリアルタイム投票通知を受信
	useEffect(() => {
		// クライアント側でのみ実行
		if (typeof window === "undefined") return;

		// WebSocketのURLを構築（本番: wss://, 開発: ws://）
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/vote-room`;

		let ws: WebSocket | null = null;
		let reconnectTimeout: number | null = null;

		const connect = () => {
			try {
				ws = new WebSocket(wsUrl);

				ws.onopen = () => {
					console.log("WebSocket connected");
					setWsConnected(true);
				};

				ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data) as VoteMessage;
						console.log("Vote notification received:", data);

						// 受信したai_nameの投票数をインクリメント
						if (
							data.ai_name &&
							["Codex", "Claude", "Gemini"].includes(data.ai_name)
						) {
							setVotes((prev) => ({
								...prev,
								[data.ai_name]: prev[data.ai_name] + 1,
							}));
						}
					} catch (err) {
						console.error("Error parsing WebSocket message:", err);
					}
				};

				ws.onerror = (error) => {
					console.error("WebSocket error:", error);
					setWsConnected(false);
				};

				ws.onclose = () => {
					console.log("WebSocket disconnected");
					setWsConnected(false);

					// 5秒後に再接続を試みる
					reconnectTimeout = setTimeout(() => {
						console.log("Attempting to reconnect WebSocket...");
						connect();
					}, 5000);
				};
			} catch (err) {
				console.error("Error creating WebSocket:", err);
				setWsConnected(false);
			}
		};

		connect();

		// クリーンアップ: WebSocket接続を閉じる
		return () => {
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
			}
			if (ws) {
				ws.close();
			}
		};
	}, []);

	// 投票ハンドラ
	const handleVote = async (aiName: string) => {
		// 二重投票防止
		if (votedAi) {
			setError(`すでに ${votedAi} に投票済みです！`);
			return;
		}

		setIsVoting(true);
		setError(null);

		try {
			const response = await fetch("/api/vote", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ai_name: aiName }),
			});

			if (!response.ok) {
				const errorData = (await response.json()) as { error?: string };
				throw new Error(errorData.error || "投票に失敗しました");
			}

			// localStorageに保存
			localStorage.setItem("voted_ai", aiName);
			setVotedAi(aiName);
			setShowResults(true);

			// 楽観的UI更新
			setVotes((prev) => ({
				...prev,
				[aiName]: prev[aiName as keyof VoteCounts] + 1,
			}));
		} catch (err) {
			console.error("Error voting:", err);
			setError(
				err instanceof Error ? err.message : "ネットワークエラーが発生しました",
			);
		} finally {
			setIsVoting(false);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
			<div className="container mx-auto px-4 py-8">
				{/* ヘッダー */}
				<header className="text-center mb-12">
					<h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
						AIお絵描き選手権
					</h1>
					<p className="text-gray-400 text-lg">
						あなたのお気に入りのAI作品に投票しよう！
					</p>

					{/* WebSocket接続インジケーター */}
					<div className="mt-4 flex items-center justify-center gap-2 text-sm">
						<div
							className={`w-2 h-2 rounded-full ${
								wsConnected ? "bg-green-500" : "bg-gray-500"
							} ${wsConnected ? "animate-pulse" : ""}`}
						></div>
						<span className="text-gray-500">
							{wsConnected ? "リアルタイム接続中" : "接続待機中"}
						</span>
					</div>

					{/* エラーメッセージ表示 */}
					{error && (
						<div className="mt-4 bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg max-w-md mx-auto">
							{error}
						</div>
					)}

					{/* 投票済みメッセージ */}
					{votedAi && (
						<div className="mt-4 bg-green-500/20 border border-green-500 text-green-200 px-4 py-3 rounded-lg max-w-md mx-auto">
							{votedAi} に投票済みです！
						</div>
					)}
				</header>

				{/* テーマ画像表示エリア */}
				<section className="mb-12">
					<div className="bg-gray-800 rounded-lg p-6 shadow-xl">
						<h2 className="text-2xl font-bold mb-4 text-center">お題</h2>
						<div className="flex justify-center">
							<img
								src="/theme.png"
								alt="テーマ画像"
								className="max-w-full h-auto rounded-lg shadow-lg"
							/>
						</div>
					</div>
				</section>

				{/* AI作品表示エリア */}
				<section className="mb-12">
					<h2 className="text-2xl font-bold mb-6 text-center">AI作品</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{aiArtists.map((artist) => (
							<div
								key={artist.name}
								className="bg-gray-800 rounded-lg p-6 shadow-xl hover:shadow-2xl transition-shadow"
							>
								{/* AI名 */}
								<div className="flex items-center justify-between mb-4">
									<h3 className="text-xl font-bold">{artist.name}</h3>
									<div className={`w-3 h-3 rounded-full ${artist.color}`}></div>
								</div>

								{/* 作品表示エリア */}
								<div className="bg-gray-700 rounded-lg mb-4 h-64 flex items-center justify-center">
									<ClientOnly>
										<Suspense fallback={<div>loading</div>}>
											<P5Canvas sketchName={artist.sketchName} />
										</Suspense>
									</ClientOnly>
								</div>

								{/* 投票ボタン */}
								<button type="button"
									onClick={() => handleVote(artist.name)}
									disabled={!!votedAi || isVoting}
									className={`w-full ${artist.color} text-white font-bold py-3 px-6 rounded-lg transition-all transform ${
										votedAi || isVoting
											? "opacity-50 cursor-not-allowed"
											: "hover:opacity-80 hover:scale-105"
									} ${votedAi === artist.name ? "ring-4 ring-white" : ""}`}
								>
									{isVoting
										? "投票中..."
										: votedAi === artist.name
											? "✓ 投票済み"
											: `${artist.name}に投票`}
								</button>
							</div>
						))}
					</div>
				</section>

				{/* 結果表示エリア（投票後のみ表示） */}
				{showResults && (
					<section>
						<div className="bg-gray-800 rounded-lg p-6 shadow-xl">
							<h2 className="text-2xl font-bold mb-6 text-center">投票結果</h2>
							<div className="space-y-4">
								{aiArtists.map((artist) => {
									const voteCount = votes[artist.name];
									const totalVotes = votes.Codex + votes.Claude + votes.Gemini;
									const percentage =
										totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;

									return (
										<div key={artist.name}>
											<div className="flex justify-between mb-2">
												<span className="font-bold">{artist.name}</span>
												<span className="text-gray-400">
													{voteCount}票 ({percentage.toFixed(1)}%)
												</span>
											</div>
											<div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
												<div
													className={`${artist.color} h-full transition-all duration-500 ease-out`}
													style={{ width: `${percentage}%` }}
												></div>
											</div>
										</div>
									);
								})}
								<div className="pt-4 text-center text-gray-400">
									<p>総投票数: {votes.Codex + votes.Claude + votes.Gemini}票</p>
								</div>
							</div>
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
