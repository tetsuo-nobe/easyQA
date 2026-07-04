# 実装計画: easyQA

## 概要

easyQA のフロントエンド（純粋 HTML/CSS/JavaScript SPA）とバックエンド（Python 3.13 Lambda × 4 + API Gateway + DynamoDB）を段階的に実装する計画です。インフラ定義 → バックエンドロジック → フロントエンド → テストの順で構築し、各ステップで前のステップを積み上げます。

---

## タスク

- [x] 1. プロジェクト構造とインフラ定義のセットアップ
  - [x] 1.1 ディレクトリ構造とバックエンド共通設定を作成する
    - `backend/` と `frontend/` のディレクトリ構造を作成する
    - `backend/requirements.txt` に `boto3`・`bcrypt`・`hypothesis`・`moto`・`pytest` を記載する
    - `backend/functions/signin/app.py`・`questions/app.py`・`answers/app.py`・`classes/app.py` の空ファイルを作成する
    - 各 Lambda 関数に共通の `error_response(status_code, message)` ヘルパー関数を実装する（CORS ヘッダー付き）
    - _要件: 6.1, 6.2, 6.4, 7.1, 7.2_

  - [x] 1.2 SAM テンプレート（`backend/template.yaml`）を作成する
    - `Globals.Api.Cors` に `AllowMethods`・`AllowHeaders`・`AllowOrigin` を設定する
    - DynamoDB テーブル3件（Users・Classes・Questions）を `BillingMode: PAY_PER_REQUEST` で定義する
    - Lambda 関数4件（signin・questions・answers・classes）とそれぞれの API Gateway イベント設定を定義する
    - 各 Lambda に必要な DynamoDB 操作権限の IAM ポリシーを付与する
    - _要件: 6.1, 6.3, 7.2, 7.5_

- [x] 2. 認証 Lambda（`backend/functions/signin/app.py`）を実装する
  - [x] 2.1 POST /signin Lambda ハンドラーを実装する
    - `role`・`id`・`password` をリクエストボディから取得してバリデーションする
    - `role == "learner"` の場合: DynamoDB Classes テーブルから `classId` でレコードを取得し `bcrypt` でパスワードを照合する。成功時に `{"success": true, "role": "learner", "classId": "..."}` を 200 で返す
    - `role == "instructor"` の場合: DynamoDB Users テーブルから `instructorId` でレコードを取得し `bcrypt` でパスワードを照合する。成功時に `{"success": true, "role": "instructor"}` を 200 で返す
    - 認証失敗時は HTTP 401 + `{"success": false, "message": "IDまたはパスワードが正しくありません。"}` を返す
    - 全体を try/except で囲み、予期しない例外は HTTP 500 で返す
    - _要件: 1.4, 1.5, 1.6, 1.7, 6.5, 6.6_

  - [ ]* 2.2 認証 Lambda のユニットテストを書く
    - `backend/tests/test_signin.py` を作成する
    - 正しい認証情報（learner・instructor 両方）で 200 が返ることをテストする
    - 誤ったパスワードで 401 が返ることをテストする
    - 存在しない ID で 401 が返ることをテストする
    - DynamoDB は `moto` でモック化する
    - _要件: 1.6, 1.7, 6.6_

  - [ ]* 2.3 Property 7: 認証失敗時の HTTP 401 返却プロパティテストを書く
    - **Property 7: 認証失敗時のHTTP 401返却**
    - `@given(invalid_credentials_strategy())` で不正な認証情報を生成し、常に 401 が返ることを検証する
    - `@settings(max_examples=100)` を設定する
    - DynamoDB は `moto` でモック化する
    - **Validates: Requirements 6.6, 1.6, 1.7**

