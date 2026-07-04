import json
import os
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key

# 環境変数からテーブル名を取得
QUESTIONS_TABLE = os.environ.get("QUESTIONS_TABLE", "Questions")

# DynamoDB リソースの初期化
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(QUESTIONS_TABLE)

# 日本標準時（UTC+9）
JST = timezone(timedelta(hours=9))


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
        question = {
            "questionNumber": int(item["questionNumber"]),
            "submittedAt": item["submittedAt"],
            "content": item["content"],
            "name": item.get("name", "")
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
        table.put_item(
            Item={
                "classId": class_id,
                "questionNumber": next_question_number,
                "content": content,
                "name": name,
                "submittedAt": submitted_at
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


def lambda_handler(event, context):
    """質問管理Lambda ハンドラー"""
    try:
        http_method = event.get("httpMethod", "")

        if http_method == "GET":
            return handle_get_questions(event)
        elif http_method == "POST":
            return handle_post_questions(event)
        else:
            return error_response(405, "許可されていないHTTPメソッドです。")

    except Exception as e:
        # 予期しない例外は HTTP 500 で返す
        return error_response(500, "サーバー内部エラーが発生しました。")
