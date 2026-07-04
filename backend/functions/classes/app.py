import hashlib
import json
import os
import secrets

import boto3
from boto3.dynamodb.conditions import Attr


# DynamoDB リソース初期化
dynamodb = boto3.resource("dynamodb")
CLASSES_TABLE = os.environ.get("CLASSES_TABLE", "easyqa-classes")
table = dynamodb.Table(CLASSES_TABLE)


def hash_password(password: str) -> str:
    """PBKDF2-SHA256 でパスワードをハッシュ化する（salt付き）"""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 260000)
    return f"pbkdf2:sha256:260000:{salt}:{dk.hex()}"


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


def handle_get_classes(event):
    """GET /classes - インストラクターのクラス一覧を取得"""
    params = event.get("queryStringParameters") or {}
    instructor_id = params.get("instructorId")

    if not instructor_id:
        return error_response(400, "instructorId は必須です。")

    response = table.scan(
        FilterExpression=Attr("instructorId").eq(instructor_id),
        Limit=100
    )

    classes = []
    for item in response.get("Items", []):
        classes.append({
            "classId": item.get("classId"),
            "className": item.get("className"),
            "startDate": item.get("startDate"),
            "endDate": item.get("endDate")
        })

    return success_response(200, {"success": True, "classes": classes})


def handle_post_classes(event):
    """POST /classes - 新しいクラスを作成"""
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return error_response(400, "リクエストボディが不正です。")

    instructor_id = body.get("instructorId")
    class_id = body.get("classId")
    class_name = body.get("className")
    start_date = body.get("startDate")
    end_date = body.get("endDate")
    password = body.get("password")

    if not all([instructor_id, class_id, class_name, start_date, end_date, password]):
        return error_response(400, "全てのフィールド（instructorId, classId, className, startDate, endDate, password）は必須です。")

    if start_date > end_date:
        return error_response(400, "開始日は終了日より前でなければなりません。")

    hashed_password = hash_password(password)

    try:
        table.put_item(
            Item={
                "classId": class_id,
                "instructorId": instructor_id,
                "className": class_name,
                "startDate": start_date,
                "endDate": end_date,
                "passwordHash": hashed_password
            },
            ConditionExpression=Attr("classId").not_exists()
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return error_response(409, "同じクラスIDがすでに存在します。")

    return success_response(201, {"success": True})


def handle_put_class(event):
    """PUT /classes/{classId} - 既存クラスを更新"""
    path_params = event.get("pathParameters") or {}
    class_id = path_params.get("classId")

    if not class_id:
        return error_response(400, "classId は必須です。")

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return error_response(400, "リクエストボディが不正です。")

    class_name = body.get("className")
    start_date = body.get("startDate")
    end_date = body.get("endDate")
    password = body.get("password")

    if not all([class_name, start_date, end_date, password]):
        return error_response(400, "全てのフィールド（className, startDate, endDate, password）は必須です。")

    if start_date > end_date:
        return error_response(400, "開始日は終了日より前でなければなりません。")

    hashed_password = hash_password(password)

    table.update_item(
        Key={"classId": class_id},
        UpdateExpression="SET className = :cn, startDate = :sd, endDate = :ed, passwordHash = :pw",
        ExpressionAttributeValues={
            ":cn": class_name,
            ":sd": start_date,
            ":ed": end_date,
            ":pw": hashed_password
        }
    )

    return success_response(200, {"success": True})


def lambda_handler(event, context):
    """クラス管理Lambda ハンドラー - HTTP メソッド + パスでルーティング"""
    try:
        http_method = event.get("httpMethod", "")
        path = event.get("path", "")

        if http_method == "GET" and path == "/classes":
            return handle_get_classes(event)

        if http_method == "POST" and path == "/classes":
            return handle_post_classes(event)

        if http_method == "PUT" and path.startswith("/classes/"):
            return handle_put_class(event)

        return error_response(404, "エンドポイントが見つかりません。")

    except Exception:
        return error_response(500, "内部サーバーエラーが発生しました。")
