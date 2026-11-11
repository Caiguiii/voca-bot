// 檢查 data/words/*.json 格式。用法：node scripts/validate_words.js
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'words');
const wordsJs = readFileSync(join(root, 'src', 'words.js'), 'utf8');

const errors = [];
const ids = new Set();
const words = new Set();
let total = 0;
let expectedId = 1;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isPairList = (v) => Array.isArray(v) && v.length > 0 && v.every((p) => isStr(p?.en) && isStr(p?.zh));
const isStrList = (v) => Array.isArray(v) && v.every(isStr);

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  if (!wordsJs.includes(`data/words/${file}`)) errors.push(`${file}：沒有在 src/words.js 裡 import`);
  let list;
  try {
    list = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}：JSON 格式錯誤 — ${e.message}`);
    continue;
  }
  if (!Array.isArray(list)) {
    errors.push(`${file}：最外層必須是陣列 [ ]`);
    continue;
  }
  for (const w of list) {
    const tag = `${file} #${w?.id} ${w?.word}`;
    total++;
    if (!Number.isInteger(w.id)) errors.push(`${tag}：id 必須是整數`);
    else {
      if (ids.has(w.id)) errors.push(`${tag}：id 重複`);
      if (w.id !== expectedId) errors.push(`${tag}：id 應為 ${expectedId}（請連號）`);
      ids.add(w.id);
      expectedId = w.id + 1;
    }
    if (!isStr(w.word)) errors.push(`${tag}：缺少 word`);
    else {
      const k = w.word.toLowerCase();
      if (words.has(k)) errors.push(`${tag}：單字重複`);
      words.add(k);
    }
    for (const f of ['phonetic', 'pos', 'meaning']) if (!isStr(w[f])) errors.push(`${tag}：缺少 ${f}`);
    if (!isPairList(w.phrases)) errors.push(`${tag}：phrases 需至少一筆 {en, zh}`);
    if (!isPairList(w.examples)) errors.push(`${tag}：examples 需至少一筆 {en, zh}`);
    if (!isStrList(w.synonyms) || !w.synonyms.length) errors.push(`${tag}：synonyms 需至少一個`);
    if (!isStrList(w.antonyms)) errors.push(`${tag}：antonyms 必須是字串陣列（可為空）`);
    if (!Array.isArray(w.family) || !w.family.every((f) => isStr(f?.word) && isStr(f?.pos) && isStr(f?.zh))) {
      errors.push(`${tag}：family 必須是 [{word, pos, zh}] 陣列（可為空）`);
    }
  }
}

if (errors.length) {
  console.error(`❌ 發現 ${errors.length} 個問題：\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✅ 單字資料檢查通過：${files.length} 個檔案、${total} 個單字（約 ${Math.floor(total / 5)} 天份）`);
