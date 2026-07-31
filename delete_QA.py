"""
指定したクラスのデータ（クラス情報・質問・回答）をすべて削除するスクリプト。

削除後、受講者はそのクラスで質問を送信できなくなり、
インストラクターも回答できなくなります。

使用方法:
    python delete_QA.py <classId>
"""

import sys
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key

# 日本標準時（UTC+9）
JST = timezone(timedelta(hours=9))

# DynamoDB テーブル名
QUESTIONS_TABLE = "easyqa-questions"
CLASSES_TABLE = "easyqa-classes"


def get_class_info(class_id: str) -> dict | None:
    """クラスIDからクラス情報を取得する"""
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(CLASSES_TABLE)

    response = table.get_item(Key={"classId": class_id})
    return response.get("Item")


def delete_all_questions(class_id: str) -> int:
    """クラスIDに紐づく全質問を削除し、削除件数を返す"""
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(QUESTIONS_TABLE)

    deleted_count = 0
    last_evaluated_key = None

    # ページネーション対応: 全件取得して順次削除
    while True:
        query_params = {
            "KeyConditionExpression": Key("classId").eq(class_id),
            "ProjectionExpression": "classId, questionNumber",  # キーのみ取得（効率化）
        }
        if last_evaluated_key:
            query_params["ExclusiveStartKey"] = last_evaluated_key

        response = table.query(**query_params)
        items = response.get("Items", [])

        # BatchWriteItem で一括削除（25件ずつ）
        with table.batch_writer() as batch:
            for item in items:
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


def delete_class(class_id: str) -> None:
    """クラス情報を削除する"""
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(CLASSES_TABLE)

    table.delete_item(Key={"classId": class_id})


def main():
    """メイン処理"""
    # コマンドライン引数のチェック
    if len(sys.argv) != 2:
        print("使用方法: python delete_QA.py <classId>")
        print("例: python delete_QA.py class-001")
        sys.exit(1)

    class_id = sys.argv[1].strip()

    if not class_id:
        print("エラー: classId を指定してください。")
        sys.exit(1)

    # クラス情報を取得して存在確認
    class_info = get_class_info(class_id)
    if not class_info:
        print(f"エラー: クラスID '{class_id}' が見つかりません。")
        sys.exit(1)

    class_name = class_info.get("className", "不明")
    start_date = class_info.get("startDate", "不明")
    end_date = class_info.get("endDate", "不明")

    # 削除対象の情報を表示
    print("=" * 50)
    print("【警告】以下のクラスデータを完全に削除します。")
    print("  この操作は取り消せません。")
    print("=" * 50)
    print(f"  クラスID:  {class_id}")
    print(f"  クラス名:  {class_name}")
    print(f"  開始日:    {start_date}")
    print(f"  終了日:    {end_date}")
    print("=" * 50)
    print()

    # 確認プロンプト
    confirm = input("本当に削除しますか？ (yes/no): ").strip().lower()
    if confirm != "yes":
        print("削除をキャンセルしました。")
        sys.exit(0)

    print()
    print("削除を開始します...")

    # 質問・回答の削除
    deleted_count = delete_all_questions(class_id)
    print(f"  質問・回答を削除しました: {deleted_count} 件")

    # クラス情報の削除
    delete_class(class_id)
    print(f"  クラス情報を削除しました: {class_id}")

    print()
    print("すべてのデータの削除が完了しました。")
    print("このクラスでは質問の送信・回答ができなくなります。")


if __name__ == "__main__":
    main()
