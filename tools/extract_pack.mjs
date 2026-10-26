// extract_pack.mjs
// 从现有单文件工作台抽取"内容层"常量 → 结构化内容包 JSON，并生成带锚点的模板。
// 设计：内容包 = 版次无关的结构化数据；模板 = 引擎+资源（IMG/AUDIO/SUBJECTS/渲染逻辑）。
// 用法：node extract_pack.mjs <源HTML> <输出目录>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// 路径全部相对脚本目录解析，跨机/任意 cwd 可跑（不再写死开发机绝对路径）。
const SRC = process.argv[2] || path.join(__dir, '..', 'sample-pack', 'src-reference.html');
const OUT = process.argv[3] || path.join(__dir, '..');
const PACKNAME = process.argv[4] || 'shenzhen-2026-autumn.json';

if(!fs.existsSync(SRC)){
  console.error('用法：node extract_pack.mjs <源HTML> <输出目录> [<pack文件名>]');
  console.error('  <源HTML> 必填（你要迁移的现有单文件工作台，或示例 src-reference.html）');
  console.error('  未找到：' + SRC);
  process.exit(2);
}

// 要外置的内容常量（顺序即注入顺序，保留原相对位置）
const CONTENT = [
  'SAVE_KEY','WEEKDAY','SAT','SUN','FREE','HL_SRC','HOLIDAYS','WORKDAYS',
  'CHINESE','POEMS','CN_CUR','MA_CUR','SC_CUR','MATH','ENGLISH','SCIENCE',
  'FOOTBALL','READ_CN','READ_EN','DOLCH','LABOR','PLAN_NAME','PLAN_SHORT',
  'SKIN_ORDER','SKIN_NAME','SKIN_ICON','SKIN_THEME','PASTELS',
  'MA_ERR','MA_EX','SC_DO','SC_EX','EN_CUR','PE_VIDEO','EN_BOOKS','EN_DAILY','EN_CHANT'
];

const HTML = fs.readFileSync(SRC, 'utf8');

// 定位 const NAME =
function findConst(src, name){
  const re = new RegExp('const\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*=\\s*');
  const m = re.exec(src);
  if(!m) return null;
  return { matchEnd: m.index + m[0].length };
}

// 从值起点抽取平衡括号/字符串片段
function extractValue(src, valStart){
  let i = valStart;
  while(i < src.length && /\s/.test(src[i])) i++;
  const ch = src[i];
  if(ch === '[' || ch === '{'){
    let depth = 0, inStr = false, q = '', esc = false;
    for(; i < src.length; i++){
      const c = src[i];
      if(esc){ esc = false; continue; }
      if(inStr){ if(c === '\\'){ esc = true; } else if(c === q){ inStr = false; } continue; }
      if(c === '"' || c === "'" || c === '`'){ inStr = true; q = c; continue; }
      if(c === '[' || c === '{') depth++;
      else if(c === ']' || c === '}'){ depth--; if(depth === 0){ i++; break; } }
    }
    return { text: src.slice(valStart, i), end: i };
  }
  if(ch === '"' || ch === "'"){
    let q = ch, j = i + 1;
    for(; j < src.length; j++){ const c = src[j]; if(c === '\\'){ j++; continue; } if(c === q) break; }
    return { text: src.slice(valStart, j + 1), end: j + 1 };
  }
  throw new Error('无法识别值起点 @' + valStart + ' : ' + src.slice(valStart, valStart + 20));
}

// 求值（数据字面量）→ JS 值
function evalValue(text){
  try { return (new Function('return (' + text + ');'))(); }
  catch(e){ return { __raw__: text }; }
}

const sections = {};
const anchors = []; // {name, start, end}
let saveKey = 'er2_workbench_v2';

for(const name of CONTENT){
  const f = findConst(HTML, name);
  if(!f){ console.warn('  ! 未找到 const ' + name + '，跳过'); continue; }
  const v = extractValue(HTML, f.matchEnd);
  const val = evalValue(v.text);
  if(name === 'SAVE_KEY'){
    saveKey = val; // 字符串
    anchors.push({ name, start: f.matchEnd - ('const ' + name + ' = ').length, end: v.end + 1 /* 含分号 */, isStr: true });
    continue;
  }
  if(val && val.__raw__ !== undefined){
    console.warn('  ! ' + name + ' 求值失败，按原始文本保留');
    sections[name] = { __raw__: v.text };
  } else {
    sections[name] = val;
  }
  // 锚点跨度：从 'const NAME =' 起点 到 值结束后的 ';'
  const constStart = HTML.lastIndexOf('const ' + name, f.matchEnd);
  let end = v.end;
  while(end < HTML.length && /\s/.test(HTML[end])) end++;
  if(HTML[end] === ';') end++;
  anchors.push({ name, start: constStart, end });
}

// 生成模板：把每个内容常量替换为锚点注释（保持其余引擎/资源不动）
let tmpl = HTML;
// 从后往前替换，避免偏移
anchors.sort((a,b)=>b.start - a.start);
for(const a of anchors){
  const anchor = '/*__PACK:' + a.name + '__*/';
  tmpl = tmpl.slice(0, a.start) + anchor + tmpl.slice(a.end);
}

// 版次元数据（默认深圳2026秋，作为参考包）
const edition = {
  id: 'shenzhen-2026-autumn',
  region: '深圳',
  grade: '二年级',
  year: '2026',
  term: '秋季',
  subjects: { chinese:'人教版', math:'北师大版', english:'沪教版', science:'教科版', pe:'国标', reading:'校本', labor:'校本' },
  saveKey,
  source: '从现网单文件工作台自动抽取',
  extractedAt: new Date().toISOString().slice(0,10)
};

// 计算内容基线（供通用门禁使用，取代硬编码 236/36/25/240/2/13）
function cnWords(){ let n=0; for(const u of (sections.CN_CUR||[])) for(const l of (u.ls||[])) n += (l.w||[]).length; return n; }
function maEq(){ return (sections.MA_CUR||[]).length; }
function allLessons(){ let n=0; for(const k of ['CN_CUR','MA_CUR','SC_CUR','EN_CUR']) for(const u of (sections[k]||[])) n += (u.ls||[]).length; return n; }
const baseline = {
  cnWords: cnWords(),
  cnUnits: (sections.CN_CUR||[]).length,
  maUnits: (sections.MA_CUR||[]).length,
  scUnits: (sections.SC_CUR||[]).length,
  enUnits: (sections.EN_CUR||[]).length,
  totalLessons: allLessons(),
  scheduleRows: ['WEEKDAY','SAT','SUN','FREE'].reduce((s,k)=>s+((sections[k]||[]).length),0),
  holidays: (sections.HOLIDAYS||[]).length,
  workdays: (sections.WORKDAYS||[]).length
};

const pack = { edition, baseline, sections };

fs.mkdirSync(path.join(OUT,'sample-pack'), {recursive:true});
fs.writeFileSync(path.join(OUT,'sample-pack',PACKNAME), JSON.stringify(pack, null, 1), 'utf8');
fs.writeFileSync(path.join(OUT,'template.html'), tmpl, 'utf8');

console.log('抽取完成：');
console.log('  内容段：', Object.keys(sections).length, '/ 期望', CONTENT.length - 1);
console.log('  基线：', JSON.stringify(baseline));
console.log('  模板字节：', tmpl.length, '（原', HTML.length, '）');
console.log('  产物：sample-pack/shenzhen-2026-autumn.json + template.html');
