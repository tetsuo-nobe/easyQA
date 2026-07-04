// easyQA 認証・セッション管理モジュール
// sessionStorage を使用したクライアントサイドセッション管理

// sessionStorage に使用するキー定数
const SESSION_KEY_ROLE = 'easyqa_role';
const SESSION_KEY_CLASS_ID = 'easyqa_classId';
const SESSION_KEY_INSTRUCTOR_ID = 'easyqa_instructorId';

/**
 * セッション情報を sessionStorage に保存する
 * @param {string} role - ユーザーロール ('learner' または 'instructor')
 * @param {string|null} classId - クラスID（learner の場合に使用）
 * @param {string|null} instructorId - インストラクターID（instructor の場合に使用）
 */
function saveSession(role, classId, instructorId) {
  sessionStorage.setItem(SESSION_KEY_ROLE, role);
  if (classId) {
    sessionStorage.setItem(SESSION_KEY_CLASS_ID, classId);
  }
  if (instructorId) {
    sessionStorage.setItem(SESSION_KEY_INSTRUCTOR_ID, instructorId);
  }
}

/**
 * sessionStorage からセッション情報を取得する
 * @returns {{ role: string, classId: string|null, instructorId: string|null } | null}
 *   セッションが存在する場合はオブジェクト、存在しない場合は null
 */
function getSession() {
  const role = sessionStorage.getItem(SESSION_KEY_ROLE);
  if (!role) {
    return null;
  }
  return {
    role: role,
    classId: sessionStorage.getItem(SESSION_KEY_CLASS_ID),
    instructorId: sessionStorage.getItem(SESSION_KEY_INSTRUCTOR_ID)
  };
}

/**
 * sessionStorage のセッション情報をクリアする
 */
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY_ROLE);
  sessionStorage.removeItem(SESSION_KEY_CLASS_ID);
  sessionStorage.removeItem(SESSION_KEY_INSTRUCTOR_ID);
}

/**
 * 認証チェックを行い、セッションが存在しないかロールが一致しない場合は
 * サインインページへリダイレクトする
 * @param {string} expectedRole - 期待されるロール ('learner' または 'instructor')
 */
function requireAuth(expectedRole) {
  const session = getSession();
  if (!session || session.role !== expectedRole) {
    window.location.href = 'index.html';
  }
}
