#!/usr/bin/env node
// extract_from_photos.mjs  ·  M3 照片→内容包草案抽取器
// ----------------------------------------------------------------------------
// 把课本照片交给视觉大模型，结构化产出「内容包草案 JSON」。
// 设计原则（与 ONBOARDING / CONTENT_PACK 铁律一致）：
//   1. 只转录照片可见文字，绝不臆造；看不清的字段标 "待核"。
//   2. 产出的是【草案】，必须人工核红后才能构建（见 ONBOARDING Step 4）。
//   3. 通用大模型 API（OpenAI 兼容 /chat/completions 视觉接口），用户自带 key。
//   4. skeleton 直接从 template.html 扫描锚点生成，与模板自同步，不手维护。
//
// 用法：
//   # 仅生成空骨架（不调 API），作为手写起点
//   node extract_from_photos.mjs --skeleton --id shanghai-2026-spring \
//        --region 上海 --grade 二年级 --year 2026 --term 春季 --out draft.json
//
//   # 按 --map 把照片分组交给模型抽取（推荐：分组更准）
//   node extract_from_photos.mjs --template template.html \
//        --map "CN:p1.jpg,p2.jpg;MA:p3.jpg,p4.jpg;EN:p5.jpg" \
//        --api-key sk-xxx --base-url https://api.deepseek.com/v1 --model deepseek-vision \
//        --id shanghai-2026-spring --region 上海 --grade 二年级 ... --out draft.json
//
//   # 不调 API，只打印将要发给模型的提示词 + 图片清单（用于核对 / 离线测试）
//   node extract_from_photos.mjs --dry-run --map "CN:a.jpg;MA:b.jpg" --list
//
//   # 自动模式：所有照片一次性投给模型要完整包（小册子 / agent 辅助时用）
//   node extract_from_photos.mjs --dir ./photos --auto --api-key ... --out draft.json
// ----------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ---------- 参数解析 ----------
const A = {};
const BOOL_FLAGS = new Set(['skeleton','dry-run','auto','list','fake']);
const argv = process.argv.slice(2);
for(let i=0;i<argv.length;i++){
  const a = argv[i];
  if(a === '--skeleton'){ A.skeleton = true; continue; }
  if(a === '--dry-run'){ A.dryRun = true; continue; }
  if(a === '--auto'){ A.auto = true; continue; }
  if(a === '--list'){ A.list = true; continue; }
  if(a === '--fake'){ A.fake = true; continue; }
  if(a.startsWith('--')){
    const k = a.slice(2);
    const v = BOOL_FLAGS.has(k) ? true : argv[++i];
    A[k] = v;
  }
}
const TMPL = A.template || path.join(__dir, '..', 'template.html');

// ---------- 锚点 → 骨架类型 ----------
// 从模板扫描 PACK 锚点，保证骨架与模板版本永远一致。
function scanAnchors(tmplPath){
  const t = fs.readFileSync(tmplPath, 'utf8');
  const set = new Set();
  const re = /\/\*__PACK:([A-Za-z_]+)__\*\//g;
  let m; while((m = re.exec(t))) set.add(m[1]);
  return [...set];
}
// 已知对象型段落（其余数组、SAVE_KEY/HL_SRC 为字符串）
const OBJECT_SECTIONS = new Set(['MA_ERR','MA_EX','SC_DO','SC_EX','PLAN_NAME','PLAN_SHORT']);

function buildSkeleton(anchors, edition){
  const sections = {};
  for(const name of anchors){
    if(name === 'SAVE_KEY') continue;          // SAVE_KEY 走 edition.saveKey
    sections[name] = OBJECT_SECTIONS.has(name) ? {} : [];
  }
  return {
    edition: Object.assign({
      id: 'my-edition', region: '', grade: '', year: '', term: '',
      subjects: {}, saveKey: 'er2_workbench_my-edition',
      source: '照片抽取草案（待核红）', extractedAt: new Date().toISOString().slice(0,10)
    }, edition),
    baseline: {},
    sections
  };
}

