// frontend/js/markdown.js の単体テスト・property-based test
//
// markdown.js はESモジュールではなく、IIFEでラップされ window.escapeHtmlEntities /
// window.renderMarkdownSafe としてグローバルに公開される、グローバルスコープ用スクリプトである。
// そのため、このテストファイルではファイル内容を読み込んで Node.js の vm モジュールで実行し、
// marked / DOMPurify / window をグローバルとして用意したコンテキスト内で markdown.js を評価する。
// vitest.config.js で test.environment = 'jsdom' を設定しているため、globalThis.window が
// 利用可能な状態でテストが実行される。

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import fc from 'fast-check';

const markdownJsPath = path.join(__dirname, 'markdown.js');

beforeAll(() => {
  // markdown.js が参照するグローバル変数（marked, DOMPurify）を jsdom の window に用意する
  globalThis.window.marked = marked;
  globalThis.window.DOMPurify = DOMPurify;

  const code = readFileSync(markdownJsPath, 'utf-8');
  // markdown.js 内部からも marked / DOMPurify / window をグローバルとして参照できるように、
  // vm.runInThisContext で現在のグローバルコンテキスト内にコードを評価する。
  // これにより window.escapeHtmlEntities / window.renderMarkdownSafe が実際に設定される。
  vm.runInThisContext(code, { filename: markdownJsPath });
});

