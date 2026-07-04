# easyQA

教育向けのシンプルなQ&Aアプリケーション。受講者が質問を投稿し、インストラクターが回答するリアルタイムQ&Aプラットフォームです。

## アーキテクチャ

- **フロントエンド**: 静的 HTML/CSS/JavaScript（AWS Amplify ホスティング）
- **バックエンド**: AWS SAM（API Gateway + Lambda + DynamoDB）
- **ランタイム**: Python 3.13
- **リポジトリ**: モノリポ（`frontend/` と `backend/` を同一リポジトリで管理）

## ディレクトリ構成

```
easyQA/                         # Git リポジトリルート
├── README.md
├── amplify.yaml                # Amplify ビルド設定
├── backend/
│   ├── template.yaml           # SAM テンプレート
│   ├── requirements.txt        # Python 依存パッケージ（テスト用）
│   └── functions/
│       ├── signin/
│       │   ├── app.py          # 認証 Lambda
│       │   └── requirements.txt
│       ├── questions/
│       │   ├── app.py          # 質問管理 Lambda
│       │   └── requirements.txt
│       ├── answers/
│       │   ├── app.py          # 回答管理 Lambda
│       │   └── requirements.txt
│       └── classes/
│           ├── app.py          # クラス管理 Lambda
│           └── requirements.txt
└── frontend/
    ├── index.html              # サインインページ
    ├── learner.html            # 受講者ページ
    ├── instructor.html         # インストラクターページ
    ├── class-registration.html # クラス登録ページ
    ├── css/
    │   └── style.css
    └── js/
        ├── api.js              # API 通信モジュール
        ├── auth.js             # セッション管理モジュール
        ├── signin.js           # サインインページロジック
        ├── learner.js          # 受講者ページロジック
        ├── instructor.js       # インストラクターページロジック
        └── class-registration.js # クラス登録ページロジック
```

## 前提条件

- AWS CLI v2 がインストール・設定済み
- AWS SAM CLI がインストール済み
- Python 3.13
- Git
- 適切な IAM 権限を持つ AWS アカウント
- AWS Amplify コンソールへのアクセス権限

## デプロイ手順

### 1. Git リポジトリの準備

```bash
cd easyQA
git init
git add .
git commit -m "初回コミット"
```

GitHub / GitLab / CodeCommit などのリモートリポジトリにプッシュしてください。

```bash
git remote add origin <YOUR_REPOSITORY_URL>
git push -u origin main
```

### 2. バックエンドのビルドとデプロイ

```bash
cd backend
sam build
sam deploy --guided
```

`sam deploy --guided` で以下の情報を入力します:
- Stack Name: `easyqa`
- AWS Region: 任意（例: `ap-northeast-1`）
- その他はデフォルト値で OK

デプロイ完了後、出力される `ApiUrl` を控えてください。

### 3. フロントエンドの API URL 設定

`frontend/js/api.js` の `API_BASE_URL` を、デプロイで取得した API Gateway の URL に変更します:

```javascript
const API_BASE_URL = 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/Prod';
```

**注意**: URL の末尾に `/` を付けないでください。

変更後、コミット＆プッシュしてください。

```bash
git add frontend/js/api.js
git commit -m "API Gateway URL を設定"
git push
```

### 4. AWS Amplify でフロントエンドをホスティング

