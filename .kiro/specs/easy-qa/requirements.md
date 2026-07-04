# 要件定義書

## はじめに

easyQA は、トレーニングの受講者がリアルタイムで質問やコメントを送信し、インストラクターが回答できるWebアプリケーションです。受講者とインストラクターの2種類のユーザーロールを持ち、クラス単位で質問・回答を管理します。フロントエンドはフレームワーク不使用のシンプルなSPA、バックエンドはAmazon API Gateway + AWS Lambda（Python 3.13）、データストアはAmazon DynamoDBで構成されます。

## 用語集

- **System**: easyQAアプリケーション全体
- **Frontend**: Reactなどのフレームワークを使用しないシンプルなSPA（HTML/CSS/JavaScript）
- **Backend**: Amazon API Gateway の REST API と Python 3.13 の Lambda 関数
- **DynamoDB**: データの永続化に使用する Amazon DynamoDB（オンデマンドキャパシティモード）
- **Learner**: トレーニングを受講するユーザー
- **Instructor**: トレーニングを実施するユーザー
- **Class**: 特定のトレーニングセッションを表す単位。クラスID、クラス名称、開始日、最終日、パスワードで構成される
- **Class_ID**: クラスを一意に識別する文字列。同じクラスの受講者は全員同じClass_IDを使用する
- **Question**: 受講者が送信する質問またはコメント
- **Answer**: インストラクターが質問に対して入力する回答
- **SignIn_Page**: ロール選択・認証情報入力を行うページ
- **Learner_Main_Page**: 受講者がサインイン後に表示されるメインページ
- **Instructor_Main_Page**: インストラクターがサインイン後に表示されるメインページ
- **Class_Registration_Page**: インストラクターがクラスを登録・管理するページ
- **SAM**: AWS Serverless Application Model。バックエンドのデプロイに使用する

---

## 要件

### 要件1: ユーザーロール選択とサインイン

**ユーザーストーリー:** ユーザーとして、受講者またはインストラクターとしてサインインしたい。それにより、自分のロールに適した操作が行えるようになる。

#### 受入条件

1. THE System SHALL SignIn_Page にて受講者（Learner）またはインストラクター（Instructor）のロール選択UIを表示する
2. WHEN Learner ロールが選択された場合、THE System SHALL Class_ID（最大50文字）とクラスパスワード（最大100文字）の入力フォームを表示する
3. WHEN Instructor ロールが選択された場合、THE System SHALL インストラクターID（最大50文字）とインストラクターパスワード（最大100文字）の入力フォームを表示する
4. WHEN Learner が正しいClass_IDと正しいクラスパスワードを入力して送信した場合、THE System SHALL 3秒以内に Learner_Main_Page へ遷移する
5. WHEN Instructor が正しいインストラクターIDと正しいインストラクターパスワードを入力して送信した場合、THE System SHALL 3秒以内に「質問・回答一覧」または「クラス登録」のいずれかを選択するUIを表示する
6. WHEN Instructor が「質問・回答一覧」または「クラス登録」の選択画面を表示している場合、THE System SHALL サインアウトボタンを表示する
7. WHEN サインアウトボタンがクリックされた場合、THE System SHALL セッションを終了してSignIn_Page へ遷移する
8. WHEN Instructor がメニュー画面に戻ってきた場合（Instructor_Main_Page またはClass_Registration_Page の「メニューに戻る」ボタンをクリックした場合）、THE System SHALL セッションを保持したまま SignIn_Page のアクション選択UIを再表示する
9. IF Class_IDまたはクラスパスワードが誤っていた場合、THEN THE System SHALL 認証エラーメッセージを日本語で表示し、入力フォームをクリアせずに SignIn_Page に留まる
10. IF インストラクターIDまたはインストラクターパスワードが誤っていた場合、THEN THE System SHALL 認証エラーメッセージを日本語で表示し、入力フォームをクリアせずに SignIn_Page に留まる
11. WHEN Instructor が「質問・回答一覧」を選択した場合、THE System SHALL 対象Class_IDの入力フォームを表示する
12. WHEN Instructor が対象Class_IDを入力して確定した場合、THE System SHALL 3秒以内に Instructor_Main_Page へ遷移する
13. IF Instructor が存在しないClass_IDを入力した場合、THEN THE System SHALL クラスが見つからない旨のエラーメッセージを日本語で表示し、入力フォームに留まる
14. WHEN Instructor が「クラス登録」を選択した場合、THE System SHALL 3秒以内に Class_Registration_Page へ遷移する

---

### 要件2: 受講者メインページ（質問・コメント送信）

**ユーザーストーリー:** 受講者として、質問やコメントを送信したい。それにより、トレーニング中にインストラクターへ疑問を伝えられるようになる。

#### 受入条件

