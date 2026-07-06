// easyQA API通信モジュール

// デプロイ後に API Gateway の URL に変更してください
const API_BASE_URL = 'https://bfq294f6e3.execute-api.ap-northeast-1.amazonaws.com/Prod';

/**
 * サインインAPI
 * @param {string} role - ユーザーロール（"learner" または "instructor"）
 * @param {string} id - Class_ID または インストラクターID
 * @param {string} password - パスワード
 * @returns {Promise<object>} サインイン結果
 */
async function signIn(role, id, password) {
  const response = await fetch(`${API_BASE_URL}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, id, password })
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || 'サインインに失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * 質問一覧取得API
 * @param {string} classId - クラスID
 * @returns {Promise<object>} 質問一覧
 */
async function getQuestions(classId) {
  const response = await fetch(`${API_BASE_URL}/questions?classId=${encodeURIComponent(classId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || '質問一覧の取得に失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * 質問送信API
 * @param {string} classId - クラスID
 * @param {string} content - 質問内容（最大500文字）
 * @param {string} name - 投稿者名（任意・最大50文字）
 * @param {string} deletePassword - 削除用パスワード（半角英数字8文字）
 * @returns {Promise<object>} 送信結果
 */
async function submitQuestion(classId, content, name, deletePassword) {
  const response = await fetch(`${API_BASE_URL}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, content, name, deletePassword })
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || '質問の送信に失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * 質問削除API（論理削除）
 * @param {string} classId - クラスID
 * @param {number} questionNumber - 削除対象の質問番号
 * @param {string} deletePassword - 削除用パスワード
 * @returns {Promise<object>} 削除結果
 */
async function deleteQuestion(classId, questionNumber, deletePassword) {
  const response = await fetch(`${API_BASE_URL}/questions/${questionNumber}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, deletePassword })
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || '削除に失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * 回答送信API
 * @param {string} classId - クラスID
 * @param {number} questionNumber - 質問番号
 * @param {string} answerContent - 回答内容（最大1000文字）
 * @returns {Promise<object>} 送信結果
 */
async function submitAnswer(classId, questionNumber, answerContent) {
  const response = await fetch(`${API_BASE_URL}/questions/${questionNumber}/answer`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, answer: answerContent })
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || '回答の送信に失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * クラス一覧取得API
 * @param {string} instructorId - インストラクターID
 * @returns {Promise<object>} クラス一覧
 */
async function getClasses(instructorId) {
  const response = await fetch(`${API_BASE_URL}/classes?instructorId=${encodeURIComponent(instructorId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || 'クラス一覧の取得に失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * クラス登録・更新API
 * classData に classId が含まれており更新対象の場合は PUT、それ以外は POST で登録する
 * @param {string} instructorId - インストラクターID
 * @param {object} classData - クラス情報（classId, className, startDate, endDate, password）
 * @returns {Promise<object>} 登録・更新結果
 */
async function saveClass(instructorId, classData) {
  let url;
  let method;

  if (classData.classId && classData.isUpdate) {
    // 既存クラスの更新
    url = `${API_BASE_URL}/classes/${encodeURIComponent(classData.classId)}`;
    method = 'PUT';
  } else {
    // 新規クラスの登録
    url = `${API_BASE_URL}/classes`;
    method = 'POST';
  }

  const body = {
    instructorId,
    classId: classData.classId,
    className: classData.className,
    startDate: classData.startDate,
    endDate: classData.endDate,
    password: classData.password
  };

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.message || 'クラスの保存に失敗しました。');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * URLリンク変換ユーティリティ
 * テキスト中の URL を検出し、クリック可能なハイパーリンクに変換する
 * @param {string} text - 変換対象のテキスト
 * @returns {string} URL がリンクタグに変換されたHTML文字列
 */
function convertUrlsToLinks(text) {
  if (!text) return '';

  // URL を検出する正規表現（http:// または https:// で始まる文字列）
  const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;

  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}
