# 実装タスク

## step.0 初期セットアップ

- [x] cloudflare / ReactRouter プロジェクトのセットアップ
- [x] publicフォルダへのsketches, theme.pngの配置
- [x] 必要なライブラリの選定
  - drizzle-orm, drizzle-kit
  - recharts（グラフ表示用）
  - p5.js（AI作品表示用）
- [x] ライブラリのインストール

## step.1 D1 + Drizzleのセットアップ

- [x] D1データベースの作成（wrangler d1 create AI_DRAW_VOTES）
- [x] wrangler.jsoncへのD1バインディング設定追加
- [x] drizzle.config.tsの作成
- [x] app/lib/schema.tsでvotesテーブルスキーマ定義
  - id: INTEGER PRIMARY KEY AUTOINCREMENT
  - ai_name: TEXT NOT NULL
  - created_at: TEXT DEFAULT CURRENT_TIMESTAMP
- [x] app/lib/db.tsでDrizzleクライアント関数作成
- [x] マイグレーション生成（drizzle-kit generate:sqlite）
- [x] D1へのマイグレーション適用（wrangler d1 migrations apply）
- [x] ローカル開発用D1セットアップ

## step.2 Durable Objectの実装

- [x] app/lib/broadcast.ts（またはworkers/vote-room.ts）にVoteRoomDOクラス作成
  - WebSocketPair生成
  - sessionsの管理（接続・切断処理）
  - broadcastメソッドで全クライアントへメッセージ送信
- [x] wrangler.jsoncにDurable Objectバインディング追加
  - [[durable_objects.bindings]] name = "VOTE_ROOM"
  - class_name = "VoteRoomDO"
- [x] workers/app.tsにDurable Objectのエクスポート追加

## step.3 投票APIの実装（Worker側）

- [x] workers/app.tsで投票API実装
  - POST /api/vote エンドポイント
    - リクエストボディからai_nameを取得
    - D1に投票データをINSERT
    - Durable Objectへブロードキャストリクエスト送信
    - レスポンス返却
  - GET /api/votes エンドポイント
    - D1から全投票データを取得
    - ai_name別に集計（Codex, Claude, Gemini）
    - 集計結果をJSON形式で返却
- [x] Cloudflare Workers環境変数（Env型）の型定義更新
  - DB: D1Database
  - VOTE_ROOM: DurableObjectNamespace

## step.4 WebSocketエンドポイントの実装

- [x] workers/app.tsで /vote-room WebSocketエンドポイント実装
  - WebSocket接続リクエストを受け取る
  - Durable Objectへプロキシ
  - 101 Switching Protocols レスポンス返却
- [x] Durable Object側でWebSocket接続の受け入れ処理
- [x] 接続テスト用のシンプルなクライアント実装（フロントエンドで実装予定）

## step.5 フロントエンド基本UIの実装

- [x] app/routes/_index.tsxの基本構造作成
  - テーマ画像表示エリア
  - 3つのAI作品表示エリア（Codex, Claude, Gemini）
  - 投票ボタン（各作品に1つずつ）
  - 結果表示エリア（投票後のみ表示）
- [x] TailwindCSSでレイアウトスタイリング
  - レスポンシブ対応（flex, grid等）
  - ボタンデザイン
  - カード型レイアウト
- [x] テーマ画像の表示実装（public/theme.pngを読み込み）

## step.6 投票機能の実装（フロントエンド）

- [x] loaderで初期投票データ取得（/api/votesから）
- [x] localStorageから投票済み状態を確認
  - voted_aiキーの存在チェック
  - 投票済みの場合はボタンを無効化
- [x] 投票ボタンのクリックハンドラ実装
  - POST /api/voteへリクエスト送信
  - localStorageにvoted_ai保存
  - 投票済み状態に更新
  - 結果表示フラグをON
- [x] エラーハンドリング実装
  - 二重投票防止
  - ネットワークエラー対応

## step.7 p5.js統合

- [x] app/components/P5Canvas.tsxコンポーネント作成
  - propsでsketchPathを受け取る
  - useEffectでp5.jsスケッチを動的ロード
  - Canvas要素のマウント・アンマウント処理
- [x] public/sketches/配下にサンプルスケッチ配置
  - codexSketch.js
  - claudeSketch.js
  - geminiSketch.js
- [x] P5Canvasコンポーネントを_index.tsxに統合
- [x] 各AIのスケッチが正しく表示されることを確認
- [x] @types/p5の追加でTypeScriptエラー解消

## step.8 リアルタイム投票反映の実装

- [x] _index.tsxでWebSocket接続処理実装
  - useEffectでWebSocket接続（wss://yourworker.ai/vote-room）
  - onmessageで投票通知を受信
  - 受信したai_nameに基づいて投票カウントをインクリメント
  - oncloseで接続切断処理
  - cleanup関数でWebSocketをclose