1. THE Learner_Main_Page SHALL ページ上部に質問・コメント入力フォームを表示する
2. THE Learner_Main_Page SHALL ページ下部に質問・回答一覧を最新順・最大100件表示する
3. THE Learner_Main_Page SHALL ページ右上にサインアウトボタンを表示する
4. THE 入力フォーム SHALL 質問またはコメントの入力欄（必須・最大500文字）と名前の入力欄（任意・最大50文字）と送信ボタンを含む
5. IF 質問またはコメントが空欄のまま送信ボタンがクリックされた場合、THEN THE System SHALL 入力必須エラーメッセージを日本語で表示し、送信を中断する
6. IF 質問またはコメントが500文字を超えている場合、THEN THE System SHALL 文字数超過エラーメッセージを日本語で表示し、送信を中断する
7. WHEN 送信ボタンがクリックされ、かつ質問またはコメントが入力されている場合、THE System SHALL 入力内容の確認ダイアログ（OKボタンとキャンセルボタンを含む）を表示する
8. WHEN 確認ダイアログで OK がクリックされた場合、THE System SHALL 質問データをBackendへ送信し、質問・回答一覧の先頭に追加した後、入力フォームをクリアする
9. WHEN 確認ダイアログで キャンセル がクリックされた場合、THE System SHALL ダイアログを閉じて入力フォームの状態を保持したまま編集を継続できる状態に戻る
10. IF Backend への送信が失敗した場合、THEN THE System SHALL 送信失敗エラーメッセージを日本語で表示し、入力内容を保持する
11. WHEN サインアウトボタンがクリックされた場合、THE System SHALL セッションを終了してSignIn_Page へ遷移する

---

### 要件3: 受講者向け質問・回答一覧表示

**ユーザーストーリー:** 受講者として、自分のクラスの質問と回答の一覧を確認したい。それにより、他の受講者の質問や回答から学べるようになる。

#### 受入条件

1. THE 質問・回答一覧 SHALL サインイン時に使用したClass_IDに紐づく質問と回答のみを表示する
2. THE 質問・回答一覧 SHALL 質問を提出日時の降順に表示する
3. THE 質問・回答一覧 SHALL 各質問について、質問番号（連番）・提出日時・質問内容・回答内容を表示する
4. WHEN 質問に対する回答が存在しない場合、THE System SHALL 回答欄に未回答であることを示すテキスト（例：「未回答」）を表示する
5. WHEN 質問または回答のテキストにURLが含まれる場合、THE System SHALL そのURLをクリック可能なハイパーリンクとして表示する
6. WHEN ページを再読み込みした際に、Instructor が質問に回答を追加または更新していた場合、THE System SHALL 受講者の質問・回答一覧に最新の回答内容を反映する

---

### 要件4: インストラクターによる回答入力

**ユーザーストーリー:** インストラクターとして、受講者の質問に回答したい。それにより、受講者の疑問をリアルタイムに解消できるようになる。

#### 受入条件

1. THE Instructor_Main_Page SHALL ページ右上に「メニューに戻る」ボタンとサインアウトボタンを表示する
2. WHEN 「メニューに戻る」ボタンがクリックされた場合、THE System SHALL セッションを保持したまま SignIn_Page のアクション選択UIへ遷移する
3. THE Instructor_Main_Page SHALL 指定したClass_IDに紐づく質問・回答一覧を提出日時の降順に表示する
4. WHEN 質問または回答のテキストにURLが含まれる場合、THE System SHALL そのURLをクリック可能なハイパーリンクとして新しいタブで開く
5. WHEN Instructor が質問を選択した場合、THE System SHALL その質問に対する回答入力欄（最大1000文字）と送信ボタンを表示する
6. IF 回答入力欄が空欄のまま送信ボタンがクリックされた場合、THEN THE System SHALL 入力必須エラーメッセージを日本語で表示し、送信を中断する
7. WHEN 回答の送信ボタンがクリックされ、かつ回答が入力されている場合、THE System SHALL 入力内容の確認ダイアログ（OKボタンとキャンセルボタンを含む）を表示する
8. WHEN 確認ダイアログで OK がクリックされた場合、THE System SHALL 回答データをBackendへ送信し、質問・回答一覧に回答を反映する
9. WHEN 確認ダイアログで キャンセル がクリックされた場合、THE System SHALL ダイアログを閉じて回答入力欄の状態を保持したまま編集を継続できる状態に戻る
10. IF Backend への送信が失敗した場合、THEN THE System SHALL 送信失敗エラーメッセージを日本語で表示し、入力内容を保持する
11. WHEN サインアウトボタンがクリックされた場合、THE System SHALL セッションを終了してSignIn_Page へ遷移する

---

### 要件5: クラス登録・管理

**ユーザーストーリー:** インストラクターとして、クラスを登録・管理したい。それにより、受講者がサインインに必要なClass_IDとパスワードを設定できるようになる。

#### 受入条件

