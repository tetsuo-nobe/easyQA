import hashlib
import json
import os
import secrets
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Attr, Key


# DynamoDB リソース初期化
dynamodb = boto3.resource("dynamodb")
CLASSES_TABLE = os.environ.get("CLASSES_TABLE", "easyqa-classes")
table = dynamodb.Table(CLASSES_TABLE)
QUESTIONS_TABLE = os.environ.get("QUESTIONS_TABLE", "easyqa-questions")
questions_table = dynamodb.Table(QUESTIONS_TABLE)

# 日本標準時（UTC+9）
JST = timezone(timedelta(hours=9))


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


def get_questions_for_export(class_id: str) -> list:
    """クラスIDに紐づく質問・回答を取得する（削除済みを除外、昇順）。export_QA.py と同一仕様"""
    questions = []
    last_evaluated_key = None

    # ページネーション対応: 全件取得
    while True:
        query_params = {
            "KeyConditionExpression": Key("classId").eq(class_id),
            "ScanIndexForward": True,  # questionNumber 昇順
        }
        if last_evaluated_key:
            query_params["ExclusiveStartKey"] = last_evaluated_key

        response = questions_table.query(**query_params)

        for item in response.get("Items", []):
            # 削除された質問は除外
            if item.get("deleted", False):
                continue
            questions.append(item)

        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    return questions


def generate_markdown(class_info: dict, questions: list, class_id: str) -> str:
    """マークダウン形式の文字列を生成する。export_QA.py と同一の出力にする"""
    lines = []

    # ヘッダー: クラス情報
    class_name = class_info.get("className", "不明")
    start_date = class_info.get("startDate", "不明")
    end_date = class_info.get("endDate", "不明")

    lines.append(f"# {class_name} - 質問・回答一覧")
    lines.append("")
    lines.append("## クラス情報")
    lines.append("")
    lines.append("| 項目 | 内容 |")
    lines.append("|------|------|")
    lines.append(f"| クラスID | {class_id} |")
    lines.append(f"| クラス名 | {class_name} |")
    lines.append(f"| 開始日 | {start_date} |")
    lines.append(f"| 終了日 | {end_date} |")
    lines.append(f"| 質問数 | {len(questions)} |")
    lines.append("")

    # 質問・回答セクション
    lines.append("## 質問・回答")
    lines.append("")

    if not questions:
        lines.append("質問はありません。")
        lines.append("")
    else:
        for item in questions:
            question_number = int(item["questionNumber"])
            submitted_at = item.get("submittedAt", "不明")
            content = item.get("content", "")
            name = item.get("name", "")
            answer = item.get("answer", "")

            # 質問ヘッダー
            lines.append(f"### Q{question_number}. {content}")
            lines.append("")

            # メタ情報
            meta_parts = [f"**日時:** {submitted_at}"]
            if name:
                meta_parts.append(f"**投稿者:** {name}")
            lines.append(" | ".join(meta_parts))
            lines.append("")

            # 回答
            if answer:
                lines.append(f"**A:** {answer}")
            else:
                lines.append("**A:** （未回答）")
            lines.append("")
            lines.append("---")
            lines.append("")

    # エクスポート情報（フッター）
    export_time = datetime.now(JST).isoformat()
    lines.append(f"*エクスポート日時: {export_time}*")
    lines.append("")

    return "\n".join(lines)


def handle_export_class(event):
    """GET /classes/{classId}/export - クラスのQ&AをMarkdownでエクスポート"""
    path_params = event.get("pathParameters") or {}
    class_id = path_params.get("classId")
    params = event.get("queryStringParameters") or {}
    instructor_id = params.get("instructorId")

    if not class_id or not instructor_id:
        return error_response(400, "classId と instructorId は必須です。")

    class_info = table.get_item(Key={"classId": class_id}).get("Item")
    # 存在しない、または他のインストラクターのクラスは同じ応答にする
    if not class_info or class_info.get("instructorId") != instructor_id:
        return error_response(404, "クラスが見つかりません。")

    questions = get_questions_for_export(class_id)
    markdown_content = generate_markdown(class_info, questions, class_id)

    # ファイル名（QA_yyyymmdd_classId.md）
    filename = f"QA_{datetime.now(JST).strftime('%Y%m%d')}_{class_id}.md"

    return success_response(200, {
        "success": True,
        "filename": filename,
        "content": markdown_content
    })


def delete_all_questions(class_id: str) -> int:
    """クラスIDに紐づく全質問を削除し、削除件数を返す。delete_QA.py と同一仕様"""
    deleted_count = 0
    last_evaluated_key = None

    # ページネーション対応: 全件取得して順次削除
    while True:
        query_params = {
            "KeyConditionExpression": Key("classId").eq(class_id),
            "ProjectionExpression": "classId, questionNumber",  # キーのみ取得
        }
        if last_evaluated_key:
            query_params["ExclusiveStartKey"] = last_evaluated_key

        response = questions_table.query(**query_params)

        # BatchWriteItem で一括削除（25件ずつ）
        with questions_table.batch_writer() as batch:
            for item in response.get("Items", []):
                batch.delete_item(
                    Key={
                        "classId": item["classId"],
                        "questionNumber": item["questionNumber"],
                    }
                )
                deleted_count += 1

        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    return deleted_count


def handle_delete_class(event):
    """DELETE /classes/{classId} - クラスと紐づく質問・回答を削除"""
    path_params = event.get("pathParameters") or {}
    class_id = path_params.get("classId")
    params = event.get("queryStringParameters") or {}
    instructor_id = params.get("instructorId")

    if not class_id or not instructor_id:
        return error_response(400, "classId と instructorId は必須です。")

    class_info = table.get_item(Key={"classId": class_id}).get("Item")
    # 存在しない、または他のインストラクターのクラスは同じ応答にする
    if not class_info or class_info.get("instructorId") != instructor_id:
        return error_response(404, "クラスが見つかりません。")

    # 質問・回答 → クラス情報の順に削除（途中失敗時もクラスが残り再実行できる）
    deleted_count = delete_all_questions(class_id)
    table.delete_item(Key={"classId": class_id})

    return success_response(200, {"success": True, "deletedQuestions": deleted_count})


def lambda_handler(event, context):
    """クラス管理Lambda ハンドラー - HTTP メソッド + パスでルーティング"""
    try:
        http_method = event.get("httpMethod", "")
        path = event.get("path", "")

        if http_method == "GET" and path == "/classes":
            return handle_get_classes(event)

        if http_method == "GET" and path.startswith("/classes/") and path.endswith("/export"):
            return handle_export_class(event)

        if http_method == "POST" and path == "/classes":
            return handle_post_classes(event)

        if http_method == "PUT" and path.startswith("/classes/"):
            return handle_put_class(event)

        if http_method == "DELETE" and path.startswith("/classes/"):
            return handle_delete_class(event)

        return error_response(404, "エンドポイントが見つかりません。")

    except Exception:
        return error_response(500, "内部サーバーエラーが発生しました。")
