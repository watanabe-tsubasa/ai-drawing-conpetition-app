import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AIName } from "../app/lib/types";

// モックD1データベースの作成
class MockD1Database {
	private data: Map<
		number,
		{ id: number; ai_name: string; created_at: string }
	> = new Map();
	private nextId = 1;

	prepare(query: string) {
		const self = this;
		return {
			bind(...params: unknown[]) {
				return {
					async run() {
						if (query.includes("INSERT")) {
							const aiName = params[0] as string;
							const vote = {
								id: self.nextId++,
								ai_name: aiName,
								created_at: new Date().toISOString(),
							};
							self.data.set(vote.id, vote);
							return { success: true };
						}
						return { success: true };
					},
					async all() {
						if (query.includes("SELECT")) {
							return { results: Array.from(self.data.values()) };
						}
						return { results: [] };
					},
				};
			},
			async all() {
				if (query.includes("SELECT")) {
					return { results: Array.from(self.data.values()) };
				}
				return { results: [] };
			},
		};
	}

	// テスト用のリセットメソッド
	reset() {
		this.data.clear();
		this.nextId = 1;
	}
}

describe("Vote API Tests", () => {
	let mockDB: MockD1Database;

	beforeAll(() => {
		mockDB = new MockD1Database();
	});

	afterAll(() => {
		mockDB.reset();
	});

	test("投票データの挿入", async () => {
		const aiNames: AIName[] = ["Codex", "Claude", "Gemini"];

		for (const aiName of aiNames) {
			const result = await mockDB
				.prepare("INSERT INTO votes (ai_name) VALUES (?)")
				.bind(aiName)
				.run();
			expect(result.success).toBe(true);
		}
	});

	test("投票データの取得", async () => {
		// データを挿入
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Codex")
			.run();
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Claude")
			.run();
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Gemini")
			.run();

		// データを取得
		const result = await mockDB.prepare("SELECT * FROM votes").all();
		expect(result.results.length).toBeGreaterThan(0);
	});

	test("投票データの集計", async () => {
		mockDB.reset();

		// 複数の投票を挿入
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Codex")
			.run();
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Codex")
			.run();
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Claude")
			.run();
		await mockDB
			.prepare("INSERT INTO votes (ai_name) VALUES (?)")
			.bind("Gemini")
			.run();

		// データを取得して集計
		const result = await mockDB.prepare("SELECT * FROM votes").all();
		const allVotes = result.results;

		const counts = {
			Codex: 0,
			Claude: 0,
			Gemini: 0,
		};

		for (const vote of allVotes) {
			if (vote.ai_name in counts) {
				counts[vote.ai_name as AIName]++;
			}
		}

		expect(counts.Codex).toBe(2);
		expect(counts.Claude).toBe(1);
		expect(counts.Gemini).toBe(1);
	});

	test("無効なAI名の拒否", () => {
		const validNames: AIName[] = ["Codex", "Claude", "Gemini"];
		const invalidName = "InvalidAI";

		expect(validNames.includes(invalidName as AIName)).toBe(false);
	});

	test("AI名のバリデーション", () => {
		const testCases = [
			{ name: "Codex", valid: true },
			{ name: "Claude", valid: true },
			{ name: "Gemini", valid: true },
			{ name: "GPT", valid: false },
			{ name: "", valid: false },
			{ name: "codex", valid: false }, // 大文字小文字の区別
		];

		const validNames: AIName[] = ["Codex", "Claude", "Gemini"];

		for (const testCase of testCases) {
			const isValid = validNames.includes(testCase.name as AIName);
			expect(isValid).toBe(testCase.valid);
		}
	});
});

describe("Vote Counts Logic", () => {
	test("投票数の集計ロジック", () => {
		const mockVotes = [
			{ id: 1, ai_name: "Codex", created_at: "2024-01-01" },
			{ id: 2, ai_name: "Codex", created_at: "2024-01-01" },
			{ id: 3, ai_name: "Claude", created_at: "2024-01-01" },
			{ id: 4, ai_name: "Gemini", created_at: "2024-01-01" },
			{ id: 5, ai_name: "Gemini", created_at: "2024-01-01" },
			{ id: 6, ai_name: "Gemini", created_at: "2024-01-01" },
		];

		const counts = {
			Codex: 0,
			Claude: 0,
			Gemini: 0,
		};

		for (const vote of mockVotes) {
			if (vote.ai_name in counts) {
				counts[vote.ai_name as AIName]++;
			}
		}

		expect(counts.Codex).toBe(2);
		expect(counts.Claude).toBe(1);
		expect(counts.Gemini).toBe(3);

		const totalVotes = counts.Codex + counts.Claude + counts.Gemini;
		expect(totalVotes).toBe(6);
	});

	test("空のデータベースでの集計", () => {
		const mockVotes: unknown[] = [];

		const counts = {
			Codex: 0,
			Claude: 0,
			Gemini: 0,
		};

		for (const vote of mockVotes) {
			const v = vote as { ai_name: string };
			if (v.ai_name in counts) {
				counts[v.ai_name as AIName]++;
			}
		}

		expect(counts.Codex).toBe(0);
		expect(counts.Claude).toBe(0);
		expect(counts.Gemini).toBe(0);
	});
});
