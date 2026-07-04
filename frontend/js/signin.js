// easyQA サインインページロジック
// 要件 1.1〜1.11 に対応

document.addEventListener('DOMContentLoaded', () => {
  // DOM要素の取得
  const roleLearnerBtn = document.getElementById('role-learner');
  const roleInstructorBtn = document.getElementById('role-instructor');
  const learnerForm = document.getElementById('learner-form');
  const instructorForm = document.getElementById('instructor-form');
  const errorMessage = document.getElementById('error-message');
  const instructorActions = document.getElementById('instructor-actions');
  const actionQaList = document.getElementById('action-qa-list');
  const actionClassRegister = document.getElementById('action-class-register');
  const classidInput = document.getElementById('classid-input');
  const classidSubmit = document.getElementById('classid-submit');
  const signoutBtn = document.getElementById('signout-btn');

  // --- 既存セッションの復元 ---
  // インストラクターがメニューに戻ってきた場合、アクション選択UIを自動表示する
  const existingSession = getSession();
  if (existingSession && existingSession.role === 'instructor') {
    // ロール選択ボタンを非表示（受講者ボタンを隠す）
    const roleSelector = document.querySelector('.role-selector');
    if (roleSelector) roleSelector.classList.add('hidden');
    // フォームを非表示にしてアクション選択UIを表示
    instructorForm.classList.add('hidden');
    learnerForm.classList.add('hidden');
    instructorActions.classList.remove('hidden');
  }

  // --- ロール選択（要件 1.1〜1.3）---

  /**
   * エラーメッセージを非表示にする
   */
  function clearError() {
    errorMessage.textContent = '';
    errorMessage.classList.remove('message--error');
  }

  /**
   * エラーメッセージを表示する
   * @param {string} message - 表示するエラーメッセージ
   */
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('message--error');
  }

  /**
   * ロール選択ボタンのアクティブ状態を切り替え、対応フォームを表示する
   * @param {'learner'|'instructor'} role - 選択されたロール
   */
  function selectRole(role) {
    clearError();

    // ボタンのアクティブクラスを切り替え
    if (role === 'learner') {
      roleLearnerBtn.classList.add('role-selector__btn--active');
      roleInstructorBtn.classList.remove('role-selector__btn--active');
      learnerForm.classList.remove('hidden');
      instructorForm.classList.add('hidden');
    } else {
      roleInstructorBtn.classList.add('role-selector__btn--active');
      roleLearnerBtn.classList.remove('role-selector__btn--active');
      instructorForm.classList.remove('hidden');
      learnerForm.classList.add('hidden');
    }

    // アクション選択・ClassID入力を非表示に戻す
    instructorActions.classList.add('hidden');
    classidInput.classList.add('hidden');
  }

  roleLearnerBtn.addEventListener('click', () => selectRole('learner'));
  roleInstructorBtn.addEventListener('click', () => selectRole('instructor'));

  // --- 受講者サインイン送信（要件 1.4, 1.6）---

  learnerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const classId = document.getElementById('learner-class-id').value.trim();
    const password = document.getElementById('learner-password').value;

    if (!classId || !password) {
      showError('すべての項目を入力してください。');
      return;
    }

    try {
      await signIn('learner', classId, password);
      // 成功時: セッション保存して受講者ページへ遷移
      saveSession('learner', classId, null);
      window.location.href = 'learner.html';
    } catch (error) {
      // エラー時: 日本語メッセージを表示し、フォームの入力内容は保持
      if (error.status === 401) {
        showError('IDまたはパスワードが正しくありません。');
      } else {
        showError(error.message || 'サインインに失敗しました。');
      }
    }
  });

  // --- インストラクターサインイン送信（要件 1.5, 1.7）---

  instructorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const instructorId = document.getElementById('instructor-id').value.trim();
    const password = document.getElementById('instructor-password').value;

    if (!instructorId || !password) {
      showError('すべての項目を入力してください。');
      return;
    }

    try {
      await signIn('instructor', instructorId, password);
      // 成功時: セッション保存、フォーム非表示、アクション選択UI表示
      saveSession('instructor', null, instructorId);
      instructorForm.classList.add('hidden');
      // ロール選択ボタンを非表示（受講者ボタンを隠す）
      const roleSelector = document.querySelector('.role-selector');
      if (roleSelector) roleSelector.classList.add('hidden');
      instructorActions.classList.remove('hidden');
    } catch (error) {
      // エラー時: 日本語メッセージを表示し、フォームの入力内容は保持
      if (error.status === 401) {
        showError('IDまたはパスワードが正しくありません。');
      } else {
        showError(error.message || 'サインインに失敗しました。');
      }
    }
  });

  // --- インストラクターアクション選択（要件 1.5, 1.8, 1.9, 1.10, 1.11）---

  // 「質問・回答一覧」ボタン → ClassID入力エリア表示（要件 1.8）
  actionQaList.addEventListener('click', () => {
    clearError();
    classidInput.classList.remove('hidden');
  });

  // 「クラス登録」ボタン → クラス登録ページへ遷移（要件 1.11）
  actionClassRegister.addEventListener('click', () => {
    window.location.href = 'class-registration.html';
  });

  // ClassID確定ボタン → セッションにclassId保存 + インストラクターページへ遷移（要件 1.9, 1.10）
  classidSubmit.addEventListener('click', () => {
    clearError();

    const classId = document.getElementById('instructor-class-id').value.trim();

    if (!classId) {
      showError('クラスIDを入力してください。');
      return;
    }

    // セッションにclassIdを追加保存
    const session = getSession();
    if (session) {
      saveSession(session.role, classId, session.instructorId);
    }

    // インストラクターページへ遷移
    window.location.href = 'instructor.html';
  });

  // サインアウトボタン
  signoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });
});