- [x] 3. 質問管理 Lambda（`backend/functions/questions/app.py`）を実装する
  - [x] 3.1 GET /questions Lambda ハンドラーを実装する
    - クエリパラメータ `classId` を取得・バリデーションする
    - DynamoDB Questions テーブルを `classId` でクエリし `ScanIndexForward=False`・`Limit=100` で最大100件降順取得する
    - レスポンスに各質問の `questionNumber`・`submittedAt`・`content`・`name`・`answer`（未回答時は省略）を含める
    - _要件: 2.2, 3.1, 3.2, 3.3, 3.4, 4.2_

  - [x] 3.2 POST /questions Lambda ハンドラーを実装する
    - `classId`・`content`・`name` をリクエストボディから取得してバリデーションする
    - 同一 `classId` の最新 `questionNumber` を DynamoDB クエリ（降順1件）で取得し、+1 した値を新しい `questionNumber` とする（初回は 1）
    - DynamoDB 条件付き書き込み（`attribute_not_exists(questionNumber)`）で競合を防ぎながら質問レコードを保存する
    - `submittedAt` に現在時刻を ISO 8601 形式（タイムゾーン付き）で付与する
    - 成功時に 201 + `{"success": true, "questionNumber": N, "submittedAt": "..."}` を返す
    - _要件: 2.8, 3.1, 6.7_

  - [ ]* 3.3 質問管理 Lambda のユニットテストを書く
    - `backend/tests/test_questions.py` を作成する
    - 正常な質問送信で 201 返却・`questionNumber` 付与をテストする
    - 質問一覧取得で降順ソートされていることをテストする
    - DynamoDB は `moto` でモック化する
    - _要件: 2.8, 3.2, 6.7_

  - [ ]* 3.4 Property 1: 質問番号の連番性プロパティテストを書く
    - **Property 1: 質問番号の連番性**
    - `@given(st.lists(st.text(min_size=1, max_size=500), min_size=1, max_size=20))` で任意件数の質問リストを生成する
    - n 件の質問を順次送信後に `questionNumber` の集合が `{1, 2, ..., n}` と等しいことを検証する
    - `@settings(max_examples=100)` を設定する
    - DynamoDB は `moto` でモック化する
    - **Validates: Requirements 6.7**

  - [ ]* 3.5 Property 2: 質問一覧の降順ソートプロパティテストを書く
    - **Property 2: 質問一覧の降順ソート**
    - `@given(st.lists(question_strategy(), min_size=2, max_size=20))` で任意の質問リストを生成する
    - 一覧取得レスポンスが常に `submittedAt` の降順になっていることを検証する
    - `@settings(max_examples=100)` を設定する
    - DynamoDB は `moto` でモック化する
    - **Validates: Requirements 3.2, 4.2**

- [x] 4. チェックポイント - バックエンド基盤テストの確認
  - すべてのテストが通ることを確認する。疑問点があればユーザーに確認する。

- [x] 5. 回答管理 Lambda（`backend/functions/answers/app.py`）を実装する
  - [x] 5.1 PUT /questions/{questionNumber}/answer Lambda ハンドラーを実装する
    - パスパラメータ `questionNumber`・リクエストボディ `classId`・`answer` を取得してバリデーションする
    - DynamoDB から `classId`・`questionNumber` で該当レコードを `GetItem` し、存在しない場合は HTTP 404 を返す
    - `UpdateItem` で `answer`・`answeredAt`（ISO 8601形式）を保存する
    - 成功時に 200 + `{"success": true}` を返す
    - _要件: 4.4, 4.5, 4.7, 6.8, 6.9_

  - [ ]* 5.2 回答管理 Lambda のユニットテストを書く
    - `backend/tests/test_answers.py` を作成する
    - 存在する質問への正常回答で 200 が返ることをテストする
    - 存在しない質問番号で 404 が返ることをテストする
    - DynamoDB は `moto` でモック化する
    - _要件: 6.8, 6.9_

  - [ ]* 5.3 Property 8: 存在しない質問への回答で 404 返却プロパティテストを書く
    - **Property 8: 存在しない質問への回答で404返却**
    - `@given(st.integers(min_value=1))` で任意の質問番号を生成する
    - DB に存在しない質問番号への回答リクエストに対して常に 404 が返ることを検証する
    - `@settings(max_examples=100)` を設定する
    - DynamoDB は `moto` でモック化する
    - **Validates: Requirements 6.9**

