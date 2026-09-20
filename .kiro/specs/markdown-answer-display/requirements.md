# Requirements Document

## Introduction

easyQA は、トレーニングにおいて受講者が匿名で質問やコメントを送信し、インストラクターが回答できるWebアプリケーションです。現在、質問・回答の表示処理では、テキスト中のURLを自動的にハイパーリンクへ変換する処理とXSS対策のHTMLエスケープのみが行われており、改行やMarkdown記法（太字・リスト・インラインコードなど）は反映されず、プレーンテキストのまま表示されています。

本機能では、受講者向け画面（Learner_Main_Page）およびインストラクター向け画面（Instructor_Main_Page）における質問内容・回答内容の表示処理を拡張し、改行およびMarkdown記法を解釈してHTML表示できるようにします。既存のURL自動リンク化機能とXSS対策は維持したまま、Markdown変換後の出力に対しても安全性を確保します。表示処理はクライアントサイド（フロントエンド）で行い、Backend側のAPI仕様およびDynamoDBへのデータ保存形式（質問内容・回答内容をプレーンテキストとして保存する方式）は変更しません。

## Glossary

- **System**: easyQAアプリケーション全体
- **Frontend**: フレームワーク不使用のシンプルなSPA（HTML/CSS/JavaScript）
- **Learner_Main_Page**: 受講者がサインイン後に表示されるメインページ
- **Instructor_Main_Page**: インストラクターがサインイン後に表示されるメインページ
- **Question**: 受講者が送信する質問またはコメント。最大500文字のプレーンテキストとしてDynamoDBに保存される
- **Answer**: インストラクターが質問に対して入力する回答。最大1000文字のプレーンテキストとしてDynamoDBに保存される
- **Markdown_Renderer**: 質問内容・回答内容の文字列をMarkdown記法として解釈し、HTML要素に変換する本機能で追加するフロントエンドの処理モジュール
- **Sanitizer**: Markdown_Rendererが生成したHTML、および入力テキストに含まれる生HTML・スクリプトを検査し、あらかじめ許可された要素・属性のみを残して安全なHTMLへ変換する処理モジュール
- **Supported_Markdown_Syntax**: 本機能で少なくともサポートすることを明示する記法の集合（要件2で定義する）。採用する標準的なMarkdown変換ライブラリが解釈する記法はこれに限定されない
- **Allowed_HTML_Elements**: Sanitizerが表示を許可するHTML要素・属性の集合（要件3で定義する）
- **Auto_Link_URL**: Markdownのリンク記法を使用せずに記述された、素のURL文字列（例: `https://example.com`）
- **Markdown_Link**: Markdownのリンク記法（`[表示テキスト](URL)`）で記述されたリンク
- **Question_Input_Field**: Learner_Main_Pageにおいて受講者が質問内容を入力するテキスト入力欄
- **Answer_Input_Field**: Instructor_Main_Pageにおいてインストラクターが回答内容を入力するテキスト入力欄
- **Markdown_Syntax_Hint**: Question_Input_FieldおよびAnswer_Input_Fieldの近傍に常時表示される、Supported_Markdown_Syntaxの使用方法を簡潔に案内する控えめな補助説明表示（本機能で追加する）

## 前提・スコープ

- 本機能はクライアントサイド（フロントエンドのJavaScript）における表示時の変換処理として実装し、Backend（backend/functions/questions, backend/functions/answers）のAPI仕様およびDynamoDBのデータ保存形式（質問内容・回答内容のプレーンテキスト保存）は変更しない。質問内容・回答内容はサインイン時と同様、送信されたプレーンテキストのまま保存・取得され、表示時にのみMarkdown記法として解釈される
- 質問内容の最大500文字・回答内容の最大1000文字という既存の文字数制限は変更しない。この文字数はMarkdown記法の記号を含めた入力文字列全体の文字数に対して適用され、変換後のHTML文字列の長さには適用されない

---

## Requirements

### 要件1: 改行を反映した表示

**ユーザーストーリー:** 受講者およびインストラクターとして、質問・回答内で入力した改行を表示時にも改行として見たい。それにより、複数行にわたる質問や回答を読みやすく確認できるようになる。

#### 受入条件

