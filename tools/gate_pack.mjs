// gate_pack.mjs
// 版次无关的「结构自检」门禁：从内容包(pack.json)算基线 + 校验构建产物，零硬编码地区数值。
// 取代原深圳专属 9 套门禁里写死的 DATA:236/36/25/240/2/13 与 COV:40/40,13/13。
//
// 纯 Node、无需 Edge / Python / 网络 —— 跨机即跑。
// 检查项：
//   1) 锚点完整性：模板里所有 /*__PACK:NAME__*/ 在构建产物里都被替换；产物无残留锚点（构建忠诚）
//   2) 语法体检：产物主 <script> 能编译（new Function 不跑，只验语法）
//   3) 基线计算：复刻产品 allWords/COV 语义，算出 DATA / COV 字符串并报告（不写死）
//   4) 内部一致性：各科目条目数 > 0、作息块数 > 0、节假日/调休日期合法
//   5) 跨引用静默坏防护：MA_ERR/MA_EX/SC_DO/SC_EX 不得有「悬空键」(键必须存在于课表中)；ENGLISH 单元数 == EN_CUR 单元数
//   6) 作息完整性：每块 t<e、dur 与时长一致、同日内不重叠、type 在允许集合内
//
// 用法：node gate_pack.mjs <built.html> <pack.json> [template.html]
// 退出码：0 全通过；1 有失败；2 参数/文件错误
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BUILT = process.argv[2];
const PACK = process.argv[3];
const TMPL = process.argv[4] || null;

if(!BUILT || !PACK){
  console.error('用法：node gate_pack.mjs <built.html> <pack.json> [template.html]');
  process.exit(2);
}
if(!fs.existsSync(BUILT)){ console.error('✗ 找不到构建产物：' + BUILT); process.exit(2); }
if(!fs.existsSync(PACK)){ console.error('✗ 找不到内容包：' + PACK); process.exit(2); }

let fails = 0, warns = 0;
function ok(m){ console.log('  ✓ ' + m); }
function bad(m){ console.error('  ✗ ' + m); fails++; }
function warn(m){ console.warn('  ⚠ ' + m); warns++; }

const built = fs.readFileSync(BUILT, 'utf8');
const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
const S = pack.sections || {};
const ANCHOR_RE = /\/\*__PACK:[\w]+__\*\//g;

console.log('\n=== 1) 锚点完整性（构建忠诚） ===');
if(TMPL && fs.existsSync(TMPL)){
  const tmpl = fs.readFileSync(TMPL, 'utf8');
  const need = (tmpl.match(ANCHOR_RE) || []).map(a => a.replace('/*__PACK:','').replace('__*/',''));
  const uniq = [...new Set(need)];
  for(const name of uniq){
    if(built.includes('/*__PACK:' + name + '__*/')) bad('锚点未替换：' + name);
    else ok('锚点已替换：' + name);
  }
  console.log('  模板锚点数：' + uniq.length);
} else {
  console.log('  （未提供 template.html，跳过"应替换"清单比对）');
}
const leftover = (built.match(ANCHOR_RE) || []).length;
if(leftover > 0) bad('产物残留未替换锚点 ' + leftover + ' 个');
else ok('产物无残留锚点');