- [x] 6. クラス管理 Lambda（`backend/functions/classes/app.py`）を実装する
  - [x] 6.1 GET /classes Lambda ハンドラーを実装する
    - クエリパラメータ `instructorId` を取得・バリデーションする
    - DynamoDB Classes テーブルから `instructorId` が一致するレコードをスキャン（またはGSI）して最大100件返す
    - レスポンスに `classId`・`className`・`startDate`・`endDate` を含める
    - _要件: 5.5_

  - [x] 6.2 POST /classes Lambda ハンドラーを実装する
    - `instructorId`・`classId`・`className`・`startDate`・`endDate`・`password` をリクエストボディから取得してバリデーションする
    - `startDate > endDate` の場合は HTTP 400 を返す
    - `condition_expression=Attr('classId').not_exists()` 付きで `PutItem` し、重複時は HTTP 409 + `{"success": false, "message": "同じクラスIDがすでに存在します。"}` を返す
    - パスワードは `bcrypt.hashpw` でハッシュ化して保存する
    - 成功時に 201 + `{"success": true}` を返す
    - _要件: 5.1, 5.2, 5.3, 5.4, 5.7, 6.10_

  - [x] 6.3 PUT /classes/{classId} Lambda ハンドラーを実装する
    - パスパラメータ `classId`・リクエストボディから `className`・`startDate`・`endDate`・`password` を取得・バリデーションする
    - `startDate > endDate` の場合は HTTP 400 を返す
    - `UpdateItem` で既存レコードを上書き保存する（パスワードは再ハッシュ化）
    - 成功時に 200 + `{"success": true}` を返す
    - _要件: 5.6, 5.7, 6.10_

  - [ ]* 6.4 クラス管理 Lambda のユニットテストを書く
    - `backend/tests/test_classes.py` を作成する
    - 正常登録で 201 が返ることをテストする
    - 重複 Class_ID で 409 が返ることをテストする
    - DynamoDB は `moto` でモック化する
    - _要件: 5.2, 5.3, 6.10_

- [x] 7. チェックポイント - バックエンド全テストの確認
  - すべてのテストが通ることを確認する。疑問点があればユーザーに確認する。

- [x] 8. フロントエンド共通モジュールを実装する
  - [x] 8.1 `frontend/js/api.js` を実装する
    - `API_BASE_URL` 定数を設定可能な形式で定義する（コメントで「デプロイ後に API Gateway の URL に変更」と記載）
    - `signIn(role, id, password)`・`getQuestions(classId)`・`submitQuestion(classId, content, name)`・`submitAnswer(classId, questionNumber, answerContent)`・`getClasses(instructorId)`・`saveClass(instructorId, classData)` を実装する
    - 各関数は `fetch` API を使用し、HTTP エラー時は例外をスローする
    - URLリンク変換ユーティリティ `convertUrlsToLinks(text)` を実装する：テキスト中の URL を正規表現で検出し `<a href="..." target="_blank" rel="noopener noreferrer">` タグに変換する
    - _要件: 3.5, 4.3, 7.4_

  - [x] 8.2 `frontend/js/auth.js` を実装する
    - `saveSession(role, classId, instructorId)`・`getSession()`・`clearSession()` を `sessionStorage` を使用して実装する
    - `requireAuth(expectedRole)` を実装する：セッションが存在しない・ロールが一致しない場合は `index.html` へリダイレクトする
    - _要件: 1.4, 1.5, 2.11, 4.10_

  - [ ]* 8.3 `convertUrlsToLinks` 関数の Jest ユニットテストを書く
    - `frontend/tests/api.test.js` を作成する（Jest 使用）
    - URL を含むテキストが `<a>` タグに変換されることをテストする
    - URL 以外のテキストが変更されないことをテストする
    - 複数 URL が含まれる場合にすべて変換されることをテストする
    - _要件: 3.5, 4.3_

  - [ ]* 8.4 Property 3: テキスト中 URL のリンク変換プロパティテストを書く
    - **Property 3: テキスト中URLのリンク変換**
    - `@given(text_with_urls_strategy())` で URL を含む任意のテキストを生成する
    - 変換後にすべての URL が `<a href="..." target="_blank" rel="noopener noreferrer">` でラップされ、URL 以外のテキストが保持されることを検証する
    - Jest + `fast-check` を使用して `frontend/tests/api.property.test.js` に実装する
    - `@settings` 相当として `numRuns: 100` を設定する
    - **Validates: Requirements 3.5, 4.3**

  - [ ]* 8.5 Property 4: 空白文字列の入力拒否プロパティテストを書く
    - **Property 4: 空白文字列の入力拒否**
    - `@given(st.text(alphabet=string.whitespace, min_size=1))` で空白のみの文字列を生成する
    - バリデーション関数が空白のみの入力を無効と判定することを検証する
    - `backend/tests/test_validation.py` に実装する（または対応する `questions/app.py` の validate 関数に対して）
    - `@settings(max_examples=100)` を設定する
    - **Validates: Requirements 2.5**

  - [ ]* 8.6 Property 5: 文字数超過の入力拒否プロパティテストを書く
    - **Property 5: 文字数超過の入力拒否**
    - `@given(st.text(min_size=501))` で 501 文字以上の文字列を生成する
    - バリデーション関数が 501 文字以上の入力を無効と判定することを検証する
    - `backend/tests/test_validation.py` に実装する
    - `@settings(max_examples=100)` を設定する
    - **Validates: Requirements 2.6**

