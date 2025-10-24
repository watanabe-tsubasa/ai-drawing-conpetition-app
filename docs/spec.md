# spec.md

> 🎨 **AIお絵描き選手権（投票アプリ）**
> フロント：React Router（Remix framework mode）
> バック：Cloudflare Workers（Edge）
> DB：Cloudflare D1（SQL）
> ORM：Drizzle
> Realtime：Durable Object（DO）を自前で実装

この構成は「完全サーバレス + エッジネイティブ」で、
Supabaseのような外部依存を避けつつCloudflare内で**リアルタイム投票反映**を実現できます。

---

## 🏗 全体アーキテクチャ概要

```
project/
├─ public/
│  └─ sketches/
│     ├─ codex.js
│     ├─ claude.js
│     ├─ gemini.js
├─ app/
│  ├─ routes/
│  │  └─ _index.tsx         ← 投票画面＋結果BarChart
│  ├─ components/
│  │  ├─ P5Canvas.tsx
│  │  ├─ ResultChart.tsx
│  ├─ lib/
│  │  ├─ db.ts              ← Drizzle (D1)
│  │  ├─ schema.ts          ← Drizzle schema
│  │  ├─ broadcast.ts       ← DO（Realtime用）
│  ├─ root.tsx
│  ├─ entry.client.tsx
│  ├─ entry.server.tsx
├─ functions/
│  ├─ [worker].ts           ← Cloudflare Worker entry (Hono or RemixAdapter)
├─ drizzle.config.ts
├─ wrangler.toml
├─ package.json
```

---

## ⚙️ 構成技術の役割

| コンポーネント                       | 役割                                           |
| ----------------------------- | -------------------------------------------- |
| **React Router (Remix mode)** | loader/actionでfetch実装、client-sideでRealtime受信 |
| **Drizzle ORM**               | D1の型安全な操作（migrations含む）                      |
| **D1**                        | 投票データ永続化                                     |
| **Durable Object (DO)**       | WebSocketブロードキャストでリアルタイム通知                   |
| **Cloudflare Worker**         | Remixハンドラ＋DOルーティングの統合                        |

---

## 🧩 1. D1 + Drizzle セットアップ

`drizzle.config.ts`：

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./app/lib/schema.ts",
  out: "./drizzle",
  driver: "d1",
  dbCredentials: {
    wranglerConfigPath: "./wrangler.toml",
    dbName: "AI_DRAW_VOTES",
  },
} satisfies Config;
```

`app/lib/schema.ts`：

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const votes = sqliteTable("votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ai_name: text("ai_name").notNull(),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
});
```

`wrangler.toml`：

```toml
name = "ai-draw-worker"
main = "functions/worker.ts"
compatibility_date = "2025-10-24"

[[d1_databases]]
binding = "DB"
database_name = "AI_DRAW_VOTES"
database_id = "xxxx-xxxx"
```

---

## 🧠 2. Drizzle ORM クライアント（Workers対応）

`app/lib/db.ts`：

```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDB(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Env = {
  DB: D1Database;
};
```

---

## ⚡️ 3. Durable Object（Realtime Broadcast）

`app/lib/broadcast.ts`：

```ts
export class VoteRoomDO {
  private sessions: WebSocket[] = [];

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request) {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sessions.push(server);

    server.addEventListener("close", () => {
      this.sessions = this.sessions.filter((s) => s !== server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message: any) {
    const payload = JSON.stringify(message);
    this.sessions.forEach((ws) => ws.send(payload));
  }
}
```

`wrangler.toml` に追加：

```toml
[[durable_objects.bindings]]
name = "VOTE_ROOM"
class_name = "VoteRoomDO"
```

---

## 🔄 4. 投票API（loader / action対応）

`functions/worker.ts`（HonoまたはRemix Adapter構成）：

