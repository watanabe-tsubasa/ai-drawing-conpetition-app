# 📝 要件定義書

## プロジェクト名

**AIお絵描き選手権 投票Webアプリ**

---

## 1. 概要

本システムは、テーマ画像（お題）に対して複数のAI（Codex、Claude、Gemini）が生成した絵をWebGL（p5.jsなど）で表示し、ユーザーが最も良いと思う作品に投票できるWebアプリケーションである。

投票結果はリアルタイムに集計・可視化され、投票後にのみ表示される。
また、システムはCloudflare Workers上に構築し、サーバレス・エッジネイティブな構成を採用する。

---

## 2. 目的

* 各AIが生成した絵を公平に評価できる環境を提供する
* 投票結果をリアルタイムで反映し、インタラクティブな体験を実現する
* 外部BaaS（Supabase等）に依存せず、Cloudflare上で完結するアーキテクチャを実現する

---

## 3. システム構成概要

| 層        | 使用技術                                | 役割                              |
| -------- | ----------------------------------- | ------------------------------- |
| フロントエンド  | React Router (Remix framework mode) | UI、ルーティング、loader/actionによるデータ取得 |
| 描画       | p5.js (WebGL)                       | 各AIが描いた静的スケッチの表示                |
| バックエンド   | Cloudflare Workers                  | APIエンドポイント処理、DOとの連携             |
| データベース   | Cloudflare D1                       | 投票データの永続化                       |
| ORM      | Drizzle ORM                         | 型安全なDB操作とマイグレーション管理             |
| リアルタイム通信 | Cloudflare Durable Object (DO)      | WebSocketによるリアルタイム通知配信          |
| ストレージ    | localStorage                        | 投票済み状態の保持（簡易的認証代替）              |

---

## 4. 機能要件

### 4.1. 基本機能

| 機能名      | 概要                                                 |
| -------- | -------------------------------------------------- |
| テーマ画像表示  | `theme.png` を画面上部に表示                               |
| AI作品表示   | Codex / Claude / Gemini それぞれのp5.jsスケッチをCanvasとして表示 |
| 投票機能     | ユーザーが1作品に投票可能（action経由でDB登録）                       |
| 投票制御     | localStorageに投票先を記録し、再投票防止                         |
| 結果表示     | 投票後にBarChart（Recharts）を表示し、投票状況をリアルタイム更新           |
| リアルタイム反映 | 他ユーザーの投票が行われると全クライアントに即反映（WebSocket経由）             |

---

### 4.2. 管理系・開発者向け機能

| 機能       | 内容                                  |
| -------- | ----------------------------------- |
| DBスキーマ管理 | Drizzleによるマイグレーション管理                |
| 投票履歴の永続化 | D1に投票ログをINSERT（ai_nameとtimestamp）   |
| 初期データ集計  | loaderでD1から全投票データを集計し、初期描画に反映       |
| 投票通知     | Worker → DOへ投票イベントを送信し、WebSocketで配信 |

---

## 5. 非機能要件

| 分類       | 要件内容                                      |
| -------- | ----------------------------------------- |
| パフォーマンス  | 投票結果反映までの遅延100ms以内（DOブロードキャスト経由）          |
| 可用性      | Cloudflare Workers / D1 / DOにより99.9%以上の稼働 |
| セキュリティ   | 投票は匿名、localStorage管理。認証不要。スパム対策は最小限       |
| 保守性      | React Router + Drizzle構成により、機能単位で分離可能     |
| コスト      | Cloudflare FreeまたはProプランで運用可能             |
| スケーラビリティ | 投票イベントはDOで水平分割可能（Room単位）                  |

---

## 6. データベース設計（D1 / Drizzle）

### テーブル：`votes`

| カラム名       | 型       | 制約                         | 説明              |
| ---------- | ------- | -------------------------- | --------------- |
| id         | INTEGER | PRIMARY KEY, AUTOINCREMENT | 投票ID            |
| ai_name    | TEXT    | NOT NULL                   | 投票対象（例："Codex"） |
| created_at | TEXT    | DEFAULT CURRENT_TIMESTAMP  | 投票日時            |

---

## 7. 通信設計

### APIエンドポイント

| メソッド             | パス   | 機能                          | 説明 |
| ---------------- | ---- | --------------------------- | -- |
| `GET /api/votes` | 集計取得 | D1から全投票を取得し、集計を返す           |    |
| `POST /api/vote` | 投票登録 | 指定されたAI名をD1に登録し、DOへブロードキャスト |    |

### WebSocket通信（Durable Object）

| 種類                | 説明                           |
| ----------------- | ---------------------------- |
| `/vote-room`      | クライアントが接続し、他ユーザーの投票をリアルタイム受信 |
| broadcast payload | `{ ai_name: "Claude" }`      |

---

## 8. フロントエンドUIフロー

1. `/` にアクセス → テーマ画像と3つのAIスケッチ表示
2. 投票ボタン押下 → `/api/vote` にPOST
3. localStorageに`voted_ai`保存、再投票不可
4. 投票後 → BarChartを下部に表示
5. 他者の投票 → WebSocketで受信しグラフを更新

---

## 9. 実装補足

* **p5.jsのスケッチ**は `public/sketches/` に配置し、TSX内で `import(/* @vite-ignore */)` で動的読み込み
* **loader/action構成**はReact Router (Remix)のAPIパターンに準拠
* **DO**は1ルーム制御（将来的に複数テーマ対応時にRoom分割可）
* **BarChart**はRecharts使用、アニメーション付きで視覚的に更新

---

## 10. 将来的な拡張要件（任意）

| 機能               | 概要                                         |
| ---------------- | ------------------------------------------ |
| 結果ページ `/results` | 投票結果をランキング形式で公開                            |
| 投票期間制限           | Workerレベルで受付期間を制御                          |
| 管理画面             | D1内の投票データをグラフ・表形式で可視化                      |
| 認証導入             | Cloudflare AccessまたはAuth.js連携による1ユーザー1票の保証 |

---

## 11. 成果物

| 種別     | 内容                                           |
| ------ | -------------------------------------------- |
| ソースコード | React Router + Cloudflare Workersプロジェクト一式    |
| D1スキーマ | Drizzle ORM schema + migrationファイル           |
| 設定ファイル | `wrangler.toml`, `drizzle.config.ts`, `.env` |
| ドキュメント | この要件定義書、構成図、シーケンス図（将来追加）                     |

---

## 12. 開発方針

* **段階的実装アプローチ**

  1. D1 + Drizzleによる投票登録・集計API構築
  2. React Routerで投票UI構築（投票後に結果表示）
  3. DOによるRealtime配信実装
  4. Rechartsによる動的グラフ描画
  5. 作品スケッチ（p5.js）を読み込むUI統合

---

## 13. 想定利用者

* 一般Webユーザー（匿名参加）
* 管理者／開発者（D1データ確認・分析）

---

## 14. 開発・運用環境

| 項目            | 内容                                  |
| ------------- | ----------------------------------- |
| デプロイ先         | Cloudflare Workers                  |
| DB            | Cloudflare D1                       |
| Realtime      | Cloudflare Durable Object           |
| 言語            | TypeScript                          |
| フレームワーク       | React Router (Remix framework mode) |
| ORM           | Drizzle ORM                         |
| 図表            | Recharts                            |
| 開発環境          | Vite + Wrangler CLI                 |
| Node.js バージョン | 18以上                                |