- [x] 9. フロントエンド HTML/CSS を実装する
  - [x] 9.1 `frontend/css/style.css` を作成する
    - サインインページ・受講者ページ・インストラクターページ・クラス登録ページ共通のスタイルを定義する
    - フォーム・ボタン・エラーメッセージ・質問一覧カードのスタイルを含める
    - レスポンシブ対応（min-width ベース）を考慮する
    - _要件: 7.3_

  - [x] 9.2 `frontend/index.html`（サインインページ）を作成する
    - ロール選択 UI（受講者 / インストラクター のラジオボタンまたはボタン）を実装する
    - 受講者向けフォーム（Class_ID・パスワード）とインストラクター向けフォーム（インストラクターID・パスワード）を実装する（ロール選択に応じて表示切り替え）
    - `frontend/js/signin.js` を読み込む
    - _要件: 1.1, 1.2, 1.3_

  - [x] 9.3 `frontend/learner.html`（受講者メインページ）を作成する
    - 質問・コメント入力フォーム（テキストエリア・名前入力・送信ボタン）を実装する
    - 質問・回答一覧表示エリアを実装する
    - サインアウトボタンをページ右上に配置する
    - `frontend/js/learner.js` を読み込む
    - _要件: 2.1, 2.2, 2.3, 2.4_

  - [x] 9.4 `frontend/instructor.html`（インストラクターメインページ）を作成する
    - 質問・回答一覧表示エリアを実装する
    - 質問選択時に表示する回答入力欄（テキストエリア・送信ボタン）を実装する
    - サインアウトボタンをページ右上に配置する
    - `frontend/js/instructor.js` を読み込む
    - _要件: 4.1, 4.2, 4.4_

  - [x] 9.5 `frontend/class-registration.html`（クラス登録ページ）を作成する
    - クラス登録フォーム（クラスID・クラス名称・開始日・最終日・パスワード・登録ボタン）を実装する
    - 登録済みクラス一覧表示エリアを実装する
    - `frontend/js/class-registration.js` を読み込む
    - _要件: 5.1, 5.5_