1. [AWS Amplify コンソール](https://console.aws.amazon.com/amplify/) を開く
2. **「新しいアプリを作成」** → **「Gitリポジトリからホスト」** を選択
3. リポジトリプロバイダーを選択し、`easyQA` リポジトリと `main` ブランチを選択
4. **「My app is a monorepo」** にチェックを入れ、アプリのルートとして `frontend` と入力します
5. ビルド設定の確認画面でリポジトリルートにある `amplify.yaml` が自動的に検出されます
6. **「保存してデプロイ」** をクリック

デプロイ完了後、Amplify が発行する URL（例: `https://main.xxxxxxxxxx.amplifyapp.com`）でアクセスできます。

## amplify.yaml

リポジトリルートに以下の内容で `amplify.yaml` を配置してください。  
フロントエンドのみをホスティングするため、`frontend/` ディレクトリをそのまま公開します。

```yaml
version: 1
applications:
  - appRoot: frontend
    frontend:
      phases:
        build:
          commands:
            - echo "No build step required for static HTML"
      artifacts:
        baseDirectory: frontend
        files:
          - "**/*"
      cache:
        paths: []
```

> **補足**: モノリポ用の `amplify.yaml` は `applications` キーを使用し、`appRoot` でフロントエンドのルートを指定します。easyQA のフロントエンドはビルドステップ不要の純粋な HTML/CSS/JavaScript のため、ビルドコマンドは `echo` のみです。

> **注意**: Amplify コンソールでリポジトリを連携する際、**「My app is a monorepo」** にチェックを入れ、アプリのルートとして `frontend` を指定してください。Amplify が自動的に `AMPLIFY_MONOREPO_APP_ROOT=frontend` 環境変数を設定します。

## 初期データ登録

デプロイ後、インストラクターアカウントを DynamoDB に直接登録する必要があります。  
パスワードは Python 標準ライブラリ（PBKDF2-SHA256）でハッシュ化します。

### インストラクターアカウントの登録

#### 1. パスワードハッシュの生成

```bash
python -c "
import hashlib, secrets
pw = 'YOUR_PASSWORD'
salt = secrets.token_hex(16)
dk = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 260000)
print(f'pbkdf2:sha256:260000:{salt}:{dk.hex()}')
"
```

`YOUR_PASSWORD` を実際のパスワードに置き換えてください。

#### 2. DynamoDB へのインストラクター登録

```bash
aws dynamodb put-item \
  --table-name easyqa-users \
  --item '{
    "instructorId": {"S": "instructor01"},
    "passwordHash": {"S": "pbkdf2:sha256:260000:<上記で生成したハッシュ値>"}
  }'
```

- `instructorId`: インストラクターのログインID（任意の文字列）
- `passwordHash`: 手順1で生成したハッシュ値をそのまま貼り付け

#### PowerShell での実行例

```powershell
# パスワードハッシュの生成
python -c "
import hashlib, secrets
pw = 'MyPassword123'
salt = secrets.token_hex(16)
dk = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 260000)
print(f'pbkdf2:sha256:260000:{salt}:{dk.hex()}')
"

# DynamoDB への登録（出力されたハッシュ値を貼り付ける）
aws dynamodb put-item `
  --table-name easyqa-users `
  --item '{\"instructorId\": {\"S\": \"instructor01\"}, \"passwordHash\": {\"S\": \"pbkdf2:sha256:260000:xxxxxxxxxx\"}}'
```

### 登録の確認

```bash
aws dynamodb scan --table-name easyqa-users
```

## 使い方

### インストラクター

1. トップページでロール「インストラクター」を選択
2. 登録済みのインストラクターIDとパスワードでサインイン
3. 「クラス登録」で新しいクラスを作成（クラスID・名称・開始日・最終日・パスワードを設定）
4. 「質問・回答一覧」でクラスIDを指定して質問を確認・回答
5. ヘッダーの「メニューに戻る」でアクション選択画面に戻れます（サインアウト不要）

### 受講者

1. トップページでロール「受講者」を選択
2. インストラクターから共有されたクラスIDとパスワードでサインイン
3. 質問・コメントを投稿
4. インストラクターからの回答を確認

## DynamoDB テーブル構成

| テーブル名 | Partition Key | Sort Key | 用途 |
|-----------|--------------|----------|------|
| easyqa-users | instructorId (S) | - | インストラクターアカウント |
| easyqa-classes | classId (S) | - | クラス情報（passwordHash を含む） |
| easyqa-questions | classId (S) | questionNumber (N) | 質問・回答 |

## API エンドポイント

| メソッド | パス | 概要 |
|---------|------|------|
| POST | /signin | サインイン認証 |
| GET | /questions?classId=X | 質問一覧取得 |
| POST | /questions | 質問投稿 |
| PUT | /questions/{questionNumber}/answer | 回答送信 |
| GET | /classes?instructorId=X | クラス一覧取得 |
| POST | /classes | クラス登録 |
| PUT | /classes/{classId} | クラス更新 |

## クリーンアップ

### バックエンドの削除

```bash
cd backend
sam delete --stack-name easyqa
```

### Amplify アプリの削除

Amplify コンソールからアプリを選択し、「アプリの削除」を実行してください。

