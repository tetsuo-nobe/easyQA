# Implementation Plan: Markdown記法による質問・回答表示

## Overview

質問・回答の表示処理を、`marked.js`（Markdown変換）と`DOMPurify`（サニタイズ）を用いた新規モジュール`frontend/js/markdown.js`に置き換える。既存の`convertUrlsToLinks()`（`api.js`）・`escapeHtml()`（`learner.js`/`instructor.js`）を削除し、`renderMarkdownSafe()`・`escapeHtmlEntities()`に統合する。テスト基盤（Vitest + fast-check）を新規導入し、設計書のCorrectness Properties 5件をproperty-based testで検証する。Backend・DynamoDBのデータ形式は変更しない。

## Tasks

- [x] 1. テスト基盤とプロジェクト設定を新規作成する
  - `package.json`をリポジトリルートに新規作成し、開発依存として`vitest`, `fast-check`, `marked`, `dompurify`, `jsdom`を追加する（バージョンは固定・ピン留めする）
  - `vitest`の実行スクリプト（`test`）を`package.json`に定義する
  - _Requirements: 前提・スコープ（テスト実行環境の整備。本番配信物には影響しない）_

- [x] 2. `frontend/js/markdown.js`の骨格と内部ユーティリティを実装する
  - [x] 2.1 IIFEモジュールの骨格、`MARKED_OPTIONS`（`gfm: true`, `breaks: true`）、`SANITIZE_CONFIG`（`ALLOWED_TAGS`, `ALLOWED_ATTR`, `ALLOWED_URI_REGEXP`）を定義する
    - 既存の`api.js`, `auth.js`と同様にグローバル関数として公開するIIFE構成にする
    - _Requirements: 2.1, 3.1, 3.3, 3.5_

  - [x] 2.2 `escapeHtmlEntities(text)`関数を実装する
    - `<`, `>`, `&`, `"`, `'`をエンティティに変換する。`text`が`null`または`undefined`の場合は空文字列を返す
    - _Requirements: 6.3、Error Handling（null/undefined時のフォールバック）_

  - [x]* 2.3 `escapeHtmlEntities(text)`の単体テストを作成する
    - `<script>`等のタグ文字列がエスケープされること、`null`/`undefined`/空文字列時に空文字列を返すことを確認する
    - _Requirements: 6.3_

  - [x] 2.4 `autoLinkPlainUrls(text)`関数を実装する
    - Markdownリンク記法（`[...](...)`）の範囲を先に検出して除外した上で、素のURL（`https?://[^\s]+`相当）をMarkdownリンク記法`[URL](URL)`に変換する前処理を実装する
    - `text`が`null`または`undefined`の場合は空文字列を返す
    - _Requirements: 4.2, 4.4_

  - [x]* 2.5 Property 3のproperty-based testを作成する（リンクの重複防止・属性付与）
    - **Property 3: Markdownリンクと素のURLはそれぞれ1つのリンクに変換される**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - `renderMarkdownSafe()`経由でテストするため、本タスクは3.1実装後にテストコードを追加する（テスト実行はタスク3.2以降で行う）
    - fast-checkでMarkdownリンク記法と素のURLを組み合わせた文字列を生成し、出力の`<a>`要素数が入力中のリンク出現数と一致し、各要素が`target="_blank"`と`rel="noopener noreferrer"`を持つことを検証する
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 3. `renderMarkdown(text)`と`renderMarkdownSafe(text)`を実装する
  - [x] 3.1 `renderMarkdown(text)`を実装する
    - `autoLinkPlainUrls()`による前処理後、`marked.parse(text, MARKED_OPTIONS)`を呼び出してサニタイズ前のHTML文字列を生成する。`text`が`null`または`undefined`の場合は空文字列を返す
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 `renderMarkdownSafe(text)`を実装する
    - `renderMarkdown(text)`の出力を`DOMPurify.sanitize(html, SANITIZE_CONFIG)`に渡し、サニタイズ済みHTML文字列を返す公開関数として実装する
    - _Requirements: 3.2, 3.4, 3.5_

  - [x]* 3.3 Property 1のproperty-based testを作成する（許可要素・属性のみが残る）
    - **Property 1: サニタイズ後は許可要素・属性のみが残る**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
    - fast-checkでHTMLタグ・スクリプト・CommonMark/GFM記法を含む任意の文字列を生成し、`renderMarkdownSafe()`の出力をjsdomでパースして、`ALLOWED_TAGS`外のタグや`ALLOWED_ATTR`外の属性が存在しないことを検証する
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x]* 3.4 Property 2のproperty-based testを作成する（危険なURIスキームの無効化）
    - **Property 2: 危険なURIスキームは無効化される**
    - **Validates: Requirements 3.3**
    - fast-checkで`javascript:`, `data:`等のURIスキームを持つMarkdownリンク記法の文字列を生成し、出力に当該`url`を`href`とする`<a>`要素が含まれないことを検証する
    - _Requirements: 3.3_

  - [x]* 3.5 タスク2.5で作成したProperty 3のテストを実行する
    - `renderMarkdownSafe()`が実装済みのため、タスク2.5で作成したテストコードを実行し結果を確認する
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x]* 3.6 Property 4のproperty-based testを作成する（改行の反映）
    - **Property 4: 改行が表示に反映される**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - fast-checkでMarkdownのブロック記法の記号を先頭に持たない2つの文字列を`\n`で連結した入力を生成し、出力に改行を表す要素（`<br>`または複数の`<p>`への分割）が含まれることを検証する
    - _Requirements: 1.1, 1.2, 1.3_

  - [x]* 3.7 Property 5のproperty-based testを作成する（Markdown記法なし時の既存互換性）
    - **Property 5: Markdown記法が含まれない場合は既存同等の表示になる**
    - **Validates: Requirements 6.1, 6.2**
    - fast-checkでMarkdown記法の記号を含まないプレーンテキストを生成し、出力からHTMLタグを除去したテキストコンテンツが入力（URL部分を除く）と一致することを検証する
    - _Requirements: 6.1, 6.2_

  - [x]* 3.8 基本的なMarkdown記法変換の単体テストを作成する
    - 太字・斜体・インラインコード・箇条書き・番号付きリスト・Markdownリンクの各1〜2例について、`renderMarkdownSafe()`経由での結合的な変換結果を確認する
    - `javascript:`スキームを含むリンクの無効化、`<script>`タグを含む入力のエスケープ表示の具体例を確認する
    - `MARKED_OPTIONS`（`gfm: true`, `breaks: true`）が`marked.parse()`に渡されていることを確認する
    - _Requirements: 2.1, 3.2, 3.3_

