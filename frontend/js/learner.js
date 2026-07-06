// easyQA 受講者ページロジック

// ページ読込時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
  // 認証チェック: learner ロールでない場合はサインインページへリダイレクト
  requireAuth('learner');

  // セッションからクラスIDを取得
  const session = getSession();
  const classId = session.classId;

  // 質問一覧を初期表示
  loadQuestions(classId);

  // フォーム送信イベント
  const form = document.getElementById('question-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmitQuestion(classId);
  });

  // サインアウトボタン
  const signoutBtn = document.getElementById('signout-btn');
  signoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });
});

/**
 * 質問一覧を取得して描画する
 * @param {string} classId - クラスID
 */
async function loadQuestions(classId) {
  try {
    const data = await getQuestions(classId);
    renderQuestions(data.questions || [], classId);
  } catch (error) {
    // 通信エラー時は一覧エリアにメッセージ表示
    const listContainer = document.getElementById('question-list');
    listContainer.innerHTML = '<p class="message message--error">質問一覧の取得に失敗しました。</p>';
  }
}

/**
 * 質問一覧をDOMに描画する
 * @param {Array} questions - 質問データの配列（降順ソート済み）
 * @param {string} classId - クラスID
 */
function renderQuestions(questions, classId) {
  const listContainer = document.getElementById('question-list');

  if (questions.length === 0) {
    listContainer.innerHTML = '<p>質問はまだありません。</p>';
    return;
  }

  const html = questions.map((q) => {
    // 日時フォーマット
    const dateStr = formatDate(q.submittedAt);

    // 質問内容をURL変換して表示
    const contentHtml = convertUrlsToLinks(escapeHtml(q.content));

    // 名前の表示（未入力時は「匿名」）
    const nameDisplay = q.name ? escapeHtml(q.name) : '匿名';

    // 回答エリア
    let answerHtml;
    if (q.answer) {
      // 回答ありの場合: URLリンク変換して表示
      const answerContentHtml = convertUrlsToLinks(escapeHtml(q.answer));
      answerHtml = `
        <div class="answer-area">
          <span class="answer-area__label">回答:</span>
          <div class="answer-area__content">${answerContentHtml}</div>
        </div>
      `;
    } else {
      // 未回答の場合
      answerHtml = `
        <div class="answer-area">
          <span class="answer-area__label">回答:</span>
          <span class="answer-area__unanswered">未回答</span>
        </div>
      `;
    }

    return `
      <div class="question-card">
        <div class="question-card__header">
          <span class="question-card__number">質問 #${q.questionNumber}</span>
          <span class="question-card__date">${dateStr}</span>
          <span class="question-card__name">${nameDisplay}</span>
          <button class="question-card__delete-link" data-question-number="${q.questionNumber}" type="button">削除</button>
        </div>
        <div class="question-card__content">${contentHtml}</div>
        ${answerHtml}
      </div>
    `;
  }).join('');

  listContainer.innerHTML = html;

  // 削除ボタンのイベントリスナー登録
  listContainer.querySelectorAll('.question-card__delete-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const questionNumber = parseInt(btn.dataset.questionNumber, 10);
      handleDeleteQuestion(classId, questionNumber);
    });
  });
}

/**
 * 質問送信処理
 * バリデーション → 確認ダイアログ → API送信 → 一覧更新 → フォームクリア
 * @param {string} classId - クラスID
 */
