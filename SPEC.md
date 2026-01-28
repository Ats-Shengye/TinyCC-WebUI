# TinyCC-WebUI - Specification

## Overview

Claude Code CLI のブラウザベースフロントエンド。
スマホからの日本語入力問題（Termux IME競合）を解決するために、
WebブラウザのテキストエリアからClaude Code CLIを操作する。

## Architecture

```
[Browser] <-WebSocket-> [HTTP Server] <-subprocess-> [claude CLI]
                             |
                    [Session Management]
                  (~/.claude/projects/ 参照)
```

- **バックエンド**: Node.js (http + ws)
- **フロントエンド**: バニラ HTML/CSS/JS（フレームワークなし）
- **CLI連携**: `claude` コマンドをサブプロセスで実行（Claude Max認証を継承）
- **ストリーミング**: `--output-format stream-json` でリアルタイム出力

## Functional Requirements

### F1: チャット入力

- テキストエリア + 丸い送信ボタン（SVGアイコン）
- Enter = 改行（スマホIME対策の核心）
- Ctrl+Enter = 送信（PC操作時）
- 送信ボタンタップ = 送信（スマホ操作時）
- 送信中は送信ボタンが停止ボタンに切り替わる

### F2: ストリーミング表示

- CLIの `--output-format stream-json` 出力をWebSocket経由でブラウザに流す
- トークン単位でリアルタイム表示

### F3: Markdown描画

- 応答テキストをMarkdownとしてレンダリング
- コードブロック、リスト、見出し等の基本要素対応
- ライブラリ: marked.js（CDN + SRI）、DOMPurify（CDN + SRI）

### F4: セッション一覧

- オーバーレイパネルで表示（右上から展開）
- 時系列降順ソート（新しいセッションが上）
- セッションID、最初のメッセージ（プレビュー）を表示

### F5: セッション継続

- 一覧からセッション選択 → 同一画面でセッション再開
- `claude -p -r <session-uuid>` で既存セッションを継続

### F6: プロジェクトディレクトリ選択

- セッション一覧パネルの上部にプロジェクト選択UIを配置
- サーバー側で `~/.claude/projects/` 配下のディレクトリ一覧を取得
- クライアントにはディレクトリ名のみ返す（パストラバーサル防止: C-1準拠）
- ユーザーがドロップダウンから選択 → そのプロジェクトのセッション一覧を表示
- サーバー側でパス結合時にパストラバーサル検証必須
- デフォルト: 環境変数 `CLAUDE_PROJECT_DIR` が設定されていればそのディレクトリ名を初期選択
- ヘッダー左にプロジェクト名を表示

## Non-Functional Requirements

| #   | 項目         | 内容                                                     |
| --- | ------------ | -------------------------------------------------------- |
| NF1 | アクセス制御 | アプリ側では制限しない（ネットワーク構成はユーザー責任） |
| NF2 | 動作環境     | Node.js 18+、Linux/macOS                                 |
| NF3 | 認証         | Claude CLI の既存ログイン状態を継承（追加認証なし）      |
| NF4 | 同時接続     | MAX_CONNECTIONS=3（WebSocket同時接続数制限）              |
| NF5 | リソース     | 低スペック環境対応（N100 + 8GB RAM で動作）              |

## UI Design

Claude.ai風のミニマルダークテーマ。

- **カラースキーム**: ダークグレー背景（`#2f2f2f`）、オレンジアクセント（`#d97706`）
- **ヘッダー**: 左にプロジェクト名、右にセッション一覧ボタン
- **入力エリア**: テキストエリア右下に丸い送信/停止ボタン（SVGアイコン）
- **全体**: 丸み（border-radius 8-16px）、影、ミニマル

## Security Considerations

### 最重要: コマンドインジェクション防止

- ユーザー入力はCLI引数に直接渡さない
- stdin経由（パイプ）でCLIにテキストを渡す
- `child_process.spawn` 使用、`shell: false` 固定
- 引数はハードコードされたオプションのみ

### 入力バリデーション

- 空文字列の送信を拒否
- 入力長上限 10000文字（DoS防止）
- セッションID: UUID v4パターン検証

### XSS対策

- Markdown描画: `DOMPurify.sanitize(marked.parse(content))`
- プレーンテキスト: `textContent` 使用（innerHTML禁止）
- CDNスクリプト: SRI + crossorigin属性

### Origin検証

- WebSocket接続時にOriginヘッダーを検証
- `URL.hostname` 厳密一致（substring bypass防止）
- 許可: `localhost`, `127.0.0.1`

### セキュリティヘッダー

- `Content-Security-Policy`: `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`

### ログインジェクション防止

- ログメッセージから制御文字・改行をエスケープ
- エラーメッセージはクライアントに汎用メッセージのみ返却

### パストラバーサル防止

- projectDir: サーバー側固定（クライアントから受け取らない）
- projectName: `path.resolve()` + `startsWith()` でベースディレクトリ内検証
- 静的ファイル: publicDir外のアクセス拒否

