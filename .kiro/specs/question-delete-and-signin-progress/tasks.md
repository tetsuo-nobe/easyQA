# 実装計画: question-delete-and-signin-progress

## 概要

本実装計画は以下の2機能を段階的にコードへ反映するためのタスク一覧です。

1. **質問の論理削除**: 削除用パスワードによる質問の論理削除機能（バックエンド API + フロントエンド）
2. **サインイン処理中表示**: サインイン中の「処理中です」メッセージ表示と二重送信防止

実装言語: **Python**（バックエンド）、**JavaScript**（フロントエンド）

---

## タスク

- [x] 1. SAM テンプレートの更新（インフラ設定）
  - [x] 1.1 `backend/template.yaml` を修正して DELETE イベント・UpdateItem 権限・CORS を追加する
    - `AllowMethods` に `DELETE` を追加
    - `QuestionsFunction` の `Policies` に `dynamodb:UpdateItem` を追加
    - `QuestionsFunction` の `Events` に `DeleteQuestion` イベント（`/questions/{questionNumber}`, `DELETE`）を追加
    - _要件: 2.1_

- [x] 2. バックエンド: パスワードハッシュユーティリティの実装
  - [x] 2.1 `backend/functions/questions/app.py` にハッシュ化・照合関数を追加する
    - `hash_delete_password(password: str) -> str` を `hashlib`, `hmac`, `secrets` を使って実装
    - `verify_delete_password(password: str, stored_hash: str) -> bool` を `hmac.compare_digest` による定数時間比較で実装
    - 不正なハッシュ形式は例外を発生させず `False` を返す
    - _要件: NFR-1, NFR-2, NFR-4_

  - [ ]* 2.2 Property 6: 削除用パスワードのハッシュラウンドトリップのプロパティテストを書く
    - **Property 6: 削除用パスワードのハッシュラウンドトリップ**
    - `hypothesis` の `@given(valid_delete_password)` ストラテジーを使用
    - 正しいパスワードで `verify_delete_password` が `True` を返すことを確認
    - 1文字違いのパスワードで `False` を返すことを確認
    - **Validates: Requirements 1.4, NFR-1, NFR-4**

- [x] 3. バックエンド: POST /questions の削除用パスワード対応
  - [x] 3.1 `handle_post_questions` を修正して `deletePassword` フィールドのバリデーションとハッシュ化保存を実装する
    - リクエストボディから `deletePassword` を取得
    - 空欄の場合は HTTP 400「削除用パスワードを入力してください。」を返す
    - `re.fullmatch(r'[A-Za-z0-9]{8}', delete_password)` が失敗する場合は HTTP 400「削除用パスワードは半角英数字8文字で入力してください。」を返す
    - バリデーション通過後に `hash_delete_password` でハッシュ化し `deletePasswordHash` として `PutItem` に含める
    - `deletePassword` は保存しない
    - _要件: 1.2, 1.3, 1.4, 1.5_

  - [ ]* 3.2 Property 1・2: 削除用パスワードバリデーションのプロパティテストを書く
    - **Property 1: 削除用パスワードの空欄バリデーション**
    - **Property 2: 削除用パスワードの形式バリデーション**
    - `hypothesis` で空白文字列・短い文字列・長い文字列・記号含む文字列・全角含む文字列を生成して検証
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 3.3 `handle_post_questions` のユニットテストを書く
    - `deletePassword` 空欄で 400 返却のテスト
    - `deletePassword` 形式不正で 400 返却のテスト
    - 正常送信で `deletePasswordHash` が保存されるテスト
    - _要件: 1.2, 1.3, 1.4_