1. WHEN 質問内容または回答内容に改行文字が含まれる場合、THE System SHALL Learner_Main_PageおよびInstructor_Main_Pageの表示上で、入力された改行の位置に対応する改行を表示する
2. WHEN 連続する複数の改行文字が質問内容または回答内容に含まれる場合、THE System SHALL 入力された改行の数に対応する空行を表示上に反映する
3. THE System SHALL 改行の表示処理を要件2で定義するMarkdown記法の解釈処理と組み合わせて適用する

---

### 要件2: Markdown記法を反映した表示

**ユーザーストーリー:** 受講者およびインストラクターとして、質問・回答内でMarkdown記法を使って書式付きのテキストを表示したい。それにより、強調や構造化された情報を分かりやすく伝えられるようになる。

#### 受入条件

1. THE Supported_Markdown_Syntax SHALL 少なくとも、太字（`**テキスト**`）、斜体（`*テキスト*`）、インラインコード（`` `テキスト` ``）、箇条書きリスト（`- テキスト`）、番号付きリスト（`1. テキスト`）、Markdownリンク（`[表示テキスト](URL)`）を含み、採用する標準的なMarkdown変換ライブラリが解釈するその他のCommonMark/GFM記法についても表示への反映を妨げない
2. WHEN 質問内容または回答内容にSupported_Markdown_Syntaxに含まれる記法が使用されている場合、THE Markdown_Renderer SHALL 対応するHTML要素に変換して表示する
3. THE Markdown_Renderer SHALL Supported_Markdown_Syntaxに含まれない記法または記法として不完全な記述（例: 閉じられていない`**`）に対する解釈結果について、採用する標準的なMarkdown変換ライブラリの標準的な挙動に従うものとし、当該入力に対する追加のバリデーションを行わず、本要件では個別の表示挙動を規定しない
4. THE Markdown_Renderer SHALL Learner_Main_PageとInstructor_Main_Pageの両方において、質問内容の表示と回答内容の表示に同一の変換規則を適用する

---

### 要件3: Markdown変換後のXSS対策とサニタイズ

**ユーザーストーリー:** システム管理者として、Markdown記法を反映した表示機能がXSS攻撃の経路にならないようにしたい。それにより、受講者やインストラクターが安全にアプリケーションを利用できるようになる。

#### 受入条件

1. THE Allowed_HTML_Elements SHALL 採用する標準的なMarkdown変換ライブラリが生成しうるHTML要素（段落・改行・強調・斜体・インラインコード・箇条書きリスト・番号付きリスト・リンクに加え、見出し・テーブル・コードブロック・引用・水平線等を含む）のうち、安全性の観点から許可するものに限定する
2. WHEN 質問内容または回答内容にHTMLタグ（例: `<script>`、`<img>`、`<iframe>`等）がそのまま含まれている場合、THE Sanitizer SHALL 当該タグをタグとして解釈せず、画面上に文字列としてエスケープした状態で表示する
3. WHEN 質問内容または回答内容にMarkdownのリンク記法または箇条書き記法を用いて`javascript:`スキームその他の実行可能なURIスキームを含むリンクが指定されている場合、THE Sanitizer SHALL 当該リンクのリンク先を無効化し、クリック不可能な通常のテキストとして表示する
4. THE System SHALL Markdown_Rendererによる変換処理の後に、Sanitizerによる検査処理を適用してから画面に表示する
5. IF Markdown_Rendererが生成したHTML内にAllowed_HTML_Elementsに含まれない要素または属性が存在する場合、THEN THE Sanitizer SHALL 当該要素または属性を除去してから表示する

---

### 要件4: URLリンク化とMarkdownリンク記法の共存

**ユーザーストーリー:** 受講者およびインストラクターとして、Markdownのリンク記法と素のURL入力のどちらを使っても、意図したリンク表示を得たい。それにより、既存の使い方を変えずにMarkdownの利点も活用できるようになる。

#### 受入条件

1. WHEN 質問内容または回答内容にMarkdown_Linkが記述されている場合、THE System SHALL 指定された表示テキストをリンクラベルとしたクリック可能なハイパーリンクを表示する
2. WHEN 質問内容または回答内容にMarkdownのリンク記法を使用せずにAuto_Link_URLが記述されている場合、THE System SHALL 当該URL文字列全体をクリック可能なハイパーリンクとして表示する
3. THE System SHALL Markdown_LinkとAuto_Link_URLのいずれについても、生成するリンク要素に新しいタブで開く属性（`target="_blank"`）と、リンク先ページからの参照元情報漏えいおよびウィンドウ操作を防止する属性（`rel="noopener noreferrer"`）を付与する
4. THE System SHALL Markdown_LinkのリンクラベルとURLの間で二重にリンク化処理を行わず、1つのURLに対して1つのハイパーリンクのみを生成する

