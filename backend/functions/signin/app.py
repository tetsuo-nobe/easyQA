import hashlib
import json
import os

import boto3

# 環境変数からテーブル名を取得
USERS_TABLE = os.environ.get("USERS_TABLE", "easyqa-users")
CLASSES_TABLE = os.environ.get("CLASSES_TABLE", "easyqa-classes")

# DynamoDB リソース
dynamodb = boto3.resource("dynamodb")


def verify_password(password: str, stored_hash: str) -> bool:
    """保存済みハッシュとパスワードを照合する（PBKDF2-SHA256）"""
    try:
        _, algorithm, iterations, salt, hash_hex = stored_hash.split(':', 4)
        dk = hashlib.pbkdf2_hmac(algorithm, password.encode('utf-8'), salt.encode('utf-8'), int(iterations))
        return dk.hex() == hash_hex
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


def success_response(body: dict) -> dict:
    """標準成功レスポンスを返すヘルパー関数（CORSヘッダー付き）"""
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body, ensure_ascii=False)
    }


def lambda_handler(event, context):
    """認証Lambda ハンドラー"""
    try:
        # リクエストボディを解析
        body = json.loads(event.get("body") or "{}")

        role = body.get("role", "").strip()
        user_id = body.get("id", "").strip()
        password = body.get("password", "")

        # 必須パラメータのバリデーション
        if not role or not user_id or not password:
            return error_response(400, "role、id、password は必須です。")

        if role not in ("learner", "instructor"):
            return error_response(400, "role は 'learner' または 'instructor' を指定してください。")

        # 認証エラー時の共通メッセージ
        auth_error_msg = "IDまたはパスワードが正しくありません。"

        if role == "learner":
            # Classes テーブルから classId でレコードを取得
            classes_table = dynamodb.Table(CLASSES_TABLE)
            response = classes_table.get_item(Key={"classId": user_id})
            item = response.get("Item")

            if not item:
                return error_response(401, auth_error_msg)

            # PBKDF2 でパスワードを照合
            stored_hash = item.get("passwordHash", "")
            if not verify_password(password, stored_hash):
                return error_response(401, auth_error_msg)

            # 認証成功
            return success_response({
                "success": True,
                "role": "learner",
                "classId": user_id
            })

        elif role == "instructor":
            # Users テーブルから instructorId でレコードを取得
            users_table = dynamodb.Table(USERS_TABLE)
            response = users_table.get_item(Key={"instructorId": user_id})
            item = response.get("Item")

            if not item:
                return error_response(401, auth_error_msg)

            # PBKDF2 でパスワードを照合
            stored_hash = item.get("passwordHash", "")
            if not verify_password(password, stored_hash):
                return error_response(401, auth_error_msg)

            # 認証成功
            return success_response({
                "success": True,
                "role": "instructor"
            })

    except json.JSONDecodeError:
        return error_response(400, "リクエストボディが不正なJSON形式です。")
    except Exception:
        return error_response(500, "サーバー内部エラーが発生しました。")
