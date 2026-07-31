"""
DynamoDB の質問・回答データをマークダウンファイルにエクスポートするスクリプト。

使用方法:
    python export_QA.py <classId>

出力:
    yyyymmddhhmmss_<classId>.md 形式のマークダウンファイル
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


def get_questions(class_id: str) -> list[dict]:
    """クラスIDに紐づく質問・回答を取得する（削除済みを除外、昇順）"""
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(QUESTIONS_TABLE)

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

        response = table.query(**query_params)

        for item in response.get("Items", []):
            # 削除された質問は除外
            if item.get("deleted", False):
                continue
            questions.append(item)

        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    return questions


def generate_markdown(class_info: dict, questions: list[dict], class_id: str) -> str:
    """マークダウン形式の文字列を生成する"""
    lines = []

    # ヘッダー: クラス情報
    class_name = class_info.get("className", "不明")
    start_date = class_info.get("startDate", "不明")
    end_date = class_info.get("endDate", "不明")

    lines.append(f"# {class_name} - 質問・回答一覧")
    lines.append("")
    lines.append("## クラス情報")
    lines.append("")
    lines.append(f"| 項目 | 内容 |")
    lines.append(f"|------|------|")
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


def main():
    """メイン処理"""
    # コマンドライン引数のチェック
    if len(sys.argv) != 2:
        print("使用方法: python export_QA.py <classId>")
        print("例: python export_QA.py class-001")
        sys.exit(1)

    class_id = sys.argv[1].strip()

    if not class_id:
        print("エラー: classId を指定してください。")
        sys.exit(1)

    print(f"クラスID '{class_id}' のデータをエクスポートしています...")

    # クラス情報を取得
    class_info = get_class_info(class_id)
    if not class_info:
        print(f"エラー: クラスID '{class_id}' が見つかりません。")
        sys.exit(1)

    # 質問・回答を取得
    questions = get_questions(class_id)
    print(f"  質問数: {len(questions)} 件（削除済みを除く）")

    # マークダウン生成
    markdown_content = generate_markdown(class_info, questions, class_id)

    # 出力ファイル名を生成（QA_yyyymmdd_classId.md）
    now = datetime.now(JST)
    filename = f"QA_{now.strftime('%Y%m%d')}_{class_id}.md"

    # ファイル書き出し
    with open(filename, "w", encoding="utf-8") as f:
        f.write(markdown_content)

    print(f"  出力ファイル: {filename}")
    print("エクスポートが完了しました。")


if __name__ == "__main__":
    main()