```ts
import { createRequestHandler } from "@react-router/adapter";
import { getDB } from "~/lib/db";
import { votes } from "~/lib/schema";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const db = getDB(env);

    // 投票登録
    if (req.method === "POST" && new URL(req.url).pathname === "/api/vote") {
      const { ai_name } = await req.json();
      await db.insert(votes).values({ ai_name }).run();

      // DOでリアルタイム通知
      const roomId = env.VOTE_ROOM.idFromName("main");
      const room = env.VOTE_ROOM.get(roomId);
      ctx.waitUntil(room.fetch("https://dummy", {
        method: "POST",
        body: JSON.stringify({ ai_name }),
      }));

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 集計取得
    if (req.method === "GET" && new URL(req.url).pathname === "/api/votes") {
      const data = await db.select().from(votes).all();
      const counts = { Codex: 0, Claude: 0, Gemini: 0 };
      data.forEach((r) => (counts[r.ai_name]++));
      return new Response(JSON.stringify(counts), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Remix / React Routerのハンドラ
    return createRequestHandler({
      build: require("../build"),
      mode: "production",
    })(req, env, ctx);
  },
};
```

---

## 🔌 5. フロントエンド：loader/action/realtime連携

```tsx
// app/routes/_index.tsx
import { useEffect, useState } from "react";
import { P5Canvas } from "~/components/P5Canvas";
import { ResultChart } from "~/components/ResultChart";
import { json, useFetcher, useLoaderData } from "react-router";

export const loader = async () => {
  const res = await fetch("https://yourworker.ai/api/votes");
  return json(await res.json());
};

export default function Index() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [votes, setVotes] = useState(initial);
  const [voted, setVoted] = useState(localStorage.getItem("voted_ai"));
  const [showChart, setShowChart] = useState(false);

  // WebSocket接続
  useEffect(() => {
    const ws = new WebSocket("wss://yourworker.ai/vote-room");
    ws.onmessage = (event) => {
      const { ai_name } = JSON.parse(event.data);
      setVotes((prev) => ({
        ...prev,
        [ai_name]: prev[ai_name] + 1,
      }));
    };
    return () => ws.close();
  }, []);

  const sketches = [
    { name: "Codex", path: "/sketches/codex.js" },
    { name: "Claude", path: "/sketches/claude.js" },
    { name: "Gemini", path: "/sketches/gemini.js" },
  ];

  const handleVote = async (ai: string) => {
    if (voted) return alert(`すでに ${voted} に投票済みです！`);
    await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_name: ai }),
    });
    localStorage.setItem("voted_ai", ai);
    setVoted(ai);
    setShowChart(true);
  };

  return (
    <div className="flex flex-col items-center">
      <h1>AIお絵描き選手権</h1>
      <div className="flex gap-6">
        {sketches.map((s) => (
          <div key={s.name} className="flex flex-col items-center">
            <P5Canvas sketchPath={s.path} />
            {!voted && (
              <button onClick={() => handleVote(s.name)}>投票する</button>
            )}
          </div>
        ))}
      </div>
      {showChart && <ResultChart votes={votes} />}
    </div>
  );
}
```

---

## 📡 Realtimeフロー（DOでのWebSocket配信）

```
[Client]──POST /api/vote──▶[Worker]
          │                     │
          │                     ├──D1.insert()
          │                     └──DO.fetch({ ai_name })
          ▼
[Durable Object]──broadcast──▶全クライアントWS
```

---

## ✅ この構成の利点

| 項目         | 内容                        |
| ---------- | ------------------------- |
| 💡 完全サーバレス | Cloudflare上で完結            |
| ⚡ 高速       | D1 + DOで超低レイテンシ           |
| 🔄 リアルタイム  | WebSocketで全クライアントへ即時配信    |
| 🧱 型安全     | Drizzle ORMによるDB操作        |
| 🪣 永続性     | D1が投票履歴を保存                |
| 🔐 投票制御    | localStorageで簡易的に制御（匿名OK） |

---