---

### 要件5: 文字数制限との整合性

**ユーザーストーリー:** 受講者およびインストラクターとして、Markdown記法を使っても既存の文字数制限のルールを変わらず理解できるようにしたい。それにより、送信前にどれだけ入力できるか予測できるようになる。

#### 受入条件

1. THE System SHALL 質問内容の入力時、Markdown記法の記号を含めた入力文字列の文字数に対して最大500文字の制限を適用する
2. THE System SHALL 回答内容の入力時、Markdown記法の記号を含めた入力文字列の文字数に対して最大1000文字の制限を適用する
3. THE System SHALL 質問内容および回答内容の文字数制限のバリデーションを、Markdown変換後のHTML文字列ではなく、変換前の入力文字列に対して適用する

---

### 要件6: 既存表示機能との互換性

**ユーザーストーリー:** 受講者およびインストラクターとして、既存の質問・回答一覧の見た目や操作性が大きく変わらないようにしたい。それにより、これまでの利用方法を継続できるようになる。

#### 受入条件

1. THE System SHALL 本機能導入前に投稿されたプレーンテキストの質問内容・回答内容についても、Markdown_RendererおよびSanitizerによる表示処理を適用する
2. WHEN 質問内容または回答内容にMarkdown記法が一切使用されていない場合、THE System SHALL 本機能導入前と同等の見た目（改行を除く）でテキストを表示する
3. THE System SHALL Instructor_Main_Pageにおける回答入力欄への既存回答の表示（編集用テキストエリアへの入力値の設定）について、Markdown変換前のプレーンテキストをそのまま設定する
4. THE System SHALL Backend（questions関数およびanswers関数）のAPIリクエスト・レスポンス形式を変更しない

---

### 要件7: Markdown記法の入力ガイド表示

**ユーザーストーリー:** 受講者およびインストラクターとして、質問・回答の入力時にMarkdown記法が使えることを控えめに知りたい。それにより、入力を妨げられずにMarkdown記法の活用に気付けるようになる。

#### 受入条件

1. THE System SHALL Learner_Main_PageのQuestion_Input_Fieldの近傍に、Markdown_Syntax_Hintを常時表示する
2. THE System SHALL Instructor_Main_PageのAnswer_Input_Fieldの近傍に、Markdown_Syntax_Hintを常時表示する
3. THE Markdown_Syntax_Hint SHALL 要件2で定義したSupported_Markdown_Syntax（太字・斜体・インラインコード・箇条書きリスト・番号付きリスト・Markdownリンク）の使用方法を簡潔に案内する内容とする
4. THE Markdown_Syntax_Hint SHALL モーダルまたはアラートを用いず、Question_Input_FieldまたはAnswer_Input_Fieldの操作を妨げない、目立たない補助的な注記として表示する
5. THE System SHALL Markdown_Syntax_Hintの表示・非表示について、ユーザーによる明示的な操作（クリック等）を必要とせず、入力欄の表示中は常に視認可能な状態を維持する

---

## 補足: 外部ライブラリ導入に関する方針（設計フェーズへの引き継ぎ）

- Markdown解析処理およびHTMLサニタイズ処理は、自前実装ではなく`marked.js`等の標準的なCommonMark/GFM準拠パーサーおよび`DOMPurify`等の標準的なサニタイズライブラリを採用する
- 対象外・不完全な記法に対する個別のバリデーション処理は実装せず、採用したライブラリの標準的な解釈結果をそのまま表示する。表示結果に問題がある場合は、投稿者が該当の質問内容・回答内容を削除し、再投稿することを前提とする
- 外部ライブラリを追加する場合、フロントエンドはビルドステップ不要な静的ファイル構成を維持するため、CDN経由での読み込み、またはリポジトリへのバンドル済みファイルの同梱を前提とし、新規の外部依存であることを設計書に明記する
- MCP設定方針（ローカルMCPよりリモートMCPを優先する）は、開発者の開発環境設定に関するものであり、本機能で追加する可能性のあるフロントエンド用外部ライブラリの選定とは無関係である