- [x] 10. フロントエンドページロジックを実装する
  - [x] 10.1 `frontend/js/signin.js` を実装する
    - ロール選択時に対応するフォームを表示する（要件 1.1〜1.3）
    - サインイン送信時に `api.js` の `signIn` を呼び出し、成功時に `auth.js` でセッションを保存してロールに応じてページ遷移する
    - インストラクターサインイン成功後に「質問・回答一覧」または「クラス登録」の選択 UI を表示する（要件 1.5, 1.8, 1.9, 1.10, 1.11）
    - HTTP 401 受信時に日本語エラーメッセージを表示しフォームを保持する（要件 1.6, 1.7）
    - _要件: 1.1〜1.11_

  - [x] 10.2 `frontend/js/learner.js` を実装する
    - ページ読み込み時に `auth.js` で認証確認・`api.js` の `getQuestions` で質問一覧を取得して描画する
    - 各質問の `content`・`answer` を `convertUrlsToLinks` でリンク変換して表示する（要件 3.5）
    - 未回答質問に「未回答」テキストを表示する（要件 3.4）
    - 送信ボタンクリック時にバリデーション（空欄・文字数超過）→ 確認ダイアログ → `submitQuestion` 呼び出し → 一覧更新 → フォームクリアのフローを実装する
    - バリデーションエラー・通信エラー時に日本語メッセージを表示する（要件 2.5, 2.6, 2.10）
    - サインアウトボタンで `clearSession` 後に `index.html` へ遷移する
    - _要件: 2.1〜2.11, 3.1〜3.6_

  - [x] 10.3 `frontend/js/instructor.js` を実装する
    - ページ読み込み時に `auth.js` で認証確認・`api.js` の `getQuestions` で質問一覧を取得して描画する
    - 各質問の `content`・`answer` を `convertUrlsToLinks` でリンク変換して新しいタブで開くよう表示する（要件 4.3）
    - 質問選択時に回答入力欄を表示する（要件 4.4）
    - 回答送信時にバリデーション → 確認ダイアログ → `submitAnswer` 呼び出し → 一覧更新のフローを実装する
    - バリデーションエラー・通信エラー時に日本語メッセージを表示する（要件 4.5, 4.9）
    - サインアウトボタンで `clearSession` 後に `index.html` へ遷移する
    - _要件: 4.1〜4.10_

  - [x] 10.4 `frontend/js/class-registration.js` を実装する
    - ページ読み込み時に `auth.js` で認証確認・`api.js` の `getClasses` でクラス一覧を取得して描画する
    - 登録ボタンクリック時にバリデーション（必須項目・日付範囲）→ `saveClass` 呼び出し → 一覧更新のフローを実装する
    - 既存クラス選択時に入力フォームへ値を反映する（要件 5.6）
    - 重複エラー（409）・日付範囲エラー・必須項目エラー時に日本語メッセージを表示する（要件 5.3, 5.4, 5.7）
    - _要件: 5.1〜5.7_

  - [ ]* 10.5 Property 6: 日付範囲バリデーションプロパティテストを書く
    - **Property 6: 日付範囲バリデーション**
    - `@given(date_pair_strategy(start_after_end=True))` で `startDate > endDate` のペアを生成する
    - クラス登録フォームのバリデーション関数がエラーと判定し、API への送信が行われないことを検証する
    - `backend/tests/test_validation.py` に実装する
    - `@settings(max_examples=100)` を設定する
    - **Validates: Requirements 5.7**

- [x] 11. チェックポイント - 全テストの確認
  - すべてのバックエンドテスト（pytest）とフロントエンドテスト（Jest）が通ることを確認する。疑問点があればユーザーに確認する。

- [ ] 12. E2E テストを実装する
  - [ ]* 12.1 Playwright を使用した E2E テストを書く
    - `e2e/` ディレクトリに Playwright テストを作成する
    - Learner サインイン正常フロー（ログイン→メインページ遷移）をテストする
    - Learner 質問送信フロー（フォーム入力→確認ダイアログ→送信→一覧反映）をテストする
    - Instructor 回答フロー（ログイン→質問選択→回答入力→送信）をテストする
    - クラス登録フロー（クラス情報入力→登録→一覧表示）をテストする
    - バリデーションエラー表示（空欄送信時のエラーメッセージ）をテストする
    - _要件: 1.4, 1.5, 2.7, 2.8, 4.6, 4.7, 5.2_

- [x] 13. 最終チェックポイント - 全テストの確認
  - すべてのテストが通ることを確認する。疑問点があればユーザーに確認する。

---

## 注意事項

- `*` が付いたサブタスクはオプションです。MVP を優先する場合はスキップできます
- 各タスクは対応する要件番号を参照しており、トレーサビリティを確保しています
- チェックポイントで段階的に動作確認を行い、問題を早期に発見します
- プロパティテストは `hypothesis` ライブラリ（バックエンド）と `fast-check`（フロントエンド）を使用します
- ユニットテストはプロパティテストの補完として具体的な境界値・エラー条件を検証します
- SAM テンプレートは `sam validate` でスキーマ検証を実施してください

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2", "6.1", "6.2", "6.3", "8.1", "8.2", "9.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.3", "3.4", "3.5", "5.1", "6.4", "8.3", "8.4", "8.5", "8.6", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 3, "tasks": ["5.2", "5.3", "10.1", "10.2", "10.3", "10.4"] },
    { "id": 4, "tasks": ["10.5", "12.1"] }
  ]
}
```
