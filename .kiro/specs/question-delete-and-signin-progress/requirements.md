# 要件定義書

## はじめに

本書は easyQA アプリケーションに追加する2つの機能に関する要件を定義する。

**機能1: 質問の論理削除**
受講者が送信した質問を論理削除できる機能。データベースからのレコード削除は行わず、`deleted` 属性（Boolean）を付与することで削除状態を管理する。削除操作は削除用パスワードによって保護される。

**機能2: サインイン処理中の表示**
サインインボタンをクリックしてからサインイン完了（またはエラー）までの間、処理中であることをユーザーに伝え、二重送信を防ぐ機能。

---

## 用語集

- **Learner（受講者）**: easyQA にサインインして質問を送信するユーザー
- **Instructor（インストラクター）**: easyQA にサインインして回答を送信するユーザー
- **Questions_API**: バックエンドの質問管理 Lambda 関数（`backend/functions/questions/app.py`）
- **Questions_Table**: DynamoDB の質問テーブル。PK=classId(S)、SK=questionNumber(N)
- **Delete_Password**: 質問送信時に受講者が設定する削除用パスワード。半角英数字8文字固定
- **Delete_Password_Hash**: Delete_Password を PBKDF2-SHA256（`hashlib`、イテレーション数 260000）でハッシュ化した値
- **Logical_Delete**: レコードを物理削除せず、`deleted` 属性を `true` に設定して削除済み状態にする操作
- **Signin_Form**: `index.html` のサインインフォーム（受講者フォーム・インストラクターフォームの両方）
- **Processing_Message**: サインイン処理中にページに表示する「処理中です」というメッセージ
- **Signin_Button**: Signin_Form 内のサインイン送信ボタン
- **Delete_Button**: 質問カード内の「削除」リンク
- **Delete_Processing_Message**: 削除処理中にページに表示する「処理中です」というメッセージ

---

## 要件

### 要件1: 質問送信時の削除用パスワード入力

**ユーザーストーリー:** 受講者として、質問送信時に削除用パスワードを設定することで、後から自分の質問を削除できるようにしたい。

#### 受入条件

1. THE Learner SHALL 質問送信フォームに削除用パスワード入力フィールドを入力する（必須項目）
2. WHEN 受講者が削除用パスワード入力フィールドを空欄のまま質問送信フォームを送信した場合、THE Signin_Form SHALL 「削除用パスワードを入力してください。」というエラーメッセージを表示する
3. WHEN 受講者が半角英数字8文字以外の値を削除用パスワードとして入力した場合、THE Signin_Form SHALL 「削除用パスワードは半角英数字8文字で入力してください。」というエラーメッセージを表示する
4. WHEN 削除用パスワードのバリデーションが成功した場合、THE Questions_API SHALL Delete_Password_Hash を生成して Questions_Table に `deletePasswordHash` 属性として保存する
5. WHEN 質問が正常に送信された場合、THE Questions_API SHALL Delete_Password を含まないレスポンスを返す

---

### 要件2: 質問の論理削除 API

**ユーザーストーリー:** 受講者として、自分が送信した質問を削除したいので、削除用パスワードを使って質問を論理削除できるようにしたい。

#### 受入条件

1. THE Questions_API SHALL `DELETE /questions/{questionNumber}` エンドポイントを提供する
2. WHEN `DELETE /questions/{questionNumber}` リクエストのボディに `classId` が含まれていない場合、THE Questions_API SHALL HTTP 400 とエラーメッセージ「classId は必須です。」を返す
3. WHEN `DELETE /questions/{questionNumber}` リクエストのボディに `deletePassword` が含まれていない場合、THE Questions_API SHALL HTTP 400 とエラーメッセージ「削除用パスワードは必須です。」を返す
4. WHEN 指定された `classId` と `questionNumber` に対応する質問が Questions_Table に存在しない場合、THE Questions_API SHALL HTTP 404 とエラーメッセージ「質問が見つかりません。」を返す
5. WHEN 指定された `deletePassword` が Questions_Table に保存された Delete_Password_Hash と一致しない場合、THE Questions_API SHALL HTTP 401 とエラーメッセージ「削除用パスワードが正しくありません。」を返す
6. WHEN `deletePassword` の検証が成功した場合、THE Questions_API SHALL Questions_Table の対象レコードに `deleted: true` を設定して HTTP 200 を返す
7. THE Questions_API SHALL Questions_Table からレコードを物理削除しない
8. WHEN 対象の質問がすでに `deleted: true` の場合、THE Questions_API SHALL HTTP 404 とエラーメッセージ「質問が見つかりません。」を返す

---

### 要件3: 論理削除された質問の除外

**ユーザーストーリー:** 受講者・インストラクターとして、削除された質問は一覧に表示されないようにしたい。

#### 受入条件