async function handleSubmitQuestion(classId) {
  const contentEl = document.getElementById('question-content');
  const nameEl = document.getElementById('question-name');
  const deletePasswordEl = document.getElementById('question-delete-password');
  const errorEl = document.getElementById('submit-error');

  // エラーメッセージをクリア
  errorEl.textContent = '';
  errorEl.classList.remove('message--error');

  const content = contentEl.value;
  const name = nameEl.value.trim();
  const deletePassword = deletePasswordEl.value;

  // バリデーション: 空欄チェック（空白のみも無効）
  if (!content || content.trim() === '') {
    showError(errorEl, '質問内容を入力してください。');
    return;
  }

  // バリデーション: 文字数超過チェック
  if (content.length > 500) {
    showError(errorEl, '質問内容は500文字以内で入力してください。');
    return;
  }

  // バリデーション: 削除用パスワード（必須）
  if (!deletePassword) {
    showError(errorEl, '削除用パスワードを入力してください。');
    return;
  }
  // バリデーション: 半角英数字8文字以上チェック
  if (!/^[A-Za-z0-9]{8,}$/.test(deletePassword)) {
    showError(errorEl, '削除用パスワードは半角英数字8文字以上で入力してください。');
    return;
  }

  // 確認ダイアログ
  if (!confirm('質問を送信します。よろしいですか？')) {
    return;
  }

  // 処理中表示 + 送信ボタン無効化
  const processingEl = document.getElementById('submit-processing');
  const submitBtn = document.querySelector('#question-form button[type="submit"]');
  processingEl.classList.remove('hidden');
  submitBtn.disabled = true;

  // API送信
  try {
    await submitQuestion(classId, content, name, deletePassword);

    // 成功時: 一覧を再取得して更新
    await loadQuestions(classId);

    // フォームをクリア
    contentEl.value = '';
    nameEl.value = '';
    deletePasswordEl.value = '';
    errorEl.textContent = '';
    errorEl.classList.remove('message--error');
  } catch (error) {
    // 通信エラー時: エラーメッセージを表示し、入力内容を保持
    showError(errorEl, '送信に失敗しました。');
  } finally {
    // 処理中表示を必ず解除・ボタン再有効化
    processingEl.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

/**
 * 質問削除処理フロー
 * prompt → 処理中表示 → API呼び出し → 結果反映
 * @param {string} classId - クラスID
 * @param {number} questionNumber - 削除対象の質問番号
 */
async function handleDeleteQuestion(classId, questionNumber) {
  // 削除用パスワード入力プロンプト
  const deletePassword = prompt('削除用パスワードを入力してください。');
  if (deletePassword === null) {
    // キャンセル: 何もしない
    return;
  }

  // 処理中表示 + 全削除ボタンを無効化
  const processingEl = document.getElementById('delete-processing');
  processingEl.classList.remove('hidden');
  const allDeleteBtns = document.querySelectorAll('.question-card__delete-link');
  allDeleteBtns.forEach((btn) => { btn.disabled = true; });

  // エラーメッセージをクリア
  const errorEl = document.getElementById('submit-error');
  errorEl.textContent = '';
  errorEl.classList.remove('message--error');

  try {
    await deleteQuestion(classId, questionNumber, deletePassword);
    // 成功: 一覧再取得・再描画（DOM再描画されるのでボタン再有効化は不要）
    await loadQuestions(classId);
  } catch (error) {
    if (error.status === 401) {
      showError(errorEl, '削除用パスワードが正しくありません。');
    } else if (error.status === 403) {
      showError(errorEl, 'この質問は削除できません。（削除用パスワードが設定されていません）');
    } else {
      showError(errorEl, '削除に失敗しました。');
    }
    // エラー時のみ削除ボタンを再有効化
    document.querySelectorAll('.question-card__delete-link').forEach((btn) => { btn.disabled = false; });
  } finally {
    // 処理中メッセージを必ず非表示化
    processingEl.classList.add('hidden');
  }
}

/**
 * エラーメッセージを表示する
 * @param {HTMLElement} el - エラー表示要素
 * @param {string} message - エラーメッセージ
 */
function showError(el, message) {
  el.textContent = message;
  el.classList.add('message--error');
}

/**
 * HTMLエスケープ処理
 * XSS対策としてユーザー入力をエスケープする
 * @param {string} text - エスケープ対象のテキスト
 * @returns {string} エスケープ済みテキスト
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * ISO 8601日時文字列を表示用にフォーマットする
 * @param {string} isoString - ISO 8601形式の日時文字列
 * @returns {string} フォーマット済み日時文字列
 */
function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}