### 環境非依存

- ハードコードされたパス、ユーザー名、環境固有値なし
- 設定は環境変数 or デフォルト値

## File Structure

```
TinyCC-WebUI/
├── SPEC.md              # この仕様書
├── GLOSSARY.md          # 用語集
├── README.md            # セットアップ手順、使い方
├── LICENSE              # MIT License
├── package.json         # 依存管理
├── .gitignore           # node_modules等除外
├── src/
│   ├── server.js        # HTTP + WebSocket サーバー、ルーティング
│   ├── cli-runner.js    # Claude CLI サブプロセス管理
│   ├── stream-parser.js # stream-json 出力パーサー
│   ├── session-manager.js # セッション一覧・プロジェクト一覧取得
│   └── constants.js     # 共有定数
├── public/
│   ├── index.html       # チャットUI（単一ページ）
│   ├── css/
│   │   └── style.css    # Claude.ai風ダークテーマ
│   └── js/
│       └── app.js       # WebSocket通信、チャット、セッション管理
└── tests/
    ├── server.test.js         # サーバーテスト
    ├── cli-runner.test.js     # CLIランナーテスト
    ├── stream-parser.test.js  # ストリームパーサーテスト
    ├── session-manager.test.js # セッション管理テスト
    ├── constants.test.js      # 定数テスト
    └── origin-validation.test.js # Origin検証テスト
```

## CLI Interface

### 新規チャット

```bash
echo "<user_input>" | claude -p --output-format stream-json
```

### セッション継続

```bash
echo "<user_input>" | claude -p -r <session-uuid> --output-format stream-json
```

### セッション一覧取得

CLIに `sessions list` サブコマンドは存在しない。
`~/.claude/projects/<project-dir>/` 配下のJSONLファイルを直接スキャンする。

```
~/.claude/projects/-home-user/
├── d5b496e4-5fb0-4a73-b405-2ea4451f743b.jsonl
├── ...
```

各JSONLファイルの中から `type: "user"` の最初のメッセージを抽出し、
ファイルの更新日時でソートして一覧を構築する。

プロジェクトディレクトリの命名規則: パスの `/` を `-` に置換（例: `/home/user` -> `-home-user`）

## Dependencies

| パッケージ  | 用途               | 備考               |
| ----------- | ------------------ | ------------------ |
| ws          | WebSocket          | サーバー側         |
| marked      | Markdown描画       | CDN + SRI          |
| dompurify   | XSS対策            | CDN + SRI          |

ランタイム依存は `ws` のみ。`http`, `fs`, `path`, `os` は Node.js 標準ライブラリ。

### 開発依存

| パッケージ       | 用途           |
| ---------------- | -------------- |
| vitest           | テストフレームワーク |
| eslint           | リンター       |
| prettier         | フォーマッター |
| eslint-config-prettier | ESLint + Prettier連携 |

## Development

- **GitHub公開前提**: ポートフォリオ兼用。コメント・READMEは外部エンジニア可読レベル
- **TDD適用**: あり（Red -> Green -> Refactor）
- **テストフレームワーク**: Vitest
- **テスト数**: 63件
- **コード規約**: Coding.md準拠、ESLint + Prettier
- **コメント**: フォーマル（外部エンジニア可読）、英語
- **セキュリティレビュー**: クロ（レッドチーム）によるレビュー PASS（8.5/10）

## Estimates

- ファイル数: src/ 5, public/ 3, tests/ 6 = 14ファイル
- 実績行数: ~800 lines（テスト除く）
- Tier: B（MUGA5で開発・運用OK）
- 開発期間: 1/27 仕様策定、1/28 実装・レビュー・UI改善

## Resolved Questions（検証済み）

### Q1: stream-json 出力形式

```jsonc
// Hook系メッセージ（フロントでフィルタ対象外）
{"type":"system","subtype":"hook_started", ...}
{"type":"system","subtype":"hook_response", ...}
{"type":"system","subtype":"init", ...}

// 応答メッセージ（フロントで表示対象）
{"type":"assistant","message":{"content":[{"type":"text","text":"..."}], ...}}

// 完了シグナル
{"type":"result","subtype":"success","result":"全文テキスト", ...}
```

フロントエンドでは `type: "assistant"` のメッセージから
`message.content[].text` を抽出してストリーミング表示する。
`type: "result"` を受信したら応答完了。

### Q2: セッション一覧

CLIに `sessions list` コマンドは存在しない（CLI Interface セクション参照）。

### Q3: セッション継続

```bash
echo "<user_input>" | claude -p -r <session-uuid> --output-format stream-json
```

session-uuidはJSONLファイル名（拡張子除く）と一致。

### Q4: marked.js

CDN利用。ネットワーク接続前提のためオフライン考慮不要。
SRIハッシュ + crossorigin属性で整合性検証。
