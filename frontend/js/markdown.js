// easyQA Markdown変換・サニタイズモジュール
// marked.js（Markdown → HTML変換）と DOMPurify（HTMLサニタイズ）を組み合わせ、
// 質問・回答の表示用テキストを安全なHTML文字列に変換するラッパーモジュール。
// marked, DOMPurify はいずれもCDN経由で読み込まれるグローバル変数を参照する。

(function () {
  'use strict';

  // marked.js に渡すオプション
  // gfm: GitHub Flavored Markdownの記法を有効にする
  // breaks: 単一の改行を <br> に変換する（gfm: true が前提）
  const MARKED_OPTIONS = {
    gfm: true,
    breaks: true
  };

  // DOMPurify に渡すサニタイズ設定
  // ALLOWED_TAGS: 許可するHTML要素のホワイトリスト
  // ALLOWED_ATTR: 許可するHTML属性のホワイトリスト
  // ALLOWED_URI_REGEXP: href等のURI属性値として許可するスキームの正規表現
  //   （http:// または https:// で始まるURIのみを許可し、javascript: 等を無効化する）
  const SANITIZE_CONFIG = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'code', 'pre', 'del',
      'ul', 'ol', 'li',
      'a',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i
  };

  // DOMPurifyは ALLOWED_URI_REGEXP 設定時、安全性の観点から <a> の target 属性
  // （および連動する rel 属性）を自動的に除去する仕様がある（DOMPurify既知の挙動）。
  // href が許可済みURIスキームである正当なリンクについては、サニタイズ後に
  // target="_blank" と rel="noopener noreferrer" を付与し直す（要件4.3）。
  // 重複登録を避けるため、このフックはモジュール読み込み時に一度だけ登録する。
  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  /**
   * <, >, &, ", ' をHTMLエンティティに変換する
   * 投稿者名の表示や、textareaに既存回答をセットする際（Markdown変換を適用しない箇所）に使用する
   * @param {string} text - エスケープ対象の文字列
   * @returns {string} エスケープ済みの文字列（text が null/undefined の場合は空文字列）
   */
  function escapeHtmlEntities(text) {
    if (text === null || text === undefined) {
      return '';
    }
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Markdownリンク記法（[text](url)）で記述されていない素のURL文字列を、
   * marked.js に渡す前にMarkdownリンク記法（[URL](URL)）へ変換する
   * @param {string} text - 変換対象のプレーンテキスト
   * @returns {string} 素のURLをMarkdownリンク記法に変換した文字列（text が null/undefined の場合は空文字列）
   */
  function autoLinkPlainUrls(text) {
    if (text === null || text === undefined) {
      return '';
    }

    const str = String(text);

    // Markdownリンク記法（[text](url)）にマッチする範囲を先に検出し、
    // その範囲を除外した部分にのみ素のURL検出を適用する（二重リンク化の防止）
    const markdownLinkPattern = /\[[^\]]*\]\([^)]*\)/g;
    // 素のURL検出用パターン。末尾の <>"')] 等の区切り文字はURLに含めない
    const plainUrlPattern = /(https?:\/\/[^\s<>"')\]]+)/g;

    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = markdownLinkPattern.exec(str)) !== null) {
      // Markdownリンク記法より前の部分（範囲外）にのみ素のURL検出を適用する
      const before = str.slice(lastIndex, match.index);
      result += before.replace(plainUrlPattern, '[$1]($1)');
      // Markdownリンク記法自体はそのまま維持する（対象外）
      result += match[0];
      lastIndex = match.index + match[0].length;
    }

    // 最後のMarkdownリンク記法より後の残り部分にも素のURL検出を適用する
    const rest = str.slice(lastIndex);
    result += rest.replace(plainUrlPattern, '[$1]($1)');

    return result;
  }

  /**
   * autoLinkPlainUrls() による前処理後、marked.parse() を呼び出して
   * サニタイズ前のHTML文字列を生成する
   * @param {string} text - 変換対象のプレーンテキスト（質問内容または回答内容）
   * @returns {string} サニタイズ前のHTML文字列（text が null/undefined の場合は空文字列）
   */
  function renderMarkdown(text) {
    if (text === null || text === undefined) {
      return '';
    }

    const preprocessed = autoLinkPlainUrls(text);
    return marked.parse(preprocessed, MARKED_OPTIONS);
  }

  /**
   * 質問・回答の表示用テキストを、改行・Markdown記法を反映した安全なHTML文字列に変換する
   * renderMarkdown() による変換 → DOMPurify.sanitize() によるサニタイズの順で適用する
   * @param {string} text - 変換対象のプレーンテキスト（質問内容または回答内容）
   * @returns {string} サニタイズ済みのHTML文字列（innerHTMLに設定して使用する）
   */
  function renderMarkdownSafe(text) {
    const html = renderMarkdown(text);
    return DOMPurify.sanitize(html, SANITIZE_CONFIG);
  }

  // グローバル関数として公開する（既存の api.js, auth.js と同様のパターン）
  window.escapeHtmlEntities = escapeHtmlEntities;
  window.renderMarkdownSafe = renderMarkdownSafe;
})();