1. THE Class_Registration_Page SHALL クラスID（最大50文字）・クラス名称（最大100文字）・開始日・最終日・パスワード（最大100文字）の入力フォームを表示する
2. THE Class_Registration_Page SHALL ページ右上に「メニューに戻る」ボタンとサインアウトボタンを表示する
3. WHEN 「メニューに戻る」ボタンがクリックされた場合、THE System SHALL セッションを保持したまま SignIn_Page のアクション選択UIへ遷移する
4. WHEN Instructor がすべての必須項目を入力して登録ボタンをクリックした場合、THE System SHALL 3秒以内にクラス情報をDynamoDBに保存し、画面下部のクラス一覧に追加する
5. IF 同一のClass_IDがすでに存在する場合、THEN THE System SHALL 重複エラーメッセージを日本語で表示し、入力済み項目を保持したまま登録を中断する
6. IF 必須項目のいずれかが未入力のまま登録ボタンがクリックされた場合、THEN THE System SHALL 入力必須エラーメッセージを日本語で表示し、保存を中断する
7. THE Class_Registration_Page SHALL 登録済みクラスの一覧（クラスID・クラス名称・開始日・最終日を含む、最大100件）をページ下部に表示する
8. WHEN Instructor が一覧から既存のクラスを選択した場合、THE System SHALL そのクラスのクラスID・クラス名称・開始日・最終日・パスワードを入力フォームに表示し、編集・上書き保存を可能にする
9. IF 開始日が最終日より後の日付が入力された場合、THEN THE System SHALL 日付範囲エラーメッセージを日本語で表示し、入力済み項目を保持したまま保存を中断する

---

### 要件6: バックエンド API

**ユーザーストーリー:** システムとして、フロントエンドからのリクエストを処理したい。それにより、データの永続化と認証が安全に行えるようになる。

#### 受入条件

1. THE Backend SHALL Amazon API Gateway の REST API として各エンドポイントを提供する
2. THE Backend SHALL Python 3.13 の Lambda 関数で各APIリクエストを処理する
3. THE Backend SHALL DynamoDB のオンデマンドキャパシティモードのテーブルを使用してすべてのデータを管理する
4. THE Backend SHALL CORS 設定を行い、フロントエンドからのクロスオリジンリクエストを許可する
5. WHEN サインインAPIが呼び出された場合、THE Backend SHALL 入力された認証情報をDynamoDB上のPBKDF2-SHA256ハッシュ値と照合し、一致した場合のみ成功レスポンスを返す
6. IF サインインAPIで認証情報が一致しなかった場合、THEN THE Backend SHALL HTTP 401ステータスコードとエラー内容を示すメッセージを含むJSONレスポンスを返し、セッションを生成しない
7. WHEN 質問送信APIが呼び出された場合、THE Backend SHALL 質問データに提出日時（ISO 8601形式）と質問番号（1以上の整数の連番）を付与してDynamoDBに保存する
8. WHEN 回答送信APIが呼び出された場合、THE Backend SHALL 指定された質問レコードにインストラクターの回答を関連付けてDynamoDBに保存する
9. IF 回答送信APIで指定された質問レコードが存在しない場合、THEN THE Backend SHALL HTTP 404ステータスコードとエラー内容を示すメッセージを含むJSONレスポンスを返す
10. WHEN クラス登録APIが呼び出された場合、THE Backend SHALL クラス情報をDynamoDBに保存または更新する
11. IF APIリクエストの処理中にエラーが発生した場合、THEN THE Backend SHALL 適切なHTTPステータスコードとエラー内容を示すメッセージを含むJSONレスポンスを返す

---

### 要件7: インフラストラクチャとデプロイ

**ユーザーストーリー:** 開発者として、アプリケーションをAWS環境にデプロイしたい。それにより、受講者とインストラクターがWebブラウザからアクセスできるようになる。

#### 受入条件

1. THE System SHALL フロントエンドとバックエンドのコードをリポジトリのルートレベルで別々のディレクトリ（frontend・backend）に分離して管理する
2. THE Backend SHALL AWS SAM テンプレートを使用して Lambda・API Gateway・DynamoDB リソースをデプロイ可能な構成とする
3. THE Frontend SHALL ビルドステップ不要な静的ファイル（HTML・CSS・JavaScript）として構成し、フレームワーク不使用のシンプルな実装とする
4. THE Frontend SHALL Backend の API Gateway エンドポイントURLを設定可能な形式で保持し、そのエンドポイントに対してHTTPリクエストを送信するSPA構成とする
5. THE System SHALL DynamoDB テーブルを BillingMode: PAY_PER_REQUEST で定義し、sam deploy コマンドで作成されるよう SAM テンプレートに記述する
6. IF sam deploy の実行中にエラーが発生した場合、THEN THE System SHALL CloudFormation のロールバック機能により変更前の状態に戻る