- [x] 4. バックエンド: DELETE /questions/{questionNumber} の実装
  - [x] 4.1 `handle_delete_question(event)` 関数を `backend/functions/questions/app.py` に追加する
    - `pathParameters` から `questionNumber` を取得・整数変換（失敗時 400）
    - リクエストボディから `classId` と `deletePassword` を取得
    - `classId` または `deletePassword` 欠損時に HTTP 400 を返す
    - `table.get_item` で対象レコードを取得
    - レコードが存在しないまたは `deleted: True` の場合は HTTP 404 を返す
    - `verify_delete_password` でパスワード照合し、不一致は HTTP 401 を返す
    - `table.update_item` で `deleted = True` を設定し HTTP 200 を返す
    - _要件: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 4.2 `lambda_handler` のルーティングに `DELETE` メソッドのハンドリングを追加する
    - `http_method == "DELETE"` の場合に `handle_delete_question(event)` を呼び出す
    - _要件: 2.1_

  - [ ]* 4.3 Property 3: 必須フィールド欠損時の 400 返却のプロパティテストを書く
    - **Property 3: 必須フィールド欠損時の 400 返却**
    - `classId` または `deletePassword` の任意の欠損パターンで HTTP 400 が返ることを確認
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 4.4 Property 4: 操作不能な質問への DELETE で 404 返却のプロパティテストを書く
    - **Property 4: 操作不能な質問への DELETE で 404 返却**
    - 存在しない `questionNumber` と `deleted: true` 設定済みレコードの両パターンで HTTP 404 を確認
    - **Validates: Requirements 2.4, 2.8**

  - [ ]* 4.5 Property 5: 論理削除の永続性と物理削除の禁止のプロパティテストを書く
    - **Property 5: 論理削除の永続性と物理削除の禁止**
    - DELETE 成功後に `GetItem` でレコードが存在し `deleted: True` であることを確認
    - `moto` を使用して DynamoDB をモック化
    - **Validates: Requirements 2.6, 2.7**

  - [ ]* 4.6 `handle_delete_question` のユニットテストを書く
    - `classId` 欠損で 400 / `deletePassword` 欠損で 400
    - 存在しない質問で 404 / `deleted=True` の質問で 404
    - パスワード不一致で 401
    - 正常削除で `deleted=True` が設定されレコードが残存するテスト
    - _要件: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 5. バックエンド: GET /questions の削除済み質問フィルタリング
  - [x] 5.1 `handle_get_questions` を修正して `deleted: True` のアイテムを除外し `deletePasswordHash` をレスポンスから除去する
    - `item.get("deleted", False)` が `True` のアイテムを `continue` でスキップ
    - レスポンスの質問オブジェクトに `deletePasswordHash` を含めない
    - `deleted` 属性がない既存レコードは有効として扱う（後方互換性確保）
    - _要件: 3.1, 3.2, 3.3, NFR-3_

  - [ ]* 5.2 Property 7: GET レスポンスの安全なフィルタリングのプロパティテストを書く
    - **Property 7: GET レスポンスの安全なフィルタリング**
    - `deleted: True` と `deleted: False` が混在するリストに対してフィルタリング後のレスポンスを検証
    - `deletePasswordHash` がどのアイテムにも含まれないことを確認
    - **Validates: Requirements 3.1, 3.2, NFR-3**

  - [ ]* 5.3 `handle_get_questions` のユニットテストを書く
    - `deleted=True` の質問が結果に含まれないテスト
    - `deleted` 属性なしの質問が結果に含まれるテスト
    - レスポンスに `deletePasswordHash` が含まれないテスト
    - _要件: 3.1, 3.2, NFR-3_

- [x] 6. チェックポイント - バックエンドのテストが全て通ることを確認する
  - 全テストが通ることを確認する。問題があればユーザーに確認する。

- [x] 7. フロントエンド: api.js の更新
  - [x] 7.1 `frontend/js/api.js` の `submitQuestion` 関数に `deletePassword` 引数を追加してリクエストボディに含める
    - 関数シグネチャを `submitQuestion(classId, content, name, deletePassword)` に変更
    - `body: JSON.stringify({ classId, content, name, deletePassword })` に更新
    - _要件: 1.4_

  - [x] 7.2 `frontend/js/api.js` に `deleteQuestion(classId, questionNumber, deletePassword)` 関数を追加する
    - `DELETE ${API_BASE_URL}/questions/${questionNumber}` へのリクエストを実装
    - レスポンスが `ok` でない場合は `error.status` を付与してスローする
    - _要件: 2.1, 5.2_

  - [ ]* 7.3 `deleteQuestion` のユニットテスト（Jest または手動テスト）を書く
    - 正常削除で HTTP DELETE リクエストを送信するテスト
    - 401 レスポンスで適切なエラーオブジェクトをスローするテスト
    - _要件: 2.1, 5.2_

- [x] 8. フロントエンド: learner.html の更新
  - [x] 8.1 `frontend/learner.html` の質問送信フォームに削除用パスワード入力フィールドを追加する
    - `<input type="password" id="question-delete-password" maxlength="8">` を含む `form-group` div を追加
    - `<label for="question-delete-password">削除用パスワード（必須・半角英数字8文字）</label>` を追加
    - _要件: 1.1_

  - [x] 8.2 `frontend/learner.html` に削除処理中メッセージ要素を追加する
    - `<div id="delete-processing" class="message message--processing hidden">処理中です</div>` を追加
    - _要件: 5.3_

- [x] 9. フロントエンド: index.html の更新
  - [x] 9.1 `frontend/index.html` にサインイン処理中メッセージ要素を追加する
    - `<div id="signin-processing" class="message message--processing hidden">処理中です</div>` を受講者・インストラクター両フォームから共通参照できる位置に追加
    - _要件: 6.1_