describe('escapeHtmlEntities', () => {
  it('scriptタグ文字列をエスケープする', () => {
    const input = '<script>alert(1)</script>';
    const result = window.escapeHtmlEntities(input);

    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('nullを渡した場合に空文字列を返す', () => {
    expect(window.escapeHtmlEntities(null)).toBe('');
  });

  it('undefinedを渡した場合に空文字列を返す', () => {
    expect(window.escapeHtmlEntities(undefined)).toBe('');
  });

  it('空文字列を渡した場合に空文字列を返す', () => {
    expect(window.escapeHtmlEntities('')).toBe('');
  });

  it('& を &amp; に変換する', () => {
    expect(window.escapeHtmlEntities('&')).toBe('&amp;');
  });

  it('< を &lt; に変換する', () => {
    expect(window.escapeHtmlEntities('<')).toBe('&lt;');
  });

  it('> を &gt; に変換する', () => {
    expect(window.escapeHtmlEntities('>')).toBe('&gt;');
  });

  it('" を &quot; に変換する', () => {
    expect(window.escapeHtmlEntities('"')).toBe('&quot;');
  });

  it("' を &#39; に変換する", () => {
    expect(window.escapeHtmlEntities("'")).toBe('&#39;');
  });
});

describe('回答入力欄への既存回答セット処理', () => {
  // タスク9.3: 回答入力欄への既存回答セット処理の単体テスト
  //
  // design.mdの「frontend/js/instructor.js（変更）」セクションに記載の通り、
  // 回答入力欄（<textarea id="answer-input">）へのセット値は escapeHtmlEntities(q.answer) で
  // あり、renderMarkdownSafe() は適用しない設計になっている。
  // 本テストは instructor.js のDOM操作を直接テストするのではなく、
  // escapeHtmlEntities() を使った際の挙動が renderMarkdownSafe() と異なることを確認する
  // 単体テストとして実装する（design.mdのTesting Strategyセクション参照）。
  // Requirements: 6.3

  it('Markdown記法の記号を含む回答をescapeHtmlEntities()に通した結果、Markdown変換されずプレーンテキストのまま保持される', () => {
    const answer = '**強調**の回答です。<script>';

    const escaped = window.escapeHtmlEntities(answer);
    const rendered = window.renderMarkdownSafe(answer);

    // escapeHtmlEntities()の結果には Markdown記法の記号（**）がそのまま残る
    expect(escaped).toContain('**強調**の回答です。');
    // <script>部分はHTMLエンティティエスケープのみが適用され、タグとしては解釈されない
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('<strong>');

    // 対比: renderMarkdownSafe()の結果ではMarkdown記法が解釈され<strong>要素が生成される
    const container = window.document.createElement('div');
    container.innerHTML = rendered;
    const strongEls = container.querySelectorAll('strong');
    expect(strongEls.length).toBeGreaterThanOrEqual(1);
    expect(strongEls[0].textContent).toBe('強調');

    // escapeHtmlEntities()とrenderMarkdownSafe()の出力が異なることを明示する
    expect(escaped).not.toBe(rendered);
  });
});

describe('renderMarkdownSafe - Property 3', () => {
  // Feature: markdown-answer-display, Property 3: Markdownリンクと素のURLはそれぞれ1つのリンクに変換される
  //
  // Markdownリンク記法（[text](url)、urlはhttp(s)始まり）と素のURL（http(s)始まりの文字列）を
  // 組み合わせたテキストを生成し、renderMarkdownSafe() の出力に含まれる <a> 要素数が
  // 入力中のMarkdownリンク・素のURLの合計出現数と一致し、各 <a> 要素が
  // target="_blank" と rel="noopener noreferrer" を持つことを検証する。
  // Validates: Requirements 4.1, 4.2, 4.3, 4.4

  // URLのパス部分に使う、Markdown記法の記号や空白と衝突しない安全な文字集合
  const urlPathCharArb = fc
    .array(
      fc.constantFrom(
        'a', 'b', 'c', 'd', 'e', 'f', 'g', '0', '1', '2', '3', '9', '-', '_', '.', '/'
      ),
      { minLength: 0, maxLength: 12 }
    )
    .map((chars) => chars.join(''));

  // http:// または https:// で始まる、素のURLとして解釈可能な文字列を生成する
  const plainUrlArb = fc
    .tuple(fc.constantFrom('http', 'https'), fc.constantFrom('example.com', 'test.example.org'), urlPathCharArb)
    .map(([scheme, host, path]) => `${scheme}://${host}${path ? '/' + path : ''}`);

  // Markdownリンクのリンクラベルに使う、角括弧・改行を含まない安全な文字列を生成する
  const linkLabelArb = fc
    .array(fc.constantFrom('a', 'b', 'c', 'x', 'y', 'z', '1', '2', ' '), { minLength: 1, maxLength: 8 })
    .map((chars) => chars.join(''))
    .filter((label) => label.trim().length > 0);

  // Markdownリンク（[label](url)）または素のURLのいずれかを表すトークンを生成する
  const linkTokenArb = fc.oneof(
    plainUrlArb.chain((url) =>
      linkLabelArb.map((label) => ({ text: `[${label}](${url})`, kind: 'markdown-link' }))
    ),
    plainUrlArb.map((url) => ({ text: url, kind: 'plain-url' }))
  );

  // トークンとトークンの間を区切る、URL検出やMarkdownリンク検出を阻害しない区切り文字列
  const separatorArb = fc.constantFrom(' ', '\n', '  ', ' / ');

  it('入力中のMarkdownリンク・素のURLの出現数と <a> 要素数が一致し、各 <a> にtarget/relが付与される', () => {
    fc.assert(
      fc.property(
        fc.array(linkTokenArb, { minLength: 1, maxLength: 6 }),
        fc.array(separatorArb, { minLength: 0, maxLength: 6 }),
        (tokens, separators) => {
          // トークンの間に区切り文字を挟んでテキストを構築する
          // （区切り文字が不足する場合はスペースで補う）
          let text = '';
          tokens.forEach((token, index) => {
            if (index > 0) {
              text += separators[index - 1] !== undefined ? separators[index - 1] : ' ';
            }
            text += token.text;
          });

          const html = window.renderMarkdownSafe(text);

          const container = window.document.createElement('div');
          container.innerHTML = html;
          const anchors = container.querySelectorAll('a');

          expect(anchors.length).toBe(tokens.length);

          anchors.forEach((anchor) => {
            expect(anchor.getAttribute('target')).toBe('_blank');
            expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('renderMarkdownSafe - Property 1', () => {
  // Feature: markdown-answer-display, Property 1: サニタイズ後は許可要素・属性のみが残る
  //
  // HTMLタグ・スクリプト・CommonMark/GFM記法の断片を含む任意の文字列を生成し、
  // renderMarkdownSafe() の出力をjsdomでパースした結果、ALLOWED_TAGSに含まれないタグ名の
  // 要素が存在しないこと、および存在する各要素の属性がすべてALLOWED_ATTRに含まれるものだけで
  // あることを検証する。
  // Validates: Requirements 3.1, 3.2, 3.4, 3.5

  // design.md の SANITIZE_CONFIG（frontend/js/markdown.js内）と同一の許可リストをテスト側でも保持する
  const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'del',
    'ul', 'ol', 'li',
    'a',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ];
  const ALLOWED_ATTR = ['href', 'target', 'rel'];

  // HTMLタグ・スクリプトの断片（危険な要素・属性の混入を狙う）
  const htmlFragmentArb = fc.constantFrom(
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">click</a>',
    '<div onclick="alert(1)">',
    '<style>body{}</style>',
    '<form><input type="text"></form>',
    '<svg onload=alert(1)>',
    '<table><tr><td>cell</td></tr></table>',
    '<h1 id="x" class="y">heading</h1>'
  );

  // CommonMark/GFM記法の断片
  const markdownFragmentArb = fc.constantFrom(
    '**bold**',
    '*italic*',
    '`code`',
    '- list item',
    '1. numbered item',
    '[text](https://example.com)',
    '# heading',
    '## heading2',
    '> blockquote',
    '---',
    '~~strike~~',
    '| a | b |\n| --- | --- |\n| 1 | 2 |'
  );

  // 通常のプレーンテキストの断片
  const plainFragmentArb = fc
    .array(fc.constantFrom('a', 'b', 'c', ' ', '\n', '日', '本', '語', '1', '2'), {
      minLength: 0,
      maxLength: 10
    })
    .map((chars) => chars.join(''));

  // 上記の断片を任意の順序・組み合わせで連結した文字列を生成する
  const fragmentArb = fc.oneof(htmlFragmentArb, markdownFragmentArb, plainFragmentArb);
  const inputArb = fc
    .array(fragmentArb, { minLength: 0, maxLength: 8 })
    .map((fragments) => fragments.join(''));

  it('ALLOWED_TAGS外のタグが存在せず、存在する要素の属性がALLOWED_ATTR内のみである', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const html = window.renderMarkdownSafe(input);

        const container = window.document.createElement('div');
        container.innerHTML = html;

        const allElements = container.querySelectorAll('*');

        allElements.forEach((el) => {
          const tagName = el.tagName.toLowerCase();
          expect(ALLOWED_TAGS).toContain(tagName);

          Array.from(el.attributes).forEach((attr) => {
            expect(ALLOWED_ATTR).toContain(attr.name);
          });
        });
      }),
      { numRuns: 100 }
    );
  });
});

describe('renderMarkdownSafe - Property 2', () => {
  // Feature: markdown-answer-display, Property 2: 危険なURIスキームは無効化される
  //
  // `javascript:`, `data:`, `vbscript:` 等、http(s)以外の危険なURIスキームを持つ
  // Markdownリンク記法（[text](scheme:...)）の文字列を生成し、renderMarkdownSafe() の
  // 出力をjsdomでパースした結果、その`url`（危険なスキームを持つ元のURL文字列）を
  // href属性値とする <a> 要素が含まれないことを検証する。
  // Validates: Requirements 3.3

  // design.md の SANITIZE_CONFIG.ALLOWED_URI_REGEXP（frontend/js/markdown.js内）は
  // /^https?:\/\//i であり、http:// または https:// で始まらないURIスキームはすべて
  // hrefとして許可されない。ここではその代表例として危険性の高いスキームを列挙する。
  const dangerousSchemeArb = fc.constantFrom(
    'javascript:',
    'data:',
    'vbscript:',
    'JavaScript:',
    'JAVASCRIPT:',
    'data:text/html'
  );

  // スキーム以降に付与する、URLらしい残りの文字列（角括弧・丸括弧・改行と衝突しない文字集合）
  const schemeSuffixArb = fc
    .array(
      fc.constantFrom('a', 'b', 'c', '0', '1', 'alert', '(', '1', ')', ';', ',', '/', '.'),
      { minLength: 0, maxLength: 10 }
    )
    .map((chars) => chars.join(''))
    .filter((suffix) => !suffix.includes(']') && !suffix.includes('\n'));

  // Markdownリンクのリンクラベルに使う、角括弧・改行を含まない安全な文字列を生成する
  const linkLabelArb2 = fc
    .array(fc.constantFrom('a', 'b', 'c', 'x', 'y', 'z', '1', '2', ' '), { minLength: 1, maxLength: 8 })
    .map((chars) => chars.join(''))
    .filter((label) => label.trim().length > 0);

  // 危険なスキームを持つ url 文字列（例: "javascript:alert(1)"）を生成する
  const dangerousUrlArb = fc
    .tuple(dangerousSchemeArb, schemeSuffixArb)
    .map(([scheme, suffix]) => `${scheme}${suffix}`)
    // Markdownリンク記法の `(...)` 内で丸括弧の対応が崩れて記法自体が壊れないようにする
    .filter((url) => (url.match(/\(/g) || []).length === (url.match(/\)/g) || []).length);

  it('危険なURIスキームを持つMarkdownリンクのurlをhrefとする<a>要素が出力に含まれない', () => {
    fc.assert(
      fc.property(linkLabelArb2, dangerousUrlArb, (label, url) => {
        const input = `[${label}](${url})`;

        const html = window.renderMarkdownSafe(input);

        const container = window.document.createElement('div');
        container.innerHTML = html;
        const anchors = Array.from(container.querySelectorAll('a'));

        // 危険なスキームを持つ元のurlをhref属性値とする<a>要素が存在しないことを確認する
        const matched = anchors.filter((anchor) => anchor.getAttribute('href') === url);
        expect(matched.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

describe('renderMarkdownSafe - Property 4', () => {
  // Feature: markdown-answer-display, Property 4: 改行が表示に反映される
  //
  // Markdownのブロック記法の記号（#, -, *, >, 1.のような数字+ドット, |）を先頭に持たない
  // 2つの文字列 s1, s2 を生成し、s1 + "\n" + s2 を renderMarkdownSafe() に渡した出力に、
  // 改行を表す要素（<br> 要素、または段落分割による複数の <p> 要素）が少なくとも1つ
  // 含まれることをjsdomでパースして検証する。
  // Validates: Requirements 1.1, 1.2, 1.3

  // 行頭がMarkdownのブロック記法の記号（#, -, *, >, 数字+ドット/丸括弧, |）と解釈されないことを
  // 確認するための判定関数
  // （GFMでは番号付きリストのマーカーとして "1." だけでなく "1)" も解釈されるため、
  //   \d+\) も対象に含める）
  function startsWithBlockSyntax(str) {
    return /^\s*(#|-|\*|>|\d+[.)]|\|)/.test(str);
  }

  // 文字列全体が水平線（thematic break）として解釈される行かどうかを判定する関数
  // marked.js（GFM）は、-, *, _ のいずれかの文字が3つ以上、間に空白を挟んでもよい形で
  // 連続する行を単独の水平線として解釈し <hr> を生成する（前後の空白は無視される）。
  // 例: "---", "***", "___", "- - -", "* * * *" 等
  const thematicBreakPattern = /^\s*([-*_])\s*(\1\s*){2,}$/;

  // 文字列全体が、アンダースコアによる斜体/強調記法（_text_ / __text__）単体として
  // 解釈されうる行かどうかを判定する関数。design.mdの要件2.1は斜体記法を*のみを想定しているが、
  // marked.jsのGFM標準では_text_/__text__も斜体・強調として解釈されるため、
  // s1/s2単体がその記法だけで構成されるケースを除外する（記法自体の解釈結果ではなく
  // 「改行が表示に反映されるか」を検証するテストの意図に影響しないようにするため）
  const underscoreEmphasisPattern = /^_{1,2}[^\s_](?:[^_]*[^\s_])?_{1,2}$/;

  // ブロック記法の記号を先頭に持たない、空でない文字列を生成するジェネレータ
  const nonBlockTextArb = fc
    .array(
      fc.constantFrom(
        'a', 'b', 'c', 'd', 'e', 'x', 'y', 'z', '0', '1', '2',
        ' ', '日', '本', '語', 'テ', 'ス', 'ト', '_', '(', ')'
      ),
      { minLength: 1, maxLength: 15 }
    )
    .map((chars) => chars.join(''))
    .filter((s) => s.trim().length > 0 && !startsWithBlockSyntax(s))
    // 単独行として水平線（<hr>）に解釈される文字列（---, ***, ___ 等）を除外する
    .filter((s) => !thematicBreakPattern.test(s.trim()))
    // 単独行がアンダースコアによる斜体/強調記法だけで構成される文字列（_a_, __a__ 等）を除外する
    .filter((s) => !underscoreEmphasisPattern.test(s.trim()));

  it('s1 + "\\n" + s2 の出力に改行を表す要素（<br>または複数の<p>）が少なくとも1つ含まれる', () => {
    fc.assert(
      fc.property(nonBlockTextArb, nonBlockTextArb, (s1, s2) => {
        const input = `${s1}\n${s2}`;

        const html = window.renderMarkdownSafe(input);

        const container = window.document.createElement('div');
        container.innerHTML = html;

        const brCount = container.querySelectorAll('br').length;
        const pCount = container.querySelectorAll('p').length;

        // <br> 要素が存在するか、複数の <p> 要素への段落分割が発生していることを確認する
        expect(brCount >= 1 || pCount >= 2).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe('renderMarkdownSafe - Property 5', () => {
  // Feature: markdown-answer-display, Property 5: Markdown記法が含まれない場合は既存同等の表示になる
  //
  // Markdown記法の記号（**, *, `, 行頭の- や \d+. 、[...](...)、#、>、|等、marked.jsが
  // CommonMark/GFM記法として解釈する記号）を一切含まないプレーンテキストを生成し、
  // renderMarkdownSafe() の出力からHTMLタグをすべて除去したテキストコンテンツが、
  // 入力（URLを除く部分）と一致することをjsdomで検証する。
  // URL自動リンク化はProperty 3で検証済みのため、本テストはURLを含まないプレーンテキストに
  // 限定する。改行文字を入力に含めると breaks: true オプションにより <br> に変換され、
  // textContent比較時に改行の扱いが問題になるため、改行文字（\n）も入力から除外する。
  // Validates: Requirements 6.1, 6.2

  // Markdown記法として解釈されうる記号（**, *, `, -, #, >, |, [, ], (, ), 数字+., \n）を
  // 一切含まない、安全な文字だけで構成したプレーンテキストを生成するジェネレータ
  const plainCharArb = fc.constantFrom(
    'a', 'b', 'c', 'd', 'e', 'x', 'y', 'z',
    'A', 'B', 'C',
    '0', '1', '2', '3',
    ' ',
    '日', '本', '語', 'テ', 'ス', 'ト', 'こ', 'ん', 'に', 'ち', 'は',
    '、', '。', '！', '？',
    '=', ':', ';', '/', '@'
  );

  // 行頭が箇条書き（-, +, * ）・番号付きリスト（\d+. ）・見出し（#）・引用（>）・テーブル（|）と
  // 解釈されないことを確認するための判定関数（Property 4のstartsWithBlockSyntaxと同様、
  // CommonMarkでは箇条書きマーカーとして - と * に加えて + も解釈されるため追加している）
  function startsWithBlockSyntax(str) {
    return /^\s*(#|-|\+|\*|>|\d+\.|\|)/.test(str);
  }

  // Markdown記法の記号を一切含まない、空でないプレーンテキストを生成するジェネレータ
  const noMarkdownTextArb = fc
    .array(plainCharArb, { minLength: 1, maxLength: 30 })
    .map((chars) => chars.join(''))
    .filter((s) => s.trim().length > 0)
    .filter((s) => !startsWithBlockSyntax(s))
    // 記号自体を含む文字は plainCharArb に含めていないため冗長だが、念のため明示的に除外する
    .filter((s) => !/[*`#>|+]/.test(s))
    .filter((s) => !/^\s*-\s/.test(s))
    .filter((s) => !/^\s*\d+\.\s/.test(s));

  it('Markdown記法を含まない入力のテキストコンテンツが入力と一致する', () => {
    fc.assert(
      fc.property(noMarkdownTextArb, (s) => {
        const html = window.renderMarkdownSafe(s);

        const container = window.document.createElement('div');
        container.innerHTML = html;

        // marked.js は<p>要素内のテキストに末尾改行を付与する場合があるため、
        // 出力側・入力側それぞれの前後の空白（改行含む）を除去してから比較する
        expect(container.textContent.trim()).toBe(s.trim());
      }),
      { numRuns: 100 }
    );
  });
});

describe('renderMarkdownSafe - 基本的なMarkdown記法変換', () => {
  // タスク3.8: 太字・斜体・インラインコード・箇条書き・番号付きリスト・Markdownリンクの
  // 各1〜2例について、renderMarkdownSafe() 経由での結合的な変換結果を確認する単体テスト。
  // marked.js自体のパースロジックの網羅的な検証は行わず、「renderMarkdownSafe()を通した結果、
  // 要件2.1の6記法が実際に画面に表示可能な形になっている」ことのみを確認する。
  // Requirements: 2.1, 3.2, 3.3

  it('太字（**太字**）が<strong>要素に変換される', () => {
    const html = window.renderMarkdownSafe('**太字**');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const strongEls = container.querySelectorAll('strong');
    expect(strongEls.length).toBeGreaterThanOrEqual(1);
    expect(strongEls[0].textContent).toBe('太字');
  });

  it('斜体（*斜体*）が<em>要素に変換される', () => {
    const html = window.renderMarkdownSafe('*斜体*');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const emEls = container.querySelectorAll('em');
    expect(emEls.length).toBeGreaterThanOrEqual(1);
    expect(emEls[0].textContent).toBe('斜体');
  });

  it('インラインコード（`code`）が<code>要素に変換される', () => {
    const html = window.renderMarkdownSafe('`code`');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const codeEls = container.querySelectorAll('code');
    expect(codeEls.length).toBeGreaterThanOrEqual(1);
    expect(codeEls[0].textContent).toBe('code');
  });

  it('箇条書き（- item1\\n- item2）が<ul>と複数の<li>に変換される', () => {
    const html = window.renderMarkdownSafe('- item1\n- item2');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const ulEls = container.querySelectorAll('ul');
    const liEls = container.querySelectorAll('li');
    expect(ulEls.length).toBeGreaterThanOrEqual(1);
    expect(liEls.length).toBe(2);
    expect(liEls[0].textContent).toBe('item1');
    expect(liEls[1].textContent).toBe('item2');
  });

  it('番号付きリスト（1. item1\\n2. item2）が<ol>と複数の<li>に変換される', () => {
    const html = window.renderMarkdownSafe('1. item1\n2. item2');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const olEls = container.querySelectorAll('ol');
    const liEls = container.querySelectorAll('li');
    expect(olEls.length).toBeGreaterThanOrEqual(1);
    expect(liEls.length).toBe(2);
    expect(liEls[0].textContent).toBe('item1');
    expect(liEls[1].textContent).toBe('item2');
  });

  it('Markdownリンク（[text](https://example.com)）が<a>要素に変換され、target/relが付与される', () => {
    const html = window.renderMarkdownSafe('[text](https://example.com)');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const anchorEls = container.querySelectorAll('a');
    expect(anchorEls.length).toBe(1);
    expect(anchorEls[0].getAttribute('href')).toBe('https://example.com');
    expect(anchorEls[0].textContent).toBe('text');
    expect(anchorEls[0].getAttribute('target')).toBe('_blank');
    expect(anchorEls[0].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('javascript:スキームを含むリンクは無効化され、当該hrefを持つ<a>要素が出力に存在しない', () => {
    const input = '[click](javascript:alert(1))';
    const html = window.renderMarkdownSafe(input);

    expect(html).not.toContain('href="javascript:alert(1)"');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const anchorEls = Array.from(container.querySelectorAll('a'));
    const dangerous = anchorEls.filter(
      (a) => a.getAttribute('href') === 'javascript:alert(1)'
    );
    expect(dangerous.length).toBe(0);
  });

  it('<script>タグを含む入力はエスケープ表示され、実行可能な<script>要素が出力に存在しない', () => {
    const input = '<script>alert(1)</script>';
    const html = window.renderMarkdownSafe(input);

    expect(html).not.toContain('<script>');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const scriptEls = container.querySelectorAll('script');
    expect(scriptEls.length).toBe(0);
  });

  it('MARKED_OPTIONSのbreaksオプションにより単一改行が<br>に変換される', () => {
    const html = window.renderMarkdownSafe('1行目\n2行目');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelectorAll('br').length).toBeGreaterThanOrEqual(1);
  });

  it('MARKED_OPTIONSのgfmオプションによりGFM記法（取り消し線 ~~text~~）が解釈される', () => {
    const html = window.renderMarkdownSafe('~~text~~');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    const delEls = container.querySelectorAll('del');
    expect(delEls.length).toBeGreaterThanOrEqual(1);
    expect(delEls[0].textContent).toBe('text');
  });

  it('MARKED_OPTIONSのgfmオプションにより箇条書き記法が解釈される', () => {
    const html = window.renderMarkdownSafe('- a\n- b');

    const container = window.document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelectorAll('ul').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('li').length).toBe(2);
  });
});

describe('.markdown-hint のDOM存在確認', () => {
  // タスク12: .markdown-hint のDOM存在確認テスト
  //
  // learner.html の質問入力欄（<textarea id="question-content">）近傍、および
  // instructor.js が生成する回答フォーム（<textarea id="answer-input">）近傍に
  // .markdown-hint 要素が存在し、hiddenクラス等が付与されていないことを確認する。
  // モーダル・アラートを用いない常時表示の補助注記であること（要件7.4, 7.5）を
  // 静的なマークアップ検査によって確認する。
  // Requirements: 7.1, 7.2, 7.5

  describe('learner.html', () => {
    const learnerHtmlPath = path.join(__dirname, '..', 'learner.html');
    let doc;

    beforeAll(() => {
      const html = readFileSync(learnerHtmlPath, 'utf-8');
      doc = new window.DOMParser().parseFromString(html, 'text/html');
    });

    it('質問入力欄（#question-content）の近傍に.markdown-hint要素が存在する', () => {
      const questionTextarea = doc.getElementById('question-content');
      expect(questionTextarea).not.toBeNull();

      // 同じ .form-group 内（質問入力欄の近傍）に .markdown-hint が存在することを確認する
      const formGroup = questionTextarea.closest('.form-group');
      expect(formGroup).not.toBeNull();

      const hintEl = formGroup.querySelector('.markdown-hint');
      expect(hintEl).not.toBeNull();
    });

    it('.markdown-hint要素にhiddenクラス等が付与されていない', () => {
      const hintEl = doc.querySelector('.markdown-hint');
      expect(hintEl).not.toBeNull();

      expect(hintEl.classList.contains('hidden')).toBe(false);
      expect(hintEl.hasAttribute('hidden')).toBe(false);
      expect(hintEl.style.display).not.toBe('none');
    });

    it('.markdown-hintのテキスト内容にMarkdown記法の案内キーワードが含まれる', () => {
      const hintEl = doc.querySelector('.markdown-hint');
      const text = hintEl.textContent;

      expect(text).toContain('太字');
      expect(text).toContain('斜体');
      expect(text).toContain('リスト');
      expect(text).toContain('リンク');
    });
  });

  describe('instructor.js（回答フォームのテンプレート文字列）', () => {
    const instructorJsPath = path.join(__dirname, 'instructor.js');
    let source;

    beforeAll(() => {
      source = readFileSync(instructorJsPath, 'utf-8');
    });

    it('回答入力欄（#answer-input）の直後にclass="markdown-hint"を含むテンプレート文字列が存在する', () => {
      // <textarea id="answer-input" ...>...</textarea> の直後の行に
      // class="markdown-hint" を含む文字列リテラルが存在することを確認する
      const answerInputIndex = source.indexOf('id="answer-input"');
      expect(answerInputIndex).toBeGreaterThan(-1);

      const afterAnswerInput = source.slice(
        answerInputIndex,
        answerInputIndex + 500
      );
      expect(afterAnswerInput).toContain('class="markdown-hint"');
    });

    it('.markdown-hintを含む行にhiddenクラスの付与が伴っていない', () => {
      const hintLineMatch = source
        .split('\n')
        .find((line) => line.includes('markdown-hint'));

      expect(hintLineMatch).toBeDefined();
      expect(hintLineMatch).not.toContain('hidden');
    });

    it('.markdown-hintのテンプレート文字列にMarkdown記法の案内キーワードが含まれる', () => {
      const hintLineMatch = source
        .split('\n')
        .find((line) => line.includes('markdown-hint'));

      expect(hintLineMatch).toContain('太字');
      expect(hintLineMatch).toContain('斜体');
      expect(hintLineMatch).toContain('リスト');
      expect(hintLineMatch).toContain('リンク');
    });
  });
});