// ---------- 分组指令库 ----------
// 每个分组告诉模型：要填哪些 section、各自字段形状。照片在运行时按 --map 绑定。
const GROUPS = {
  CN: {
    label: '语文',
    sections: ['CN_CUR','CHINESE','POEMS'],
    instruction: `抽取【语文】内容，输出 JSON 对象，键为：${JSON.stringify(['CN_CUR','CHINESE','POEMS'])}。
- CN_CUR：三级下钻数组，形为 [{"u":"单元名","th":"主题","art":"","ls":[{"l":"课名","art":"","key":"","w":[["词语","课本给的释义"],...],"rec":["背诵要求"]}]}]。
- 词语表 w 必须【逐字抄写印刷体】（词+课本释义），保持原顺序；看不清的标 ["待核",""]。
- CHINESE / POEMS：古诗或课文补充，数组，每项可为字符串或 {"title":"","author":"","text":""}。
- 只转录照片可见文字，绝不臆造、绝不改写翻译。`
  },
  MA: {
    label: '数学',
    sections: ['MA_CUR','MA_ERR','MA_EX','MATH'],
    instruction: `抽取【数学】内容，输出 JSON 对象，键为：${JSON.stringify(['MA_CUR','MA_ERR','MA_EX','MATH'])}。
- MA_CUR：三级下钻数组 [{"u":"单元名","th":"主题","art":"","ls":[{"l":"课名","art":"","target":"本课目标(可空)","ex":"例题(可空)","w":[]}]}]。
- MA_ERR / MA_EX：对象，键必须【严格等于 MA_CUR 里的课名 l】，值为该课易错点/例题（字符串或数组）。课名即查表键，错一处会静默丢例题。
- MATH：数学补充模块数组（可空）。
- 例题数值照抄，陷阱题保持原样；看不清标 "待核"。`
  },
  SC: {
    label: '科学',
    sections: ['SC_CUR','SC_DO','SC_EX','SCIENCE'],
    instruction: `抽取【科学】内容，输出 JSON 对象，键为：${JSON.stringify(['SC_CUR','SC_DO','SC_EX','SCIENCE'])}。
- SC_CUR：三级下钻数组 [{"u":"单元名","th":"主题","art":"","ls":[{"l":"课名","art":"","target":"探究目标","sc":""}]}]。
- SC_DO / SC_EX：对象，键严格等于 SC_CUR 课名，值为观察/实验内容（字符串或数组）。
- SCIENCE：科学补充数组（可空）。`
  },
  EN: {
    label: '英语',
    sections: ['EN_CUR','ENGLISH','EN_DAILY','EN_CHANT','EN_BOOKS','PE_VIDEO'],
    instruction: `抽取【英语】内容，输出 JSON 对象，键为：${JSON.stringify(['EN_CUR','ENGLISH','EN_DAILY','EN_CHANT','EN_BOOKS','PE_VIDEO'])}。
- EN_CUR：三级下钻 [{"u":"单元名","th":"","art":"","ls":[{"l":"课时名","art":"","key":"单词/句型","w":[]}]}]。
- ENGLISH：[{"unit":"单元名","big":"Chant/歌谣标题","vocab":[["词","释义"],...]}]。
- 铁律：ENGLISH[].vocab 与 EN_CUR[].ls[].key 是【同一内容两份副本，必须同步】——同一单词两处都要出现且释义一致。
- EN_DAILY / EN_CHANT / EN_BOOKS：日常用语 / 歌谣 / 分级读物 数组（可空）。
- PE_VIDEO：体育视频引用数组（无则空数组）。`
  },
  SCHEDULE: {
    label: '作息+节假日',
    sections: ['WEEKDAY','SAT','SUN','FREE','HL_SRC','HOLIDAYS','WORKDAYS'],
    instruction: `抽取【作息与节假日】内容，输出 JSON 对象，键为：${JSON.stringify(['WEEKDAY','SAT','SUN','FREE','HL_SRC','HOLIDAYS','WORKDAYS'])}。
- 作息块：{"id":"唯一id","t":"起HH:MM","e":"止HH:MM","label":"名称","dur":分钟数,"type":"类型","stars":星数,"ic":"图标emoji"}。
- type ∈ work/rest/sport/meal/dict/cn_read/en_read/sci/extra/reward；id 四套不重复。
- WEEKDAY=上学日，SAT/SUN=周末，FREE=假期自由日。
- HL_SRC：节假日数据来源文号（字符串，如"国办发明电〔2025〕7号"）。
- HOLIDAYS：放假区间数组 [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}]。
- WORKDAYS：调休上班日数组 ["YYYY-MM-DD"]。`
  },
  MODULES: {
    label: '体育/阅读/劳动/高频词',
    sections: ['FOOTBALL','READ_CN','READ_EN','DOLCH','LABOR'],
    instruction: `抽取【体育/阅读/劳动/高频词】模块内容，输出 JSON 对象，键为：${JSON.stringify(['FOOTBALL','READ_CN','READ_EN','DOLCH','LABOR'])}。
- 各为数组：FOOTBALL 球感练习 / READ_CN 中文阅读篇目 / READ_EN 英文阅读篇目 / DOLCH 高频词 / LABOR 劳动任务。
- 照片没有某项就输出空数组 []，不要臆造。`
  },
  PLAN_SKINS: {
    label: '计划名+皮肤（固定/默认）',
    sections: ['PLAN_NAME','PLAN_SHORT','SKIN_ORDER','SKIN_NAME','SKIN_ICON','SKIN_THEME','PASTELS'],
    instruction: `填写【计划名称与皮肤配置】，输出 JSON 对象，键为：${JSON.stringify(['PLAN_NAME','PLAN_SHORT','SKIN_ORDER','SKIN_NAME','SKIN_ICON','SKIN_THEME','PASTELS'])}。
- PLAN_NAME：{"WEEKDAY":"上学日计划","SAT":"周六计划","SUN":"周日计划","FREE":"假期计划"}。
- PLAN_SHORT：对应短名 {"WEEKDAY":"上学日","SAT":"周六","SUN":"周日","FREE":"假期"}。
- SKIN_ORDER：["原版","女生版","男生版"]。
- SKIN_NAME/SKIN_ICON/SKIN_THEME/PASTELS：长度与 SKIN_ORDER 一致的数组（皮肤名/图标emoji/主题色/#RRGGBB粉彩底色）。
- 无照片时给合理默认即可。`
  }
};

