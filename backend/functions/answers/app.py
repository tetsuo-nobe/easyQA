import json
import os
from datetime import datetime, timezone, timedelta

import boto3

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


def lambda_handler(event, context):
    """回答管理Lambda ハンドラー"""
    try:
        # パスパラメータから questionNumber を取得
        path_params = event.get("pathParameters") or {}
        question_number_str = path_params.get("questionNumber", "")

        # questionNumber のバリデーション（文字列 → 整数変換）
        if not question_number_str:
            return error_response(400, "questionNumber は必須です。")

        try:
            question_number = int(question_number_str)
        except (ValueError, TypeError):
            return error_response(400, "questionNumber は整数で指定してください。")

        if question_number < 1:
            return error_response(400, "questionNumber は1以上の整数で指定してください。")

        # リクエストボディのパース
        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, TypeError):
            return error_response(400, "リクエストボディが不正です。")

        class_id = body.get("classId", "").strip()
        answer = body.get("answer", "")

        # バリデーション: classId
        if not class_id:
            return error_response(400, "classId は必須です。")

        # バリデーション: answer（空文字・空白のみ不可）
        if not answer or not answer.strip():
            return error_response(400, "回答内容は必須です。")

        if len(answer) > 1000:
            return error_response(400, "回答内容は1000文字以内で入力してください。")

        # DynamoDB から該当レコードを GetItem で取得
        response = table.get_item(
            Key={
                "classId": class_id,
                "questionNumber": question_number
            }
        )

        # レコードが存在しない場合は 404 を返す
        if "Item" not in response:
            return error_response(404, "指定された質問が見つかりません。")

        # 現在時刻を ISO 8601 形式（タイムゾーン付き）で生成
        answered_at = datetime.now(JST).isoformat()

        # UpdateItem で answer と answeredAt を保存
        table.update_item(
            Key={
                "classId": class_id,
                "questionNumber": question_number
            },
            UpdateExpression="SET answer = :answer, answeredAt = :answeredAt",
            ExpressionAttributeValues={
                ":answer": answer,
                ":answeredAt": answered_at
            }
        )

        # 成功レスポンス
        return success_response(200, {"success": True})

    except Exception as e:
        # 予期しない例外は HTTP 500 で返す
        return error_response(500, "サーバー内部エラーが発生しました。")
