// LINE 訊息樣板（Flex Message）

const DICT_URL = 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/';
const BLUE = '#1565C0';
const GRAY = '#888888';
const DARK = '#222222';

const text = (t, opts = {}) => ({ type: 'text', text: String(t), wrap: true, ...opts });

function section(title, lines) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    spacing: 'xs',
    contents: [text(title, { size: 'sm', weight: 'bold', color: BLUE }), ...lines],
  };
}

/** 單字卡 */
export function wordBubble(w, { label = '📘 多益金色單字', fav = false } = {}) {
  const body = [
    text(w.word, { size: 'xxl', weight: 'bold', color: DARK }),
    text(`${w.phonetic}   ${w.pos}`, { size: 'sm', color: GRAY }),
    text(w.meaning, { size: 'md', weight: 'bold', color: '#333333', margin: 'sm' }),
    { type: 'separator', margin: 'md' },
  ];

  if (w.phrases?.length) {
    body.push(section('🔗 片語', w.phrases.map((p) => text(`• ${p.en}\n   ${p.zh}`, { size: 'sm', color: '#444444' }))));
  }
  if (w.examples?.length) {
    const lines = [];
    for (const ex of w.examples) {
      lines.push(text(ex.en, { size: 'sm', color: '#444444' }));
      lines.push(text(ex.zh, { size: 'xs', color: GRAY }));
    }
    body.push(section('📝 例句', lines));
  }
  if (w.family?.length) {
    body.push(
      section('🌱 詞性變化', w.family.map((f) => text(`• ${f.word} (${f.pos})  ${f.zh}`, { size: 'sm', color: '#444444' }))),
    );
  }
  body.push(section('≈ 相似詞', [text(w.synonyms?.length ? w.synonyms.join(', ') : '—', { size: 'sm', color: '#444444' })]));
  body.push(section('≠ 相反詞', [text(w.antonyms?.length ? w.antonyms.join(', ') : '—', { size: 'sm', color: '#444444' })]));

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#E3F2FD',
      paddingAll: '12px',
      contents: [text(label, { size: 'sm', weight: 'bold', color: BLUE })],
    },
    body: { type: 'box', layout: 'vertical', contents: body },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: fav ? 'secondary' : 'primary',
          color: fav ? undefined : '#F9A825',
          height: 'sm',
          action: fav
            ? { type: 'postback', label: '取消收藏', data: `action=unfav&id=${w.id}`, displayText: `取消收藏 ${w.word}` }
            : { type: 'postback', label: '⭐ 收藏', data: `action=fav&id=${w.id}`, displayText: `收藏 ${w.word}` },
        },
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: {
            type: 'uri',
            label: '🔊 發音',
            uri: DICT_URL + encodeURIComponent(w.word.toLowerCase().replace(/\s+/g, '-')),
          },
        },
      ],
    },
  };
}

/** 一張單字卡訊息 */
export function wordCard(w, opts) {
  return { type: 'flex', altText: `${w.word}：${w.meaning}`, contents: wordBubble(w, opts) };
}

/** 多張單字卡（左右滑動），最多 12 張 */
export function wordCarousel(words, { altText, labelFn, favSet } = {}) {
  const list = words.slice(0, 12);
  return {
    type: 'flex',
    altText: (altText || list.map((w) => w.word).join(', ')).slice(0, 400),
    contents: {
      type: 'carousel',
      contents: list.map((w, i) =>
        wordBubble(w, { label: labelFn ? labelFn(w, i) : undefined, fav: favSet?.has(w.id) }),
      ),
    },
  };
}

export const textMsg = (t) => ({ type: 'text', text: String(t).slice(0, 5000) });

/** 測驗題卡 */
export function quizBubble(question, options, targetId) {
  const letters = ['A', 'B', 'C', 'D'];
  return {
    type: 'flex',
    altText: `📝 測驗：${question}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF8E1',
        paddingAll: '12px',
        contents: [text('📝 單字測驗', { size: 'sm', weight: 'bold', color: '#E65100' })],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          text(question, { size: 'lg', weight: 'bold', color: DARK }),
          ...options.map((o, i) => text(`${letters[i]}. ${o.label}`, { size: 'md', color: '#444444' })),
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: options.map((o, i) => ({
          type: 'button',
          style: 'primary',
          height: 'sm',
          action: {
            type: 'postback',
            label: letters[i],
            data: `action=ans&id=${targetId}&pick=${o.id}`,
            displayText: `${letters[i]}. ${o.label}`.slice(0, 300),
          },
        })),
      },
    },
  };
}

/** 每則回覆下方的快速按鈕 */
const QUICK_ITEMS = [
  ['📘 今日', '今日'],
  ['⭐ 收藏', '收藏'],
  ['🔁 複習收藏', '複習收藏'],
  ['📚 已學', '已學'],
  ['📝 測驗', '測驗'],
  ['❓ 說明', '說明'],
];

export function withQuickReply(messages) {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  last.quickReply = {
    items: QUICK_ITEMS.map(([label, t]) => ({ type: 'action', action: { type: 'message', label, text: t } })),
  };
  return messages;
}