// 整体系统提示（通用约束，所有分组共用）
const SYSTEM = `你是教材内容录入员。严格按以下规则从课本照片抽取内容，输出【合法 JSON 对象】，不要任何解释文字、不要 markdown 代码块外的内容。
规则：
1. 只转录照片上【可见的印刷体文字】，绝不臆造、绝不翻译改写。
2. 看不清的字段 → 输出 ["待核",""] 或在对应处写 "待核"，并在最后附 "待补清单" 数组列出所有待核项。
3. 词语表 / 单词释义 / 例题数值 / 拼音 是最易错项，务必逐行放大核对。
4. 课名即查表键：MA_ERR/MA_EX/SC_DO/SC_EX 的键必须严格等于 CN_CUR/MA_CUR/SC_CUR 里的课名。
5. 字段形状严格遵循本组指令给出的结构。`;

// ---------- 图片读取 ----------
function collectImages(spec){
  // spec: --dir 目录 | --files 逗号列表 | --map 里的单组文件列表
  const imgs = [];
  if(A.dir){
    const d = A.dir;
    const walk = (p) => {
      for(const e of fs.readdirSync(p, {withFileTypes:true})){
        const fp = path.join(p, e.name);
        if(e.isDirectory()){ if(p === d) walk(fp); continue; } // 仅一层
        if(/\.(jpe?g|png|webp|bmp|gif)$/i.test(e.name)) imgs.push(fp);
      }
    };
    if(fs.existsSync(d)) walk(d);
  }
  if(A.files){
    for(const f of A.files.split(',').map(s=>s.trim()).filter(Boolean)) imgs.push(f);
  }
  return imgs;
}

function imgToDataUrl(fp){
  const b = fs.readFileSync(fp);
  const ext = path.extname(fp).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : (ext === 'webp' ? 'webp' : ext);
  return `data:image/${mime};base64,${b.toString('base64')}`;
}