- [x] 10. フロントエンド: css/style.css の更新
  - [x] 10.1 `frontend/css/style.css` に処理中メッセージと削除リンクのスタイルを追加する
    - `.message--processing` クラスのスタイル（表示用）を追加
    - `.question-card__delete-link` のスタイルを追加（ボタンのリセットと削除リンク外観）
    - _要件: 4.1, 5.3, 6.1_

- [x] 11. フロントエンド: learner.js の更新
  - [x] 11.1 `frontend/js/learner.js` の `handleSubmitQuestion` を修正して削除用パスワードのバリデーションと送信を実装する
    - `document.getElementById('question-delete-password')` から値を取得
    - 空欄の場合に「削除用パスワードを入力してください。」を表示して送信を中断
    - `[A-Za-z0-9]{8}` 正規表現チェックに失敗した場合に「削除用パスワードは半角英数字8文字で入力してください。」を表示して中断
    - `submitQuestion` の呼び出しに `deletePassword` を追加
    - _要件: 1.1, 1.2, 1.3_

  - [x] 11.2 `frontend/js/learner.js` の `renderQuestions` を修正して各質問カードに削除ボタンを追加し、イベントリスナーを登録する
    - `<button class="question-card__delete-link" data-question-number="${q.questionNumber}" type="button">削除</button>` を質問カードヘッダーに追加
    - レンダリング後に `.question-card__delete-link` に `click` イベントリスナーを登録して `handleDeleteQuestion` を呼び出す
    - _要件: 4.1, 4.2, 4.3_

  - [x] 11.3 `frontend/js/learner.js` に `handleDeleteQuestion(classId, questionNumber)` 関数を実装する
    - `prompt()` で削除用パスワードを取得し、`null`（キャンセル）の場合は即リターン
    - `delete-processing` 要素を表示し、全 `.question-card__delete-link` を `disabled` にする
    - `deleteQuestion` を呼び出し、成功時は `loadQuestions` で一覧を再描画
    - 401 エラー時は「削除用パスワードが正しくありません。」を表示し、その他エラー時は「削除に失敗しました。」を表示
    - `finally` ブロックで `delete-processing` を非表示化
    - エラー時のみ全削除ボタンを再 `enabled` にする
    - _要件: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

  - [ ]* 11.4 `handleDeleteQuestion` のユニットテストを書く
    - `prompt()` キャンセル時に API を呼ばないテスト
    - 401 時にエラーメッセージを表示するテスト
    - _要件: 5.5, 5.8_

- [x] 12. フロントエンド: signin.js の更新
  - [x] 12.1 `frontend/js/signin.js` の受講者フォームの `submit` ハンドラーに処理中表示と `disabled` 制御を追加する
    - `document.getElementById('signin-processing')` で処理中要素を取得
    - `learnerForm.querySelector('button[type="submit"]')` でボタンを取得
    - API 呼び出し前に `processingEl.classList.remove('hidden')` と `submitBtn.disabled = true` を設定
    - `catch` ブロックで `processingEl.classList.add('hidden')` と `submitBtn.disabled = false` を設定
    - _要件: 6.1, 6.2, 6.3, 6.6, 6.7, 6.8_

  - [x] 12.2 `frontend/js/signin.js` のインストラクターフォームの `submit` ハンドラーにも同じ処理中表示と `disabled` 制御を適用する
    - `instructorForm.querySelector('button[type="submit"]')` でボタンを取得
    - 受講者フォームと同一のパターンで実装
    - _要件: 6.1, 6.2, 6.3, 6.6, 6.7, 6.8_

  - [ ]* 12.3 signin 処理中表示のユニットテストを書く
    - クリック直後に processing 表示・ボタン disabled になるテスト
    - 失敗時に processing 非表示・ボタン再有効化されるテスト
    - **Validates: Property 8: Requirements 6.1, 6.2**

- [x] 13. 最終チェックポイント - 全テストが通ることを確認する
  - 全テストが通ることを確認する。問題があればユーザーに確認する。

---

## Notes

- `*` が付いたタスクはオプションであり、MVP を優先する場合はスキップ可能
- 各タスクは特定の要件に対してトレーサビリティを持つ
- チェックポイントにより段階的な検証が行われる
- プロパティテストは `hypothesis` ライブラリを使用（`pip install hypothesis`）
- DynamoDB のモックには `moto` ライブラリを使用（`pip install moto`）
- バックエンドのテストは `backend/functions/questions/` ディレクトリ配下に配置する
- プロパティテストは普遍的な正確性プロパティを検証し、ユニットテストは具体的な境界値・エラー条件を検証する

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "9.1", "10.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "7.1", "7.2", "8.1", "8.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1", "4.2", "7.3"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "4.6", "5.1", "11.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "11.2", "12.1", "12.2"] },
    { "id": 6, "tasks": ["11.3"] },
    { "id": 7, "tasks": ["11.4", "12.3"] }
  ]
}
```