- [x] ステート管理
  - useStateで投票データを管理
  - WebSocketメッセージ受信時に即座に更新
- [x] WebSocket接続エラーハンドリング
  - 自動再接続機能（5秒後にリトライ）
  - 接続状態インジケーター追加

## step.9 結果表示（Recharts）の実装

- [ ] app/components/ResultChart.tsxコンポーネント作成
  - BarChartでCodex/Claude/Geminiの投票数を表示
  - propsでvotesデータを受け取る
  - アニメーション設定
  - レスポンシブ対応
- [ ] ResultChartを_index.tsxに統合
  - 投票後のみ表示（showChartフラグ）
  - リアルタイムで投票データが反映されることを確認
- [ ] グラフのスタイリング
  - カラーテーマ設定（各AIごとに色分け）
  - ラベル、軸、凡例の設定

## step.10 TypeScript型定義の整備

- [x] worker-configuration.d.tsの確認
  - Env型にDB、VOTE_ROOMが自動生成済み
- [x] グローバル型の定義
  - AppLoadContextの拡張済み（workers/app.ts）
  - 投票データの型定義作成（app/lib/types.ts）
    - AIName型
    - VoteCounts型
    - Vote型
    - VoteMessage型
    - VoteResponse型
- [x] コンポーネントのProps型定義
  - ClientOnlyPropsインターフェイス追加
  - P5CanvasPropsインターフェイス確認
- [x] 型エラーの解消（bun run typecheck）
- [x] 共通型定義を各ファイルで使用
  - _index.tsxでVoteCounts、VoteMessage使用
  - workers/app.tsでAIName、VoteCounts、VoteMessage使用

## step.11 ローカル開発環境の整備

- [x] wrangler.jsoncでローカルD1設定
  - 設定済み（d1_databases, durable_objects）
- [x] ローカルD1データベースの確認
  - .wrangler/state/v3/d1/に存在確認
- [x] ビルドファイルの確認
  - build/server/index.js存在確認
- [x] ローカルWorker起動方法の確認
  - `bun run build && npx wrangler dev build/server/index.js --local`
- [x] 本番環境でのテスト完了
  - すべての機能（D1, Durable Object, WebSocket）が本番環境で正常動作確認済み

## step.12 テスト・デバッグ

- [x] D1データベース操作のユニットテスト作成（workers/app.test.ts）
  - MockD1Databaseクラス実装
  - 投票データの挿入・取得・集計テスト
  - AI名バリデーションテスト
  - 7テストケース、全てパス（21アサーション）
- [x] コード品質の確認・修正 (bun run lint)
  - Biome linterのインストールと設定
  - 未使用インポートの削除
  - 型アノテーションの追加
  - ボタンtype属性の追加
  - 空パターンの修正
- [ ] 投票登録が正しくD1に保存されるか確認（E2Eテスト）
- [ ] 投票後に全クライアントにリアルタイム通知されるか確認
- [ ] localStorage制御が正しく機能するか確認
- [ ] 複数ブラウザ・タブでのリアルタイム同期確認
- [ ] エッジケースのテスト
  - 同時投票
  - WebSocket切断・再接続
  - ページリロード時の状態保持
- [ ] パフォーマンス確認（投票反映100ms以内）

## step.13 UI/UX改善

- [ ] ローディング状態の表示
- [ ] 投票完了時のフィードバック（アニメーション、トースト通知等）
- [ ] 投票済みの場合の視覚的フィードバック
- [ ] モバイルレスポンシブ対応の最終調整
- [ ] アクセシビリティ対応（aria-label等）

## step.14 デプロイ準備

- [ ] 本番用wrangler.jsonc設定確認
- [ ] 環境変数・シークレットの設定
- [ ] 本番D1データベースの作成とマイグレーション
- [ ] Durable Objectの本番バインディング確認
- [ ] ビルドエラーの解消（bun run build）

## step.15 デプロイ・本番確認

- [ ] Cloudflare Workersへデプロイ（bun run deploy）
- [ ] 本番環境での動作確認
  - 投票機能
  - リアルタイム反映
  - p5.js表示
  - グラフ表示
- [ ] 複数デバイスからの動作確認
- [ ] パフォーマンス・レイテンシ確認
- [ ] エラーログ確認

## step.16 ドキュメント・保守

- [ ] README.mdの更新
  - プロジェクト概要
  - セットアップ手順
  - デプロイ手順
- [ ] CLAUDE.mdの更新（必要に応じて）
- [ ] コードコメントの追加
- [ ] 今後の拡張要件の整理（results ページ、管理画面等）