- [x] 4. チェックポイント - `markdown.js`のテストがすべて通ることを確認する
  - すべてのテストが通ることを確認し、疑問があればユーザーに確認する。

- [x] 5. `frontend/js/api.js`から`convertUrlsToLinks()`を削除する
  - [x] 5.1 `convertUrlsToLinks()`関数を`api.js`から削除する
    - API通信関数（`signIn`, `getQuestions`, `submitQuestion`, `deleteQuestion`, `submitAnswer`, `getClasses`, `saveClass`）は変更しない
    - _Requirements: 6.4（Backend/APIリクエスト・レスポンス形式の非変更を維持するための整理）_

- [x] 6. `frontend/learner.html`にCDNスクリプトと`markdown.js`を読み込む
  - [x] 6.1 `marked.js`（バージョン固定、SRI付き）、`DOMPurify`（バージョン固定、SRI付き）、`frontend/js/markdown.js`の`<script>`タグを追加する
    - 読み込み順序を「marked.js（CDN） → DOMPurify（CDN） → markdown.js → api.js → auth.js → learner.js」とする
    - _Requirements: 補足: 外部ライブラリ導入に関する方針_

  - [x] 6.2 質問入力欄（`<textarea id="question-content">`）の直後にMarkdown記法ヒント（`.markdown-hint`）を静的HTMLとして追加する
    - 太字・斜体・インラインコード・箇条書き・番号付きリスト・Markdownリンクの使用方法を案内するテキストを、モーダル・アラートを使わない常時表示の注記として追加する
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

- [x] 7. `frontend/instructor.html`にCDNスクリプトと`markdown.js`を読み込む
  - [x] 7.1 `marked.js`（バージョン固定、SRI付き）、`DOMPurify`（バージョン固定、SRI付き）、`frontend/js/markdown.js`の`<script>`タグを追加する
    - 読み込み順序を「marked.js（CDN） → DOMPurify（CDN） → markdown.js → api.js → auth.js → instructor.js」とする
    - _Requirements: 補足: 外部ライブラリ導入に関する方針_