// ---------- 大模型调用（OpenAI 兼容视觉接口） ----------
async function callVision({apiKey, baseURL, model}, textInstruction, images){
  if(A.fake){
    // 离线自测桩：返回该组最小合法 JSON（不连网）。仅用于演示/CI，用户勿用。
    const fake = {
      CN: '{"CN_CUR":[{"u":"第一单元","th":"","art":"","ls":[{"l":"小蝌蚪找妈妈","art":"","key":"","w":[["池塘","水塘"]],"rec":["背诵全文"]}]}],"CHINESE":[],"POEMS":[{"title":"咏鹅","author":"骆宾王","text":"鹅鹅鹅"}]}',
      MA: '{"MA_CUR":[{"u":"加与减","th":"","art":"","ls":[{"l":"谁的得分高","art":"","target":"两位数加减","ex":"12+34=","w":[]}]}],"MA_ERR":{"谁的得分高":"进位漏加"},"MA_EX":{},"MATH":[]}',
      SC: '{"SC_CUR":[{"u":"我们的地球","th":"","art":"","ls":[{"l":"地球的形状","art":"","target":"观察地球仪","sc":""}]}],"SC_DO":{},"SC_EX":{},"SCIENCE":[]}',
      EN: '{"EN_CUR":[{"u":"Hello","th":"","art":"","ls":[{"l":"Lesson1","art":"","key":"hello","w":[]}]}],"ENGLISH":[{"unit":"Hello","big":"Hello Chant","vocab":[["hello","你好"]]}],"EN_DAILY":[],"EN_CHANT":[],"EN_BOOKS":[],"PE_VIDEO":[]}',
      SCHEDULE: '{"WEEKDAY":[{"id":"morning_read","t":"07:05","e":"07:15","label":"晨读","dur":10,"type":"en_read","stars":1,"ic":"📚"}],"SAT":[],"SUN":[],"FREE":[],"HL_SRC":"测试文号","HOLIDAYS":[{"from":"2026-10-01","to":"2026-10-07"}],"WORKDAYS":[]}',
      MODULES: '{"FOOTBALL":[],"READ_CN":[],"READ_EN":[],"DOLCH":[],"LABOR":[]}',
      PLAN_SKINS: '{"PLAN_NAME":{"WEEKDAY":"上学日计划","SAT":"周六计划","SUN":"周日计划","FREE":"假期计划"},"PLAN_SHORT":{"WEEKDAY":"上学日","SAT":"周六","SUN":"周日","FREE":"假期"},"SKIN_ORDER":["原版","女生版","男生版"],"SKIN_NAME":["原版","女生版","男生版"],"SKIN_ICON":["🌟","🌸","🔵"],"SKIN_THEME":["#7c3aed","#db2777","#2563eb"],"PASTELS":["#f3e8ff","#fce7f3","#dbeafe"]}',
      __auto__: '{"CN_CUR":[],"MA_CUR":[],"SC_CUR":[],"EN_CUR":[],"ENGLISH":[]}'
    };
    return fake[CURRENT_GID] || '{}';
  }
  const url = (baseURL.replace(/\/$/,'') + '/chat/completions');
  const content = [{type:'text', text: textInstruction}];
  for(const fp of images) content.push({type:'image_url', image_url:{url: imgToDataUrl(fp)}});
  const body = {
    model,
    messages: [
      {role:'system', content: SYSTEM},
      {role:'user', content}
    ],
    temperature: 0
  };
  const res = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const txt = await res.text().catch(()=> '');
    throw new Error('API '+res.status+' '+res.statusText+' '+txt.slice(0,300));
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

// 容错解析：剥离 ```json 围栏，截取首个 { 到末个 } 之间的内容
function parseJSON(text){
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/i,'');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if(a < 0 || b < 0 || b < a) throw new Error('模型未返回 JSON：'+s.slice(0,200));
  return JSON.parse(s.slice(a, b+1));
}