console.log('\n=== 2) 语法体检（主 script 可编译） ===');
const scripts = [...built.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.sort((a,b)=>b.length-a.length)[0] || '';
if(!main){ bad('产物中没有 <script> 块'); }
else {
  try { new Function(main); ok('主 script 编译通过（' + main.length + ' 字节）'); }
  catch(e){ bad('主 script 语法错误：' + e.message); }
}

console.log('\n=== 3) 基线计算（复刻产品语义，零硬编码） ===');
// allWords(ARR)：扁平化 L.w 取长度
function allWords(arr){ let n=0; for(const u of (arr||[])) for(const l of (u.ls||[])) n += (l.w||[]).length; return n; }
const cnWords = allWords(S.CN_CUR);
const cnLessons = (S.CN_CUR||[]).reduce((s,u)=>s+(u.ls||[]).length,0);
const cnLessonsWithWords = (S.CN_CUR||[]).reduce((s,u)=>s+(u.ls||[]).filter(l=>(l.w||[]).length).length,0);
const maWords = (S.MA_CUR||[]).reduce((s,u)=>s+(u.ls||[]).reduce((t,l)=>t+(l.w||[]).length,0),0);
const scUnits = (S.SC_CUR||[]).length;
const scLessons = (S.SC_CUR||[]).reduce((s,u)=>s+(u.ls||[]).length,0);
const DATA = `${cnWords}/${cnLessons}/${cnLessonsWithWords}/${maWords}/${scUnits}/${scLessons}`;
// COV：数学易错点覆盖 / 科学探究覆盖
function lessonNames(cur){ const s=new Set(); for(const u of (cur||[])) for(const l of (u.ls||[])) if(l.l) s.add(l.l); return s; }
const maNames = lessonNames(S.MA_CUR), scNames = lessonNames(S.SC_CUR);
const maCovered = [...maNames].filter(n => (S.MA_ERR||{})[n]).length;
const scCovered = [...scNames].filter(n => (S.SC_DO||{})[n]).length;
const COV = `${maCovered}/${maNames.size},${scCovered}/${scNames.size}`;
console.log('  DATA:' + DATA + '   （语文词/课/含词课/数学词/科学单元/科学课）');
console.log('  COV :' + COV + '   （数学易错覆盖/科学探究覆盖）');
ok('DATA / COV 已按内容包动态计算并报告');

console.log('\n=== 4) 内部一致性 ===');
if(cnWords <= 0) bad('语文词数 = 0'); else ok('语文词数 ' + cnWords + ' > 0');
if(cnLessons <= 0) bad('语文课数 = 0'); else ok('语文课数 ' + cnLessons);
if(maWords <= 0) bad('数学词数 = 0'); else ok('数学词数 ' + maWords);
if(scUnits <= 0) bad('科学单元数 = 0'); else ok('科学单元数 ' + scUnits);
if(scLessons <= 0) bad('科学课数 = 0'); else ok('科学课数 ' + scLessons);
const schedTotal = ['WEEKDAY','SAT','SUN','FREE'].reduce((s,k)=>s+((S[k]||[]).length),0);
if(schedTotal <= 0) bad('作息块总数为 0'); else ok('四套作息块总数 ' + schedTotal);
// 节假日/调休日期合法性（HOLIDAYS 为 {from,to} 对象数组；WORKDAYS 为平铺日期串，均允许 YYYY-M-D / YYYY-MM-DD）
function isValidDate(s){
  if(typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(!m) return false;
  const y=+m[1], mo=+m[2], d=+m[3];
  if(mo<1||mo>12||d<1||d>31) return false;
  const dt = new Date(y, mo-1, d);
  return dt.getFullYear()===y && dt.getMonth()===mo-1 && dt.getDate()===d;
}
let badDate = 0;
for(const h of (S.HOLIDAYS||[])){ if(!isValidDate(h.from) || !isValidDate(h.to)){ badDate++; if(badDate<=5) bad('HOLIDAYS 非法日期：' + JSON.stringify(h)); } }
for(const d of (S.WORKDAYS||[])){ if(!isValidDate(d)){ badDate++; if(badDate<=5) bad('WORKDAYS 非法日期：' + d); } }
if(badDate) bad('非法日期 ' + badDate + ' 个'); else ok('节假日(' + (S.HOLIDAYS||[]).length + ')/调休(' + (S.WORKDAYS||[]).length + ') 日期格式合法');

console.log('\n=== 5) 跨引用静默坏防护 ===');
function dangling(table, names, label){
  let d = 0;
  for(const k of Object.keys(table||{})) if(!names.has(k)){ d++; if(d<=5) bad(label + ' 悬空键（课表里无此课名）：' + k); }
  if(d===0) ok(label + ' 无悬空键');
}
dangling(S.MA_ERR, maNames, 'MA_ERR');
dangling(S.MA_EX, maNames, 'MA_EX');
dangling(S.SC_DO, scNames, 'SC_DO');
dangling(S.SC_EX, scNames, 'SC_EX');
if((S.ENGLISH||[]).length !== (S.EN_CUR||[]).length)
  bad('ENGLISH 单元数(' + (S.ENGLISH||[]).length + ') ≠ EN_CUR 单元数(' + (S.EN_CUR||[]).length + ')（英语双副本需同步）');
else ok('ENGLISH 单元数 == EN_CUR 单元数 = ' + (S.ENGLISH||[]).length);

console.log('\n=== 6) 作息完整性 ===');
const TYPE_OK = new Set(['en_read','cn_read','extra','meal','rest','reward','sci','sport','work','dict']);
function toMin(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
let schedBlocks = 0, schedBad = 0;
for(const key of ['WEEKDAY','SAT','SUN','FREE']){
  const rows = S[key] || [];
  const sorted = [...rows].sort((a,b)=>toMin(a.t)-toMin(b.t));
  for(let i=0;i<sorted.length;i++){
    const r = sorted[i]; schedBlocks++;
    if(!TYPE_OK.has(r.type)){ bad(key+'['+i+'] type 不在允许集：'+r.type); schedBad++; }
    if(toMin(r.t) > toMin(r.e)){ bad(key+'['+i+'] 起>止：'+r.t+'~'+r.e); schedBad++; }
    const span = toMin(r.e) - toMin(r.t);
    // 单点块（t==e，如"熄灯"）合法，dur 应为 0；区间块 dur 须与时长一致
    if(span === 0){ if(r.dur !== undefined && r.dur !== 0) warn(key+'['+i+'] 单点块 dur≠0：'+r.dur); }
    else if(r.dur !== undefined && r.dur !== span){ warn(key+'['+i+'] dur('+r.dur+')≠时长('+span+')'); }
    if(i>0 && toMin(r.t) < toMin(sorted[i-1].e)){ bad(key+' 重叠：'+sorted[i-1].t+'~'+sorted[i-1].e+' 与 '+r.t+'~'+r.e); schedBad++; }
  }
}
if(schedBad===0) ok('作息块 ' + schedBlocks + ' 个全部合法（t<e / 不重叠 / type 合法）');
else bad('作息块异常 ' + schedBad + ' 处');

console.log('\n========================================');
console.log('结构自检结果：失败 ' + fails + ' 项，警告 ' + warns + ' 项');
console.log('DATA:' + DATA + '   COV:' + COV);
if(fails > 0){ console.error('✗ 门禁未通过'); process.exit(1); }
console.log('✓ 门禁通过（版次无关，基线由内容包动态算出）');
process.exit(0);