- [x] 8. `frontend/js/learner.js`の表示処理を`renderMarkdownSafe()`に置き換える
  - [x] 8.1 `renderQuestions()`内の`convertUrlsToLinks(escapeHtml(q.content))`と`convertUrlsToLinks(escapeHtml(q.answer))`を`renderMarkdownSafe(q.content)`・`renderMarkdownSafe(q.answer)`に置き換える
    - 投稿者名（`nameDisplay`）の表示は`escapeHtml(q.name)`から`escapeHtmlEntities(q.name)`に置き換える
    - `learner.js`内の`escapeHtml()`関数定義を削除する
    - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.4, 3.2, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 9. `frontend/js/instructor.js`の表示処理を`renderMarkdownSafe()`に置き換える
  - [x] 9.1 `renderQuestions()`内の`convertUrlsToLinks(escapeHtml(q.content))`・`convertUrlsToLinks(escapeHtml(q.answer))`を`renderMarkdownSafe(q.content)`・`renderMarkdownSafe(q.answer)`に置き換える
    - `instructor.js`内の`escapeHtml()`関数定義を削除する
    - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.4, 3.2, 3.4, 4.1, 4.2, 4.3, 4.4_

  - [x] 9.2 回答入力欄（`<textarea id="answer-input">`）へのセット値を`escapeHtmlEntities(q.answer)`に置き換える
    - `renderMarkdownSafe()`は適用せず、Markdown変換前のプレーンテキストをエスケープしたものをtextareaの初期値として設定する
    - _Requirements: 6.3_

  - [x]* 9.3 回答入力欄への既存回答セット処理の単体テストを作成する
    - 回答内容にMarkdown記法の記号（例: `**強調**`）が含まれる場合、textareaにセットされる値がMarkdown変換されず記号を保持したプレーンテキストのままであることを確認する
    - _Requirements: 6.3_

  - [x] 9.4 回答フォームのテンプレート文字列にMarkdown記法ヒント（`.markdown-hint`）を追加する
    - `<textarea id="answer-input">`の直後に、太字・斜体・インラインコード・箇条書き・番号付きリスト・Markdownリンクの使用方法を案内するヒントHTMLを追加する
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [x] 10. チェックポイント - 表示処理の置き換えが完了したことを確認する
  - すべてのテストが通ることを確認し、疑問があればユーザーに確認する。

- [x] 11. `frontend/css/style.css`に`.markdown-hint`のスタイルを追加する
  - [x] 11.1 `.markdown-hint`および`.markdown-hint code`のスタイルを追加する
    - 既存の`.error-text`等と同系統の小さいフォントサイズ・薄いグレー系の色で、常時表示される控えめな注記として実装する
    - _Requirements: 7.4, 7.5_

- [x]* 12. `.markdown-hint`のDOM存在確認テストを作成する
  - `learner.html`の質問入力欄近傍、および`instructor.js`が生成する回答フォーム内に`.markdown-hint`要素が存在し、`hidden`クラス等が付与されていないことを確認する
  - _Requirements: 7.1, 7.2, 7.5_

- [x] 13. 最終チェックポイント - すべてのテストが通ることを確認する
  - すべてのテストが通ることを確認し、疑問があればユーザーに確認する。

## Notes

- `*`が付いたタスクはオプションであり、MVPとしてはスキップ可能。ただし本ワークフローの実装ルールに従い、`*`が付いていないタスクはすべて実装する
- 各タスクは対応する要件番号（要件.受入条件番号）を明記している
- Property-based testはfast-check、単体テストはVitestを使用し、いずれもNode.js上の開発依存としてのみ導入する（本番配信物である静的ファイル構成には影響しない）
- `marked.js`自体のMarkdownパースロジック（CommonMark/GFM記法の解釈そのもの）は本タスクリストの検証対象に含めない。本機能が実装する「前処理・オプション設定・サニタイズ・結合」のロジックのみを検証する
- チェックポイント（タスク4, 10, 13）は複数回設けており、テスト基盤構築後、表示処理置き換え後、全体完了後の3段階で確認する

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.4"] },
    { "id": 3, "tasks": ["2.3", "2.5", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "5.1", "6.1", "7.1"] },
    { "id": 6, "tasks": ["6.2", "8.1", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.4"] },
    { "id": 8, "tasks": ["9.3", "11.1"] },
    { "id": 9, "tasks": ["12"] }
  ]
}
```