1. WHEN `GET /questions?classId=X` リクエストを処理する場合、THE Questions_API SHALL `deleted: true` の質問を結果リストから除外する
2. WHILE 質問に `deleted` 属性が存在しない場合、THE Questions_API SHALL その質問を削除されていないものとして扱い一覧に含める
3. THE Questions_API SHALL 受講者からのリクエストとインストラクターからのリクエストを区別せず、同一の除外ルールを適用する

---

### 要件4: 質問カードへの削除リンク表示

**ユーザーストーリー:** 受講者として、各質問カードに削除リンクが表示されることで、自分の質問を削除する操作に気づけるようにしたい。

#### 受入条件

1. THE Learner SHALL 質問一覧の各質問カードに「削除」リンクが表示される状態を確認できる
2. WHERE 質問カードが回答済みの質問である場合、THE Learner SHALL 「削除」リンクが表示される状態を確認できる
3. THE Learner SHALL 「削除」リンクをクリックすることができる

---

### 要件5: フロントエンドからの質問削除操作

**ユーザーストーリー:** 受講者として、削除リンクをクリックして削除用パスワードを入力することで、自分の質問を削除できるようにしたい。

#### 受入条件

1. WHEN 受講者が質問カードの「削除」リンクをクリックした場合、THE Learner SHALL 削除用パスワードの入力を求めるプロンプトダイアログが表示される
2. WHEN 受講者がプロンプトダイアログに削除用パスワードを入力してOKを押した場合、THE Learner SHALL 削除 API が呼び出される
3. WHEN 受講者がプロンプトダイアログに削除用パスワードを入力してOKを押した場合、THE Learner SHALL Delete_Processing_Message「処理中です」が画面に表示される
4. WHEN 受講者がプロンプトダイアログに削除用パスワードを入力してOKを押した場合、THE Learner SHALL Delete_Button が操作不能な状態になる
5. WHEN 受講者がプロンプトダイアログをキャンセルした場合、THE Learner SHALL 削除処理が行われないまま通常の状態に戻る
6. WHEN 削除 API が HTTP 200 を返した場合、THE Learner SHALL 質問一覧が自動的に再取得・再描画される
7. WHEN 削除 API が HTTP 200 を返した場合、THE Learner SHALL Delete_Processing_Message を非表示にする
8. WHEN 削除 API が HTTP 401 を返した場合、THE Learner SHALL 「削除用パスワードが正しくありません。」というエラーメッセージが表示される
9. WHEN 削除 API が HTTP 401 を返した場合、THE Learner SHALL Delete_Processing_Message を非表示にし、Delete_Button を再度操作可能な状態に戻す
10. IF 削除 API の呼び出しに失敗した場合、THEN THE Learner SHALL 「削除に失敗しました。」というエラーメッセージが表示される
11. IF 削除 API の呼び出しに失敗した場合、THEN THE Learner SHALL Delete_Processing_Message を非表示にし、Delete_Button を再度操作可能な状態に戻す

---

### 要件6: サインイン処理中の表示と二重送信防止

**ユーザーストーリー:** 利用者として、サインインボタンをクリックした後に処理中であることが視覚的に分かるようにしたいので、「処理中です」メッセージとボタンの非活性化によってフィードバックが得られるようにしたい。

#### 受入条件

1. WHEN 受講者またはインストラクターがサインインボタンをクリックした場合、THE Signin_Form SHALL Processing_Message「処理中です」を画面に表示する
2. WHEN 受講者またはインストラクターがサインインボタンをクリックした場合、THE Signin_Form SHALL Signin_Button を `disabled` 状態に設定する
3. WHILE Signin_Button が `disabled` 状態である場合、THE Signin_Form SHALL Signin_Button への追加クリックを受け付けない（ブラウザ標準の `disabled` 挙動）
4. WHEN サインインが成功した場合、THE Signin_Form SHALL Processing_Message を非表示にする
5. WHEN サインインが成功した場合、THE Signin_Form SHALL Signin_Button の `disabled` 状態を解除する
6. WHEN サインインが失敗した場合、THE Signin_Form SHALL Processing_Message を非表示にする
7. WHEN サインインが失敗した場合、THE Signin_Form SHALL Signin_Button の `disabled` 状態を解除する
8. THE Signin_Form SHALL 受講者フォームとインストラクターフォームの両方に対して同一の処理中表示ルールを適用する

---

## 非機能要件

### セキュリティ

1. THE Questions_API SHALL Delete_Password を Questions_Table に平文で保存しない
2. THE Questions_API SHALL Delete_Password_Hash の生成に PBKDF2-SHA256（Python 標準ライブラリ `hashlib`、イテレーション数 260000）を使用する
3. THE Questions_API SHALL `GET /questions` レスポンスに `deletePasswordHash` を含めない
4. THE Questions_API SHALL パスワード検証に定数時間比較を適用し、タイミング攻撃を防止する

### データ整合性

1. THE Questions_API SHALL 論理削除操作において Questions_Table から物理的なレコード削除を行わない
2. THE Questions_API SHALL Logical_Delete 後も Questions_Table 内のすべての属性（`content`、`answer`、`deletePasswordHash` 等）を保持する
