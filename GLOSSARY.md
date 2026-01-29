# Glossary

本プロジェクトの全モジュール・関数・定数・通信仕様・セキュリティ対策の一覧。
コードリーディングの補助資料として使用。

updated: 2026-01-28

## モジュール・クラス

| 名前               | 種別     | ファイル              | 役割                                                             |
| ------------------ | -------- | --------------------- | ---------------------------------------------------------------- |
| `CLIRunner`        | クラス   | src/cli-runner.js     | Claude CLI サブプロセスの管理（spawn, stdin/stdout/stderr 制御） |
| `StreamParser`     | クラス   | src/stream-parser.js  | stream-json 形式の出力を解析、system メッセージをフィルタリング  |
| `SessionManager`   | クラス   | src/session-manager.js | JSONL ファイルのスキャン、セッション一覧・プロジェクト一覧取得   |

## サーバー関数（src/server.js）

| 名前                  | 役割                                                 |
| --------------------- | ---------------------------------------------------- |
| `startServer`         | HTTP サーバーと WebSocket サーバーの起動              |
| `createHttpServer`    | 静的ファイル配信 + セキュリティヘッダー付与           |
| `handleConnection`    | WebSocket 接続のハンドリング、メッセージルーティング |
| `validateInput`       | サーバー側の入力バリデーション（空文字列拒否、長さ制限）|
| `validatePort`        | PORT環境変数のバリデーション（1024-65535）            |
| `isAllowedOrigin`     | Origin検証（hostname厳密一致、substring bypass防止） |
| `sanitizeLogMessage`  | ログメッセージから制御文字・改行をエスケープ         |
| `log`                 | タイムスタンプ + サニタイズ付きログ出力               |

## クライアント関数（public/js/app.js）

| 名前                       | 役割                                                 |
| -------------------------- | ---------------------------------------------------- |
| `initWebSocket`            | WebSocket接続の初期化                                |
| `handleServerMessage`      | サーバーメッセージのルーティング                     |
| `appendMessage`            | チャット画面にメッセージ追加（Markdown/テキスト対応）|
| `sendInput`                | ユーザー入力をWebSocket経由で送信                    |
| `stopCLI`                  | CLIプロセスの停止要求                                |
| `updateCharCount`          | 文字数カウント表示の更新                             |
| `listSessions`             | プロジェクト一覧取得要求                             |
| `updateHeaderProjectName`  | ヘッダーのプロジェクト名表示を更新                   |
| `displayProjects`          | プロジェクトドロップダウンの描画                     |
| `requestSessionsForProject`| 指定プロジェクトのセッション一覧を要求               |
| `displaySessions`          | セッション一覧パネルの描画                           |
| `resumeSession`            | 既存セッションの再開                                 |

## CLIRunner メソッド

| 名前          | 役割                                             |
| ------------- | ------------------------------------------------ |
| `start`       | Claude CLI を spawn で起動（shell:false 固定）   |
| `sendInput`   | stdin 経由でユーザー入力を CLI に送信            |
| `stop`        | CLI プロセスを停止                               |
| `onOutput`    | stdout データのコールバック設定                   |
| `onError`     | stderr データのコールバック設定                   |
| `onExit`      | プロセス終了のコールバック設定                    |

## StreamParser メソッド

| 名前        | 役割                                                 |
| ----------- | ---------------------------------------------------- |
| `parse`     | 部分的な JSON を含むストリームデータをバッファリング |
| `onMessage` | パース済みメッセージのコールバック設定               |

## SessionManager メソッド・静的メソッド

| 名前                        | 種別       | 役割                                      |
| --------------------------- | ---------- | ----------------------------------------- |
| `listSessions`              | メソッド   | JSONL ファイルから最初の user メッセージを抽出 |
| `SessionManager.listProjects` | 静的メソッド | `~/.claude/projects/` 配下のディレクトリ一覧 |

## 定数（src/constants.js）

| 名前                 | 値                | 役割                           |
| -------------------- | ----------------- | ------------------------------ |
| `MAX_INPUT_LENGTH`   | 10000             | 入力テキストの最大長（文字数） |
| `MAX_BUFFER_SIZE`    | 1048576 (1MB)     | ストリームバッファの上限       |
| `DEFAULT_PORT`       | 3000              | サーバーのデフォルトポート     |
| `MIN_PORT`           | 1024              | ポート番号の最小値             |
| `MAX_PORT`           | 65535             | ポート番号の最大値             |
| `MAX_CONNECTIONS`    | 3                 | WebSocket同時接続数の上限      |
| `SESSION_ID_PATTERN` | UUID v4正規表現   | セッションIDのバリデーションパターン |
| `MAX_PREVIEW_LENGTH` | 100               | セッションプレビューの最大長   |
| `MAX_PREVIEW_LINES`  | 100               | JSONLプレビュー読み取り行数    |
| `PROJECTS_BASE_DIR`  | `.claude/projects` | プロジェクトベースディレクトリ |

## フロントエンド定数（public/js/app.js）

| 名前            | 値                                       | 役割                       |
| --------------- | ---------------------------------------- | -------------------------- |
| `ALLOWED_ROLES` | `['user','assistant','system','error']`   | メッセージロールホワイトリスト |

## WebSocket メッセージタイプ

| タイプ          | 方向            | 役割                              |
| --------------- | --------------- | --------------------------------- |
| `start`         | Client -> Server | CLI セッション開始                |
| `input`         | Client -> Server | ユーザー入力を CLI に送信         |
| `list-projects` | Client -> Server | プロジェクト一覧を要求（F6）      |
| `list-sessions` | Client -> Server | セッション一覧を要求              |
| `stop`          | Client -> Server | CLI プロセスを停止                |
| `assistant`     | Server -> Client | Claude からの応答メッセージ       |
| `result`        | Server -> Client | タスク完了シグナル                |
| `error`         | Server -> Client | エラーメッセージ（汎用化済み）    |
| `started`       | Server -> Client | セッション開始確認                |
| `exit`          | Server -> Client | CLI プロセス終了通知              |
| `projects`      | Server -> Client | プロジェクト一覧のレスポンス（F6）|
| `sessions`      | Server -> Client | セッション一覧のレスポンス        |

## セキュリティ対策

| 項目                         | 実装                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| コマンドインジェクション防止 | `spawn` + `shell: false` + stdin 経由で入力                       |
| 入力バリデーション           | 空文字列拒否、最大長 10000 文字                                   |
| セッションIDバリデーション   | UUID v4 正規表現パターンマッチ                                    |
| XSS 対策                     | DOMPurify でサニタイズ、テキストは textContent 使用               |
| CDN整合性検証                | SRI ハッシュ + crossorigin 属性（marked.js, DOMPurify）           |
| パストラバーサル防止         | `path.resolve()` + `startsWith()` でベースディレクトリ内検証      |
| Origin検証                   | `URL.hostname` 厳密一致（substring bypass 防止）                  |
| セキュリティヘッダー         | CSP, X-Content-Type-Options: nosniff, X-Frame-Options: DENY       |
| ログインジェクション防止     | 制御文字・改行をエスケープ（`sanitizeLogMessage`）                |
| エラーメッセージ汎用化       | クライアントには内部情報を含まない汎用メッセージのみ返却          |
| WebSocket接続数制限          | `MAX_CONNECTIONS=3` で同時接続を制限                              |
| ロールホワイトリスト         | `ALLOWED_ROLES` で表示可能なメッセージロールを制限                |
| ストリームバッファ制限       | `MAX_BUFFER_SIZE=1MB` でOOMリスクを防止                           |
