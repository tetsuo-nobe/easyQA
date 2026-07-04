// easyQA クラス登録ページロジック
// 要件 5.1〜5.7 に対応

// 更新モードフラグ
let isUpdate = false;

/**
 * ページ初期化処理
 * 認証確認 → クラス一覧取得 → テーブル描画
 */
document.addEventListener('DOMContentLoaded', async () => {
  // インストラクター認証確認
  requireAuth('instructor');

  // セッションからインストラクターID取得
  const session = getSession();
  const instructorId = session.instructorId;

  // クラス一覧を取得して描画
  await loadClasses(instructorId);

  // フォーム送信イベント
  const classForm = document.getElementById('class-form');
  classForm.addEventListener('submit', (e) => handleFormSubmit(e, instructorId));

  // サインアウトボタン
  const signoutBtn = document.getElementById('signout-btn');
  signoutBtn.addEventListener('click', handleSignout);

  // メニューに戻るボタン
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // セッションを保持したままメニューページへ戻る
      window.location.href = 'index.html';
    });
  }
});

/**
 * クラス一覧を取得してテーブルに描画する
 * @param {string} instructorId - インストラクターID
 */
async function loadClasses(instructorId) {
  try {
    const data = await getClasses(instructorId);
    const classes = data.classes || [];
    renderClassTable(classes);
  } catch (error) {
    showError('クラス一覧の取得に失敗しました。');
  }
}

/**
 * クラス一覧テーブルを描画する
 * @param {Array} classes - クラス情報の配列
 */
function renderClassTable(classes) {
  const tableBody = document.getElementById('class-table-body');
  tableBody.innerHTML = '';

  classes.forEach((cls) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(cls.classId)}</td>
      <td>${escapeHtml(cls.className)}</td>
      <td>${escapeHtml(cls.startDate)}</td>
      <td>${escapeHtml(cls.endDate)}</td>
    `;

    // 行クリックで既存クラスをフォームに反映（要件 5.6）
    tr.addEventListener('click', () => selectClass(cls, tr));
    tableBody.appendChild(tr);
  });
}

/**
 * 既存クラスをフォームに反映する（要件 5.6）
 * @param {object} cls - クラス情報
 * @param {HTMLElement} selectedRow - 選択された行
 */
function selectClass(cls, selectedRow) {
  // 選択状態のスタイルを更新
  const tableBody = document.getElementById('class-table-body');
  const rows = tableBody.querySelectorAll('tr');
  rows.forEach((row) => row.classList.remove('tr--selected'));
  selectedRow.classList.add('tr--selected');

  // フォームに値を反映
  document.getElementById('class-id').value = cls.classId;
  document.getElementById('class-name').value = cls.className;
  document.getElementById('start-date').value = cls.startDate;
  document.getElementById('end-date').value = cls.endDate;
  document.getElementById('class-password').value = '';

  // クラスIDを読み取り専用にする（更新モード）
  document.getElementById('class-id').readOnly = true;

  // ボタンテキストを「更新」に変更
  document.getElementById('register-btn').textContent = '更新';

  // 更新モードフラグを設定
  isUpdate = true;

  // メッセージをクリア
  clearMessages();
}

/**
 * フォーム送信ハンドラー
 * バリデーション → API呼び出し → 一覧更新
 * @param {Event} e - submitイベント
 * @param {string} instructorId - インストラクターID
 */
async function handleFormSubmit(e, instructorId) {
  e.preventDefault();
  clearMessages();

  // フォーム値取得
  const classId = document.getElementById('class-id').value.trim();
  const className = document.getElementById('class-name').value.trim();
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const password = document.getElementById('class-password').value;

  // バリデーション: 必須項目チェック（要件 5.4）
  if (!classId || !className || !startDate || !endDate || !password) {
    showError('全てのフィールドを入力してください。');
    return;
  }

  // バリデーション: 日付範囲チェック（要件 5.7）
  if (startDate > endDate) {
    showError('開始日は最終日より前の日付を設定してください。');
    return;
  }

  try {
    // API呼び出し
    await saveClass(instructorId, {
      classId,
      className,
      startDate,
      endDate,
      password,
      isUpdate
    });

    // 成功メッセージ表示
    if (isUpdate) {
      showSuccess('クラス情報を更新しました。');
    } else {
      showSuccess('クラスを登録しました。');
    }

    // クラス一覧を更新
    await loadClasses(instructorId);

    // フォームリセット
    resetForm();
  } catch (error) {
    // 重複エラー（409）（要件 5.3）
    if (error.status === 409) {
      showError('同じクラスIDがすでに存在します。');
    } else {
      showError(error.message || 'クラスの保存に失敗しました。');
    }
  }
}

/**
 * サインアウト処理
 */
function handleSignout() {
  clearSession();
  window.location.href = 'index.html';
}

/**
 * フォームをリセットする
 */
function resetForm() {
  document.getElementById('class-form').reset();
  document.getElementById('class-id').readOnly = false;
  document.getElementById('register-btn').textContent = '登録';
  isUpdate = false;

  // テーブルの選択状態を解除
  const tableBody = document.getElementById('class-table-body');
  const rows = tableBody.querySelectorAll('tr');
  rows.forEach((row) => row.classList.remove('tr--selected'));
}

/**
 * エラーメッセージを表示する
 * @param {string} message - エラーメッセージ
 */
function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.classList.add('message--error');

  // 成功メッセージを非表示
  const successEl = document.getElementById('success-message');
  successEl.textContent = '';
  successEl.classList.remove('message--success');
}

/**
 * 成功メッセージを表示する
 * @param {string} message - 成功メッセージ
 */
function showSuccess(message) {
  const successEl = document.getElementById('success-message');
  successEl.textContent = message;
  successEl.classList.add('message--success');

  // エラーメッセージを非表示
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = '';
  errorEl.classList.remove('message--error');
}

/**
 * メッセージをクリアする
 */
function clearMessages() {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = '';
  errorEl.classList.remove('message--error');

  const successEl = document.getElementById('success-message');
  successEl.textContent = '';
  successEl.classList.remove('message--success');
}

/**
 * HTMLエスケープユーティリティ
 * XSS防止のためテーブル表示時にエスケープする
 * @param {string} str - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