// ---------- 主流程 ----------
let CURRENT_GID = '';
function main(){
  if(!fs.existsSync(TMPL)){ console.error('✗ 找不到模板：'+TMPL); process.exit(2); }
  const anchors = scanAnchors(TMPL);

  const edition = {
    id: A.id || 'my-edition',
    region: A.region || '',
    grade: A.grade || '',
    year: A.year || '',
    term: A.term || '',
    subjects: A.subjects ? JSON.parse(A.subjects) : {},
    saveKey: 'er2_workbench_' + (A.id || 'my-edition')
  };

  if(A.skeleton){
    const sk = buildSkeleton(anchors, edition);
    const out = A.out || 'draft.json';
    fs.writeFileSync(out, JSON.stringify(sk, null, 1), 'utf8');
    console.log('✓ 骨架已生成：'+out+' （'+anchors.length+' 锚点，'+ (anchors.length-1) +' 内容段 + SAVE_KEY）');
    console.log('  下一步：按 ONBOARDING 照片清单拍照片，再用 --map 分组抽取；或手工填完草案后 node make.mjs 构建。');
    return;
  }

  // 决定分组 → 照片
  let groups = {}; // groupId -> [files]
  if(A.map){
    for(const part of A.map.split(';')){
      const [gid, files] = part.split(':');
      if(!GROUPS[gid]){ console.error('✗ 未知分组：'+gid+'（可选：'+Object.keys(GROUPS).join('/')+'）'); process.exit(2); }
      groups[gid] = (files||'').split(',').map(s=>s.trim()).filter(Boolean);
    }
  } else if(A.auto){
    const all = collectImages();
    groups['__auto__'] = all;
  } else if(A.dir || A.files){
    // 没给 --map 也没 --auto：默认全部当作 CN+MA+SC+EN 不易分，提示用 --map
    console.error('✗ 请指定 --map "CN:..;MA:..;EN:.." 分组，或 --auto 一次性抽取，或 --skeleton 仅生成骨架。');
    process.exit(2);
  } else {
    console.error('✗ 用法：--skeleton | --map ".." [--api-key ..] | --auto --dir ..');
    process.exit(2);
  }

  const imagesAll = collectImages();
  if(A.list){
    console.log('=== 匹配到的图片 ===');
    imagesAll.forEach(f=>console.log('  '+f));
    if(A.dryRun || !A.apiKey) return;
  }
  if(!A.apiKey && !A.dryRun && !A.list && !A.fake){
    console.error('✗ 抽取需要 --api-key（及 --base-url / --model）。或加 --dry-run 预览提示词。');
    process.exit(2);
  }

  const cfg = {
    apiKey: A.apiKey,
    baseURL: A.baseURL || 'https://api.openai.com/v1',
    model: A.model || 'gpt-4o-mini'
  };

  const run = async () => {
    const skeleton = buildSkeleton(anchors, edition);
    let todoList = [];

    for(const [gid, files] of Object.entries(groups)){
      let instr;
      if(gid === '__auto__'){
        instr = '一次性抽取全部内容包。把下面所有照片按学科拆分，输出【完整内容包 JSON 对象】，顶层键覆盖：'
          + Object.keys(GROUPS).flatMap(g=>GROUPS[g].sections).join(', ')
          + '。各段形状见各分组规则（CN 语文 / MA 数学 / SC 科学 / EN 英语 / SCHEDULE 作息节假日 / MODULES 模块 / PLAN_SKINS 计划皮肤）。';
      } else {
        instr = GROUPS[gid].instruction;
      }
      if(A.dryRun){
        CURRENT_GID = gid;
        console.log(`\n=== [DRY-RUN] 分组 ${gid} (${GROUPS[gid]?.label||'自动'}) ===`);
        console.log('系统提示（前200字）：'+SYSTEM.slice(0,200)+'…');
        console.log('本组指令：'+instr.slice(0,400)+'…');
        console.log('将发送图片('+files.length+'张)：'+files.join(', '));
        continue;
      }
      console.log(`\n>>> 抽取分组 ${gid} (${GROUPS[gid]?.label||'自动'})，图片 ${files.length} 张…`);
      CURRENT_GID = gid;
      const raw = await callVision(cfg, instr, files);
      let obj;
      try { obj = parseJSON(raw); }
      catch(e){ console.error('  ✗ 分组 '+gid+' 解析失败：'+e.message+'（原始前200字：'+raw.slice(0,200)+'）'); continue; }
      // 合并：覆盖 skeleton 中对应段
      for(const k of (GROUPS[gid]?.sections || Object.keys(obj))){
        if(obj[k] !== undefined){ skeleton.sections[k] = obj[k]; }
      }
      if(Array.isArray(obj['待补清单'])) todoList = todoList.concat(obj['待补清单']);
    }

    if(A.dryRun) { console.log('\n[DRY-RUN 结束，未调用 API、未写文件]'); return; }

    skeleton.sections['待补清单'] = undefined; // 不写入 sections
    const out = A.out || ('draft-'+(edition.id)+'.json');
    fs.writeFileSync(out, JSON.stringify(skeleton, null, 1), 'utf8');
    console.log('\n✓ 草案已生成：'+out);
    const empty = Object.entries(skeleton.sections).filter(([k,v])=> (Array.isArray(v)&&v.length===0) || (v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0)).map(([k])=>k);
    if(empty.length) console.log('  仍为空（需补拍/手写）：'+empty.join(', '));
    if(todoList.length) console.log('  模型标注待核：'+JSON.stringify(todoList));
    console.log('  ⚠️ 草案必须按 ONBOARDING 核红清单人工核对后才能 node make.mjs 构建。');
  };

  run().catch(e=>{ console.error('✗ 抽取失败：'+e.message); process.exit(1); });
}

main();
