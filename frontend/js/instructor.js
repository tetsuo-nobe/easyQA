// easyQA インストラクターページロジック
// 質問・回答一覧の表示と回答入力機能を提供する

(function () {
  'use strict';

  // 現在選択中の質問番号
  let selectedQuestionNumber = null;

  /**
   * エラーメッセージを表示する
   * @param {string} message - 表示するメッセージ
   */
  function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.classList.add('message--error');
    errorEl.style.display = 'block';
  }

  /**
   * エラーメッセージをクリアする
   */
  function clearError() {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = '';
    errorEl.classList.remove('message--error');
    errorEl.style.display = 'none';
  }

  /**
   * HTMLエスケープ（XSS対策）
   * @param {string} str - エスケープ対象の文字列
   * @returns {string} エスケープ済み文字列
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /**
   * 質問・回答一覧を描画する
   * @param {Array} questions - 質問配列
   */
  function renderQuestions(questions) {
    const listEl = document.getElementById('question-list');

    if (!questions || questions.length === 0) {
      listEl.innerHTML = '<div class="empty-state">質問はまだありません。</div>';
      return;
    }

    let html = '';
    questions.forEach(function (q) {
      const isSelected = q.questionNumber === selectedQuestionNumber;
      const selectedClass = isSelected ? ' question-card--selected' : '';

      // 質問内容をHTMLエスケープしてからURLをリンクに変換
      const contentHtml = convertUrlsToLinks(escapeHtml(q.content));

      // 日付フォーマット
      const dateStr = q.submittedAt
        ? new Date(q.submittedAt).toLocaleString('ja-JP')
        : '';

      // 投稿者名
      const nameHtml = q.name
        ? '<div class="question-card__name">投稿者: ' + escapeHtml(q.name) + '</div>'
        : '';

      html += '<div class="question-card question-card--selectable' + selectedClass + '" data-question-number="' + q.questionNumber + '">';
      html += '  <div class="question-card__header">';
      html += '    <span class="question-card__number">質問 #' + q.questionNumber + '</span>';
      html += '    <span class="question-card__date">' + dateStr + '</span>';
      html += '  </div>';
      html += nameHtml;
      html += '  <div class="question-card__content">' + contentHtml + '</div>';

      // 回答エリア
      html += '  <div class="answer-area">';
      if (q.answer) {
        const answerHtml = convertUrlsToLinks(escapeHtml(q.answer));
        html += '    <div class="answer-area__label">回答</div>';
        html += '    <div class="answer-area__content">' + answerHtml + '</div>';
      } else {
        html += '    <div class="answer-area__unanswered">未回答</div>';
      }
      html += '  </div>';

      // 選択中の質問に回答入力フォームを表示
      if (isSelected) {
        const existingAnswer = q.answer ? escapeHtml(q.answer) : '';
        html += '  <div class="answer-form">';
        html += '    <textarea id="answer-input" maxlength="1000" placeholder="回答を入力してください（最大1000文字）">' + existingAnswer + '</textarea>';
        html += '    <div class="answer-form__actions">';
        html += '      <button id="submit-answer-btn" class="btn btn--primary">回答を送信</button>';
        html += '    </div>';
        html += '  </div>';
      }

      html += '</div>';
    });

    listEl.innerHTML = html;

    // カードクリックイベントを設定
    bindCardClickEvents(questions);

    // 回答送信ボタンのイベント設定
    if (selectedQuestionNumber !== null) {
      bindSubmitAnswerEvent();
    }
  }

  /**
   * 質問カードのクリックイベントをバインドする
   * @param {Array} questions - 質問配列
   */
  function bindCardClickEvents(questions) {
    const cards = document.querySelectorAll('.question-card--selectable');
    cards.forEach(function (card) {
      card.addEventListener('click', function (e) {
        // テキストエリアやボタンのクリックはカード選択として処理しない
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
          return;
        }
        const questionNumber = parseInt(card.getAttribute('data-question-number'), 10);

        // 同じカードを再度クリックした場合は選択解除
        if (selectedQuestionNumber === questionNumber) {
          selectedQuestionNumber = null;
        } else {
          selectedQuestionNumber = questionNumber;
        }

        clearError();
        renderQuestions(questions);
      });
    });
  }

  /**
   * 回答送信ボタンのイベントをバインドする
   */
  function bindSubmitAnswerEvent() {
    const submitBtn = document.getElementById('submit-answer-btn');
    if (!submitBtn) return;

    submitBtn.addEventListener('click', function () {
      handleSubmitAnswer();
    });
  }

  /**
   * 回答送信処理
   */
  async function handleSubmitAnswer() {
    clearError();

    const answerInput = document.getElementById('answer-input');
    if (!answerInput) return;

    const answer = answerInput.value;

    // バリデーション: 空欄・空白のみチェック
    if (!answer || answer.trim() === '') {
      showError('回答内容を入力してください。');
      return;
    }

    // 確認ダイアログ
    if (!confirm('回答を送信します。よろしいですか？')) {
      return;
    }

    // セッションからclassIdを取得
    const session = getSession();
    if (!session || !session.classId) {
      showError('セッションが無効です。再度サインインしてください。');
      return;
    }

    try {
      await submitAnswer(session.classId, selectedQuestionNumber, answer.trim());

      // 送信成功: 一覧を再取得して更新
      await loadQuestions(session.classId);
    } catch (error) {
      showError('送信に失敗しました。');
    }
  }

  /**
   * 質問一覧を取得して描画する
   * @param {string} classId - クラスID
   */
  async function loadQuestions(classId) {
    try {
      const data = await getQuestions(classId);
      const questions = data.questions || data;
      renderQuestions(Array.isArray(questions) ? questions : []);
    } catch (error) {
      showError('質問一覧の取得に失敗しました。');
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
   * ページ初期化
   */
  function init() {
    // 認証チェック
    requireAuth('instructor');

    // セッション情報を取得
    const session = getSession();
    if (!session || !session.classId) {
      window.location.href = 'index.html';
      return;
    }

    // サインアウトボタンのイベント設定
    const signoutBtn = document.getElementById('signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', handleSignout);
    }

    // メニューに戻るボタンのイベント設定
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        // セッションを保持したままメニューページへ戻る
        window.location.href = 'index.html';
      });
    }

    // 質問一覧を読み込む
    loadQuestions(session.classId);
  }

  // ページ読み込み時に初期化
  document.addEventListener('DOMContentLoaded', init);
})();
