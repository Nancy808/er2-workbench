// build_from_pack.mjs
// 把结构化内容包内联进模板，生成最终单文件工作台 HTML（构建时内联，保离线单文件）。
// 用法：node build_from_pack.mjs <template.html> <pack.json> <输出HTML> [--verify]
import fs from 'fs';

const TMPL = process.argv[2];
const PACK = process.argv[3];
const OUT  = process.argv[4];
const VERIFY = process.argv.includes('--verify');

const tpl = fs.readFileSync(TMPL, 'utf8');
const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
const S = pack.sections;
const saveKey = pack.edition.saveKey || 'er2_workbench_v2';

let out = tpl;
let replaced = 0, missing = 0;

// 内容段（除 SAVE_KEY 外的所有 sections）
for(const [name, val] of Object.entries(S)){
  const anchor = '/*__PACK:' + name + '__*/';
  if(!out.includes(anchor)){ missing++; continue; }
  let js;
  if(val && val.__raw__ !== undefined){ js = val.__raw__; }
  else { js = JSON.stringify(val, null, 0); } // 紧凑 JSON，仍是合法 JS 字面量
  js = js.replace(/</g, '\\u003C'); // 防 </script> 击穿
  out = out.replace(anchor, 'const ' + name + ' = ' + js + ';');
  replaced++;
}

// SAVE_KEY 单独注入
const skAnchor = '/*__PACK:SAVE_KEY__*/';
if(out.includes(skAnchor)){
  out = out.replace(skAnchor, 'const SAVE_KEY = ' + JSON.stringify(saveKey).replace(/</g, '\\u003C') + ';');
  replaced++;
} else { missing++; }

fs.writeFileSync(OUT, out, 'utf8');

// 校验：不得残留未替换锚点
const leftover = (out.match(/\/\*__PACK:[\w]+__\*\//g) || []).length;
console.log('注入内容段：', replaced, ' 缺失锚点：', missing, ' 残留锚点：', leftover);
console.log('产物字节：', out.length, '→', OUT);

if(leftover > 0){ console.error('✗ 有未替换锚点，构建失败'); process.exit(1); }
console.log('✓ 构建通过（round-trip 忠诚性请用 verify_roundtrip.mjs）');

