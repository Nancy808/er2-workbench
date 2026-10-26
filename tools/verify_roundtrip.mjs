// verify_roundtrip.mjs
// 证明：模板 + 内容包 → 重建 HTML → 再抽取内容包 == 原内容包（外置/重建忠诚，无信息丢失）。
// 用法：node verify_roundtrip.mjs <template.html> <pack.json> <rebuilt.html(可选)>
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TMPL = process.argv[2];
const PACK = process.argv[3];
const REBUILT = process.argv[4] || path.join(__dir, '..', 'sample-pack', '_rebuilt.html');
const NODE = process.execPath; // 用当前运行的 node，跨机无需写死

// 1) 构建
execSync(`"${NODE}" "${path.join(__dir,'build_from_pack.mjs')}" "${TMPL}" "${PACK}" "${REBUILT}"`, {stdio:'inherit'});

// 2) 用重建产物反抽内容包到临时目录
const tmp = path.join(__dir, '..', '_rt_tmp');
fs.rmSync(tmp, {recursive:true, force:true});
fs.mkdirSync(tmp, {recursive:true});
const RT_PACK = '_rt_pack.json';
execSync(`"${NODE}" "${path.join(__dir,'extract_pack.mjs')}" "${REBUILT}" "${tmp}" "${RT_PACK}"`, {stdio:'inherit'});

// 3) 深度比对
const a = JSON.parse(fs.readFileSync(PACK,'utf8'));
const b = JSON.parse(fs.readFileSync(path.join(tmp,'sample-pack',RT_PACK),'utf8'));

function norm(o){
  if(Array.isArray(o)) return o.map(norm);
  if(o && typeof o === 'object') return Object.keys(o).sort().reduce((m,k)=>{m[k]=norm(o[k]);return m;},{});
  return o;
}
const sa = JSON.stringify(norm(a));
const sb = JSON.stringify(norm(b));
if(sa === sb){
  console.log('✓ ROUND-TRIP 通过：重建后再抽取的内容包与原包完全一致（无信息丢失）');
  process.exit(0);
} else {
  // 找出首个差异键
  console.error('✗ ROUND-TRIP 不一致');
  const ka = JSON.stringify(norm(a.sections), null, 1);
  const kb = JSON.stringify(norm(b.sections), null, 1);
  // 简易差异：长度不同即不一致
  if(ka.length !== kb.length) console.error('  内容段序列化长度不同：', ka.length, 'vs', kb.length);
  process.exit(1);
}
