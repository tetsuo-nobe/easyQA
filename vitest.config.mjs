import { defineConfig } from 'vitest/config';

// easyQA テスト環境設定（開発用、本番配信物には影響しない）
// frontend/js/markdown.js は window.escapeHtmlEntities / window.renderMarkdownSafe として
// グローバルに公開される構成のため、window オブジェクトが存在する jsdom 環境を使用する
export default defineConfig({
  test: {
    environment: 'jsdom'
  }
});
