import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

# 環境変数からテーブル名を取得
QUESTIONS_TABLE = os.environ.get("QUESTIONS_TABLE", "Questions")

# DynamoDB リソースの初期化
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(QUESTIONS_TABLE)

# 日本標準時（UTC+9）
JST = timezone(timedelta(hours=9))


def hash_delete_password(password: str) -> str:
    """削除用パスワードをPBKDF2-SHA256でハッシュ化する（salt付き）"""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 260000)
    return f"pbkdf2:sha256:260000:{salt}:{dk.hex()}"


def verify_delete_password(password: str, stored_hash: str) -> bool:
    """削除用パスワードをhmac.compare_digestによる定数時間比較で照合する（タイミング攻撃防止）"""
    try:
        _, algorithm, iterations, salt, hash_hex = stored_hash.split(':', 4)
        dk = hashlib.pbkdf2_hmac(algorithm, password.encode('utf-8'), salt.encode('utf-8'), int(iterations))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def error_response(status_code: int, message: str) -> dict:
    """標準エラーレスポンスを返すヘルパー関数（CORSヘッダー付き）"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({"success": False, "message": message}, ensure_ascii=False)
    }


def success_response(status_code: int, body: dict) -> dict:
    """標準成功レスポンスを返すヘルパー関数（CORSヘッダー付き）"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body, ensure_ascii=False)
    }


def handle_get_questions(event):
    """GET /questions - 質問・回答一覧取得"""
    # クエリパラメータから classId を取得
    params = event.get("queryStringParameters") or {}
    class_id = params.get("classId", "").strip()

    if not class_id:
        return error_response(400, "classId は必須です。")

    # DynamoDB から質問一覧を降順で取得（最大100件）
    response = table.query(
        KeyConditionExpression=Key("classId").eq(class_id),
        ScanIndexForward=False,
        Limit=100
    )

    # レスポンス用にデータを整形
    questions = []
    for item in response.get("Items", []):
        # deleted: True のアイテムを除外（後方互換: deleted属性なしは有効として扱う）
        if item.get("deleted", False):
            continue
        question = {
            "questionNumber": int(item["questionNumber"]),
            "submittedAt": item["submittedAt"],
            "content": item["content"],
            "name": item.get("name", "")
            # deletePasswordHash は意図的に含めない（セキュリティ）
        }
        # 回答がある場合のみ含める
        if "answer" in item:
            question["answer"] = item["answer"]
        questions.append(question)

    return success_response(200, {"success": True, "questions": questions})


def handle_post_questions(event):
    """POST /questions - 質問送信"""
    # リクエストボディのパース
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return error_response(400, "リクエストボディが不正です。")

    class_id = body.get("classId", "").strip()
    content = body.get("content", "")
    name = body.get("name", "")

    # バリデーション: classId
    if not class_id:
        return error_response(400, "classId は必須です。")

    # バリデーション: content（空文字・空白のみ不可、最大500文字）
    if not content or not content.strip():
        return error_response(400, "質問内容は必須です。")

    if len(content) > 500:
        return error_response(400, "質問内容は500文字以内で入力してください。")

    # バリデーション: name（任意、最大50文字）
    if len(name) > 50:
        return error_response(400, "名前は50文字以内で入力してください。")

    # バリデーション: deletePassword（必須、半角英数字8文字固定）
    delete_password = body.get("deletePassword", "")
    if not delete_password:
        return error_response(400, "削除用パスワードを入力してください。")
    if not re.fullmatch(r'[A-Za-z0-9]{8,}', delete_password):
        return error_response(400, "削除用パスワードは半角英数字8文字以上で入力してください。")

    # 同一 classId の最新 questionNumber を取得（降順1件）
    query_response = table.query(
        KeyConditionExpression=Key("classId").eq(class_id),
        ScanIndexForward=False,
        Limit=1
    )

    # 次の questionNumber を決定（初回は 1）
    items = query_response.get("Items", [])
    if items:
        next_question_number = int(items[0]["questionNumber"]) + 1
    else:
        next_question_number = 1

    # 現在時刻を ISO 8601 形式（タイムゾーン付き）で生成
    submitted_at = datetime.now(JST).isoformat()

    # DynamoDB 条件付き書き込み（競合防止）
    try:
        # deletePassword はハッシュ化して保存（平文は保存しない）
        delete_password_hash = hash_delete_password(delete_password)
        table.put_item(
            Item={
                "classId": class_id,
                "questionNumber": next_question_number,
                "content": content,
                "name": name,
                "submittedAt": submitted_at,
                "deletePasswordHash": delete_password_hash
            },
            ConditionExpression="attribute_not_exists(questionNumber)"
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return error_response(409, "質問番号の競合が発生しました。再度送信してください。")

    return success_response(201, {
        "success": True,
        "questionNumber": next_question_number,
        "submittedAt": submitted_at
    })


def handle_delete_question(event):
    """DELETE /questions/{questionNumber} - 質問の論理削除"""
    # パスパラメータから questionNumber を取得
    path_params = event.get("pathParameters") or {}
    try:
        question_number = int(path_params.get("questionNumber", ""))
    except (ValueError, TypeError):
        return error_response(400, "questionNumber が不正です。")

    # リクエストボディのパース
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return error_response(400, "リクエストボディが不正です。")

    class_id = body.get("classId", "").strip()
    delete_password = body.get("deletePassword", "")

    # バリデーション
    if not class_id:
        return error_response(400, "classId は必須です。")
    if not delete_password:
        return error_response(400, "削除用パスワードは必須です。")

    # DynamoDB からレコード取得（questionNumberはDynamoDBのNumber型のためDecimalでラップ）
    response = table.get_item(Key={"classId": class_id, "questionNumber": Decimal(question_number)})
    item = response.get("Item")

    # 質問が存在しない・または既に削除済みの場合は 404
    if not item or item.get("deleted", False):
        return error_response(404, "質問が見つかりません。")

    # パスワード照合（定数時間比較）
    stored_hash = item.get("deletePasswordHash", "")
    if not stored_hash:
        return error_response(403, "この質問は削除できません。（削除用パスワードが設定されていません）")
    if not verify_delete_password(delete_password, stored_hash):
        return error_response(401, "削除用パスワードが正しくありません。")

    # 論理削除: deleted = True を設定
    table.update_item(
        Key={"classId": class_id, "questionNumber": question_number},
        UpdateExpression="SET deleted = :val",
        ExpressionAttributeValues={":val": True}
    )

    return success_response(200, {"success": True})


def lambda_handler(event, context):
    """質問管理Lambda ハンドラー"""
    try:
        http_method = event.get("httpMethod", "")

        if http_method == "GET":
            return handle_get_questions(event)
        elif http_method == "POST":
            return handle_post_questions(event)
        elif http_method == "DELETE":
            return handle_delete_question(event)
        else:
            return error_response(405, "許可されていないHTTPメソッドです。")

    except Exception as e:
        # 予期しない例外は HTTP 500 で返す
        return error_response(500, "サーバー内部エラーが発生しました。")
