# TinyCC-WebUI

Claude Code CLI のブラウザベースフロントエンド

## 概要

スマホからの日本語入力問題（Termux IME 競合）を解決するために、
Web ブラウザのテキストエリアから Claude Code CLI を操作する WebUI。

## 機能

- **チャット入力** (F1): Enter=改行、Ctrl+Enter=送信。スマホ IME と干渉しない
- **ストリーミング表示** (F2): stream-json 形式の出力を逐次表示
- **Markdown 描画** (F3): marked.js + DOMPurify でレンダリング
- **セッション一覧** (F4): `~/.claude/projects/` から JSONL をスキャンして表示
- **セッション継続** (F5): 既存セッションを再開
- **プロジェクト選択** (F6): プロジェクトディレクトリを切り替え

## セキュリティ

- コマンドインジェクション防止: `spawn` + `shell: false` + stdin 経由
- 入力バリデーション: 空文字列拒否、長さ制限（10000 文字）、UUID v4 検証
- XSS 対策: DOMPurify + textContent、CDN に SRI ハッシュ
- Origin 検証: hostname 厳密一致（substring bypass 防止）
- セキュリティヘッダー: CSP, X-Content-Type-Options, X-Frame-Options
- パストラバーサル防止: `path.resolve()` + `startsWith()` 検証
- ログインジェクション防止: 制御文字エスケープ

## 必要環境

- Node.js 18+
- Claude Code CLI インストール済み

## インストール・起動

```bash
npm install
npm start
```

`http://localhost:3000` にアクセス。

## 環境変数

| 変数 | 説明 | デフォルト |
| --- | --- | --- |
| `PORT` | サーバーポート | 3000 |
| `CLAUDE_PROJECT_DIR` | デフォルトプロジェクトディレクトリ | `~/.claude/projects/default` |

## 開発

```bash
npm test          # テスト（63件）
npm run lint      # ESLint
npm run format    # Prettier
```

## ライセンス

MIT
