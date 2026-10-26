// make.mjs
// 开源生成器一键入口：构建（内联内容包）→ 结构自检门禁。
// 用法：node make.mjs <template.html> <pack.json> <输出HTML>
//   例：node make.mjs template.html sample-pack/shenzhen-2026-autumn.json dist/er2-workbench.html
// 退出码：构建失败 / 门禁失败 均非 0。
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const TMPL = process.argv[2];
const PACK = process.argv[3];
const OUT  = process.argv[4];

if(!TMPL || !PACK || !OUT){
  console.error('用法：node make.mjs <template.html> <pack.json> <输出HTML>');
  process.exit(2);
}
for(const f of [TMPL, PACK]){
  if(!fs.existsSync(f)){ console.error('✗ 找不到：' + f); process.exit(2); }
}
fs.mkdirSync(path.dirname(OUT), {recursive:true});

console.log('>>> 构建：内联内容包到模板');
execFileSync(NODE, [path.join(__dir,'build_from_pack.mjs'), TMPL, PACK, OUT], {stdio:'inherit'});

console.log('\n>>> 结构自检门禁（版次无关）');
try {
  execFileSync(NODE, [path.join(__dir,'gate_pack.mjs'), OUT, PACK, TMPL], {stdio:'inherit'});
} catch(e){
  console.error('\n✗ 构建成功但门禁未通过，产物未放行：' + OUT);
  process.exit(1);
}
console.log('\n✅ 完成：' + OUT + ' （单文件离线工作台，双击即用 / 可装 PWA）');
