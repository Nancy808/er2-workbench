---
name: er2-workbench-dev
description: 二年级学习工作台（单文件离线 HTML PWA）的开发与发布闭环经验。覆盖教材内容准确性铁律、三级下钻架构、图片生成→切卡→注入流水线、以及「构建→发布→线上三件套核验」完整流程。适用于维护 er2_workbench_v2，或复刻同类 K12 单文件学习工作台（深圳2026秋教材同步）。通用补丁机制见 single-file-html-patch-verify。
agent_created: true
---

# 二年级学习工作台 · 开发与发布经验

## 0. 这是什么 / 何时用
给小学生做的**单文件离线 HTML 学习工作台**：所有图片 base64 内嵌、数据存 localStorage、双击即用、可装桌面/PWA。深圳 2026 秋教材同步（语文人教 / 数学北师大 / 英语沪教 / 科学教科版 + 体育/阅读/劳动/奖励）。

本 skill 只记**领域知识 + 发布闭环**。改 HTML 的定点补丁、node --check、Edge 无头探针等通用机制，见 `single-file-html-patch-verify` skill，本文件不重复。

## 1. 项目路径与硬约束
| 项 | 值 |
|---|---|
| 主文件（唯一手改源） | `二年级学习工作台.html`（1.6MB+，含一个巨型 `<script>`） |
| 发布目录（**禁止手改**，永远从主文件重建） | `publish/`（index.html + manifest.webmanifest + sw.js + assets/icons） |
| 源图仓库（只放原图，不内嵌） | `assets/` |
| 验证/补丁脚本 | `tools/`（68 个 py + 3 个 js，其中补丁脚本按批次命名 `patch_v3a…z` / `patch_skin_*`，**保留**，是改动审计线索） |
| 临时区 | `tmp/`（备份 `bak_before_*.html` 保留，探针 `_*.html` 用完删） |
| 线上地址 | `https://65f6accefa764c45a59c650e05f5132c.app.workbuddy.host`（静态托管，同目录重发复用同链接；**2026-09-24 / SW v20 为最新线上版本**） |
| Python 环境 | `C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe`（已装 pypinyin、PIL） |
| Node 环境 | `C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`（版本会随升级变，以 `ls ~/.workbuddy/binaries/node/versions` 为准） |
| localStorage 键 | `SAVE_KEY="er2_workbench_v2"` |

**硬约束**：单文件交付，图片全 base64 内嵌、`assets/` 只是源图；不引任何外链；不能扫描课本原文（版权）→ 用 AI 重画同主题插画；换浏览器/清缓存会丢数据 → 提醒用首页「💾 数据备份」导出。

## 2. 教材内容准确性铁律（最值钱的一块）
数值/字词对错是机器能判定的，绝不靠肉眼。改完任何内容必跑对应审计。

- **语文词语表**：必须按课本《词语表》**印刷体**，绝不 AI 猜。Patch AB 教训：用户给了 P116-117 实拍，按印刷体重写 19 课（162→224 词条）；Patch AC 补 P118 六课 60 词 → 全册 **236 条**（= 课本页脚印数，可用来反推照片是否漏拍）。**古诗二首/园地/快乐读书吧课本本无《词语表》条目，留空正确**；**孩子自己手写加的词不要入库**（用户显式要求）。
- **数学数值**：`python tools/audit_arithmetic.py [文件]`（默认主 HTML）。扫全站等式/单位换算/乘法口诀并重算。当前 76 等式 + 6 换算 + 75 口诀 = 0 问题。陷阱题（`trap:[...]`）故意写错算式进 `ALLOW` 白名单并校验数量（多了=新写错题，少了=错题被改没了）。**必须做否定测试**：故意把 `35+27=62`→`63` 应被抓到，否则工具坏了「0 问题」无意义。
- **拼音**：`python tools/audit_pinyin.py 二年级学习工作台.html`（pypinyin）。逐条核对，白名单含轻声/「一」变调/儿化（消息 xiāo xi、一切 yí qiè、一点儿 yì diǎnr）。当前 236 条 0 问题。
- **英语词表**：只信**官方词表**。数据源三方一致：电子课本单词页 + 导学案/预习单 + 官方字帖 PDF。**别信 AI 生成教学计划里的「核心词汇」**（模板套的）。可复用检索套路：搜「深圳 沪教版 二年级 同步资料 / 课课贴」+「Ready? Go! P页码」能找到逐页列原文的资料。
- **课本照片要「正拍 + 单页」**：横拍/斜角会读错。Patch AE 拿模糊照片抄的中文释义，Patch AF 用清晰重拍一核就抓出 2 处错（aunt 漏了课本第 2 个义项「姨母」、old 抄成课本根本没有的「年长的」，实为「年纪大的」）。**读不准就不入库、不清就请清姐重拍**——比入库再改便宜。另：照片上「页码」要一并记下（Daily expressions 在 P56 不是 P57），报告与代码注释里写错页码会误导后续核对。
- **判「照片上的行重复/自相矛盾」前，先放大 2 倍逐行读**：U4 歌谣 `What's around your home?` 连唱三遍是**课本本身的副歌写法**（`Places around my home.` 在第二段末句），模糊照下曾误判为「抄重」、还让清姐去翻书核对 —— 白跑一趟。裁块放大（PIL `resize(LANCZOS)` 2 倍）再下结论。
- **代码注释里的页码/栏名不跟数据走，`node --check` 与功能回归都抓不到**：核对课本后要顺手 grep 一遍注释里的页码/栏目名。Patch AF 更新了数据却漏改主文件注释「课本 P57 Daily expressions」（实为 **P56**，P57 是 Picture dictionary）—— 报告里甚至已经写了「注释已订正」，注释其实没动。
- **同一份内容存两处必须同步**（英语释义 = `ENGLISH[].vocab` 词卡 + `EN_CUR[].ls[].key` 课时页各一份）：只改一处会出现「词卡新、课时页旧」的静默错位。回归用例对**两处都断言**（`verify_v3_features.py` 用例 63）。推论：新增板块时**标题等公共字段复用既有数据**（Chant 标题直接取 `ENGLISH[].big`），别另存副本。
- **科学**：2024 新版把旧「材料」单元换成「造房子」、旧「我们的地球家园」重做成「地球家园」——照旧教材整单元对不上。
- **教材核对总方法**：电子课本官方目录页 + 21世纪教育网单元树 + 各地教研室教学计划/必背梳理 **三方交叉**。结论存 `教材核对报告.html`。

## 3. 发布闭环（改完 MUST 走完）
```
改主 HTML（锚点补丁）
  → 本地门禁（全绿才继续）
  → python tools/stamp_build.py          # 更新侧栏「版本 MM-DD · HH:MM」构建章（清姐辨新旧唯一肉眼手段）
  → python tools/build_publish.py        # 重建 publish/；⚠️ 改了 index.html 必须同步递增下面 SW 版本号
  → 部署 workbuddy_sites_deploy(directory=publish, language=static, userAskedToPublish=true)
  → 线上三件套核验（见 §6）
```
**SW 缓存版本**：`tools/build_publish.py` 里 `const CACHE = "er2-workbench-v20";`（**2026-09-24 已上线的最新值**，每次发布递增）。⚠️ **这个版本号跨轮次极易忘改**：曾连续跨 v14→v17 四版都没同步到本 skill（skill 一直写 v13），最后靠「三处一致性扫描」（见 §8）才揪出来——改完 SW 版本必须顺手扫一遍 skill + 报告（详见 §8）。**每次改 index.html 必须递增这个版本号** —— sw.js 字节不变浏览器就不重装 SW，缓存里的旧 index.html 会一直当离线兜底，用户打开全是旧版。（注：**未发布过的构建**可原地沿用同一版本号，因为线上不存在该版缓存；一旦发布过就必须递增。）`sw.js` 导航请求 `fetch(req,{cache:"no-store"})` 绕过线上无 Cache-Control 头的启发式缓存；`activate` 已含「预热」防升级后首次断网只剩兜底页。

⚠️ **发布同意不跨轮次继承**：每次重新发布都要用 AskUserQuestion 重新问清姐授权，不能沿用上一轮的「已同意」。

## 4. 本地门禁（改完必跑，全绿才发布）
**首选一键脚本 `tools/run_gates.py`**（2026-09-17 新增，把 **9 套**按固定顺序串行跑 + 汇总表 + 退出码；9 套 = `chk` 语法 · `arith` 数值 · `pinyin` 拼音 · `ah` 体验优化 · `hol` 节假日/调休 · `smoke` 冒烟 · `subj` 分流 · `drill` 下钻 · `v3` 功能）：
```bash
"$VENV"\tools\run_gates.py > tmp/_gates.log 2>&1 &   # 全套（含 v3，约 16 分钟）→ 后台跑！
"$VENV"\tools\run_gates.py --fast                    # 跳过慢的 v3（约 6 分钟）
"$VENV"\tools\run_gates.py --only ah                 # 只跑某一套
```
它内部已写死「每套都用隔离 venv python」「严格串行（不抢 Edge 默认 profile）」，就是为了防下面三个坑。
等价的裸命令（需要单独跑某套时）：
```bash
PY="C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
"$PY" tools/audit_arithmetic.py 二年级学习工作台.html   # 数学 0 问题
"$PY" tools/audit_pinyin.py 二年级学习工作台.html        # 拼音 0 问题
"$PY" tools/verify_v3_features.py     # 功能回归（当前 64/64；64 用例 ≈ 10 分钟，后台跑）
"$PY" tools/verify_drilldown.py       # 三级下钻（15 用例 + DATA/COV 基线断言）
"$PY" tools/verify_subject_modules.py # 学科分流（15 用例 + 反向断言）
"$PY" tools/smoke_all_pages.py        # 9 页冒烟
"$PY" tools/verify_ah_features.py     # 体验优化回归（皮肤切换/侧栏/theme-color/按钮渐变/图标/单元封面/体育视频/内嵌音频 17/17）
"$PY" tools/verify_live.py <线上URL>  # 发布后线上核验（见 §6）
```
⚠️ **`audit_pinyin.py` 必须用上面的 venv python**：base 解释器没装 pypinyin，会打印 `!! 需要 pypinyin：…` 并 **exit 2**。**这不是词表坏了，是解释器错了**——看到 exit 2 + 那行提示，先换解释器重跑，别去改白名单。其它门禁（arithmetic / verify_* / smoke）纯标准库，base 解释器也能跑，但统一用 venv 最省心。
每处 `subprocess.run` 必须带 `timeout=75`，`TimeoutExpired` 显式记 FAIL（`single-file-html-patch-verify` 坑 N）。**长回归（`verify_v3_features.py` ≈ 10 分钟、`verify_drilldown.py` ≈ 5 分钟）前台跑会被 watchdog SIGTERM（输出空、退出码 1/-1），必须 `run_in_background=true` 或把多套串在一条后台命令里**（并发跑会抢无头 Edge 的默认 profile）。
- 🚨 **每个 `verify_*.py` 结尾必须有 `sys.exit(1 if fails else 0)`**（2026-09-17 真实发现）：`verify_drilldown.py` 原来**只有 `print("失败项：…")` 没有退出码** → 15 例**全部超时也退出 0**，`run_gates.py` 照样报 `[OK]`。**「超时」= 这一例没被验证过，绝不能当通过。** 同批还发现两套脚本超时策略不一致（分流把超时算失败、下钻不算）——**改完务必对比所有 verify 脚本的收尾三行**。
- **无头用例超时要「重试一次」再判失败**（2026-09-17 加）：本机常年开着 Chrome + 360（`360tray/360huabao/360TptMon`），无头 Edge 偶发 75s 不退出，直接判失败会变成假红。做法：`for attempt in (1,2)` 包一层，**两次都超时才算失败**并打印 `[Edge 超时 ×2]`。
- 🚨 **回归用例不得依赖「跑测当天是周几」**（2026-09-20 真实踩到）：v3 的 24/25/26/27/31–36 只假了 `nowMin` 时钟，**课表仍来自真实日期** → 周日跑时 `curSchedule()` 变成 `SUN`，「工作日 19 行 / 19:40 高亮 / 下一件事：到家缓冲」全数假红。修法二选一：用例开头 `S.mode="weekday";render();`，或像用例 29/36 用 `curSchedule=function(){return SAT;};render();` 钉死课表。**推而广之：任何断言涉及「今天」的用例都要先把「今天」冻住**（日期/星期/时刻三者都要）。
- **零成本自校验**（防「匹配逻辑坏掉 → 全绿」）：收尾拿**最后一例的渲染 body** 做反向对照——断言一个绝不存在的串（如 `__NO_SUCH_STRING_2026__`）必须被判为「缺少」；若 `last_body` 为空或该串竟存在，就追加「自校验（结果不可信）」到失败项。**不用多跑一次浏览器**，却能挡住「工具本身坏了还给绿」这一类。

### 4.1 本机环境与工具通道（长时间迭代才暴露的坑）
- 🚨 **Bash 通道会整条卡死，要有 PowerShell 兜底**（2026-09-17 真实卡了两次）：`rm -f tmp/_*ico*.png` 这类删除**把整个 shell 挂住**——后续连 `echo alive` 都被 SIGTERM，Python `os.remove` 同样卡（疑似 360 实时防护 / 文件句柄占用）。**对策**：① 删不动就**换 PowerShell 通道**（`Remove-Item -Force` 能删掉 bash 删不动的文件）；② 需要看命令输出时**重定向到文件再读**，别指望交互式回显；③ 中文乱码用 `PYTHONIOENCODING=utf-8` + UTF8 无 BOM 写文件解决。
- ⚠️ **tmp/ 里别留「之后要删的东西」**：本轮新建的中间图片（`_new_ico.png` 等）最后删不掉，只能留在磁盘上。**新产出的中间图/探针直接写到项目根或专用目录，别丢进 tmp 等着清**。清理 tmp 要**分批做 + 每批 `ls | wc -l` 复核**，别指望一条命令爽快跑完（曾有一条 `for f in _*; do rm -f` 卡住 10 分钟无进展）。
- **产出给清姐看的对比图**（如桌面图标替换前后）放项目根并带中文名（`预览-桌面图标-替换前(蓝学).png`），比埋在 tmp 里找得到。
- 🚨 **别想用 Agent 工具直接删 C 盘的垃圾**（2026-09-18 实测）：`Remove-Item` **返回 exit 1、stdout 全空、脚本静默死在删除那一行**（前面已写的 `Set-Content` 都没落盘）。真实报错要包 `try/catch` 写文件才看得到：`[safe-delete][SAFE_DELETE_FAIL_CLOSED] {reason:"trash-failed", detail:"genie-trash failed; refusing fallback delete"}` —— 删除被路由到「移到回收站」那一层，回收站机制失败时**拒绝退化成硬删除**（fail-closed）。**结论：C 盘清理一律写纯 ASCII 的 .bat 交清姐双击跑**（.bat 在用户 shell 里跑 `del`/`rd`，不经过这层），本机现成脚本 `tools/clear_c_cache.bat`；Agent 只做侦察与校验。
- **C 盘要腾空间时先侦察再动手**：`.workbuddy`（7.1GB）**2026-09-11 就已 junction 到 `E:\WorkBuddyData\.workbuddy`**，C 盘只剩壳子；会话目录 `C:\Users\Administrator\WorkBuddy` 只有 0.76GB **且是当前会话 cwd 的父目录 → 不可迁**。详见 `windows-junction-relocate` skill 的「第 0 步侦察」。

## 4.2 作息计划：工作日 / 周末 / 节假日（Patch BB · 2026-09-20）
四套课表：`WEEKDAY`(19 行) / `SAT`(16) / `SUN`(10) / `FREE`(10，假期「自由安排」日)。判定入口**只有一个**：

```js
dayInfo(dk)   // 纯函数，dk 可省（默认今天）→ {mode,plan,label,ic,hol}
planOf(dk)    // → 课表数组（WEEKDAY/SAT/SUN/FREE，可用 === 做身份断言）
curSchedule() // S.mode 手动强制优先；auto 才走 planOf()
```
- 优先级**不能写反**：`调休上班 > 放假 > 普通周末 > 工作日`。2026-09-20 是**周日但属调休上班日**，先判周末就错。
- `getMode()` 保留成兼容壳（只分 weekend/weekday）；新代码一律用 `dayInfo()`。
- `S.mode` = `"auto"` / 手动 `"weekday"` / 手动 `"weekend"`（顶栏模式条点击在 auto ↔ 反向之间切）。

**假期规则（一条规则覆盖两种假）**：放假**第 1 天 = 周六计划、第 2 天 = 周日计划、第 3 天起 = 自由安排**。
⇒ 3 天小长假（中秋 9/25–27）= 前两天按周末 + 第三天自由；7 天长假（国庆 10/1–7）= 前 2 天学习做作业 + 其余自由。清姐 2026-09-20 原话就是这么定的，**别自作聪明加第三个分支**。

⚠️ **日期一律 `new Date(k+"T12:00:00")`**：裸 `"YYYY-MM-DD"` 会被 JS 当 **UTC** 解析，东八区整体错一天（静默，只在某些日子露馅）。已抽 `dOf(k)` / `dkeyOf(d)` / `dayGap(a,b)`。
⚠️ **`HOLIDAYS/WORKDAYS` 是硬编码表**（数据源：国办发明电〔2025〕7 号 = 33 天假 + 6 个调休上班日）：**2027 年安排公布后往表里追加，别猜日期**；界面上也标了数据源与「随版本更新」。
⚠️ **`tlEmptyText(nm,sch)` 的自由日分支必须放在 `if(on)return ""` 之后**，否则会盖掉「有时段时空态必须隐藏」的老行为（v3 用例 34 盯着）。
⚠️ **`FREE` 的 id 用 `h_` 前缀，四套课表 id 不得重复** —— `dayObj().tasks` 按 id 打卡，撞了会串账（`verify_holiday.py` 有 id 唯一性断言）。
- 回归：`tools/verify_holiday.py`（`hol` 套）。除逐日计划外，还断言 **假期总天数 = 33**（对得上通知里「共 33 天」，用来防整表被改坏）、6 个调休日、四表自检、以及把 `today` 钉到 9/25 / 10/3 后的**渲染断言**（假期卡行数 + 高亮「今天」+ 顶栏文案 + 自由日空态）。
- 冻结「今天」的技巧：`dayInfo` 是纯函数 → 探针里 `today=function(){return "2026-10-03";};render();`，跑完 `today=_today` 还原。

## 5. 三级下钻架构 + 静默键失配（最阴的坑）
- 语数科数据 `CN_CUR/MA_CUR/SC_CUR`，统一形状 `[{u:单元名, th:主题, art, ls:[{l:课名, art, key, w:[[词,解释]], rec:[背诵要求]}]}]`。
- 渲染 `curPage(sec,ic,title,sub,ARR,top)` + 全局 `UI_U/UI_L`：L1 `unitGrid` → L2 `unitDetail` → L3 `lessonDetail`。进度键 `dayObj().learn["<sec>-<u>-<l>"]`。
- 英语 `EN_CUR`（6 Unit × 4 课时），`EN_U` 默认 `-1` = 单元总览；`goto` 复位 `EN_U=-1`。⚠️ `ENGLISH[EN_U]` 只能在 `EN_U>=0` 分支用。

**⚠️ 按课名索引的补表 `MA_ERR/MA_EX/SC_DO/SC_EX`**：课名既是显示文本又是查表键。改课名 = **3 次替换**（`MA_CUR {l:"…"}` + 两张表 `"…":`），次数对不上就停下。漏了**不报错、页面照常渲染、只是那课例题/易错点变空白**。回归用例专盯（`verify_drilldown.py` L26、`verify_subject_modules.py` L53/54 覆盖率断言）。**「某课内容不见了」先怀疑键名失配，不是渲染逻辑**。删整课时键必须是完整课名。

**详情页按学科分流**（`SUBJ` 表，勿三科共用文案）：
- 语文 🎯本课学习重点 / ✍️会写字词（点读+报词听写）/ 🎤背诵朗读
- 数学 🎯本课学习目标 / 📐核心概念与方法 / ⚠️易错点提醒 / 🧮口诀与公式
- 科学 🎯本课探究目标 / 🔬科学概念 / 🧪观察与实验（四维目标）
- 反向断言：数学/科学不得出现「会写字词/背诵」，语文不得出现「易错点提醒/观察与实验」。

**报词听写（`speakWords`）**：`dict`/`dict1`/`dictall` 三个入口**全部汇聚**到 `speakWords()`——改行为只改这一处。要点（Patch AD 经验）：
- 速度参数提为顶层 `const DICT_REP=3, DICT_GAP=5000`（每词几遍 / 每遍间隔毫秒），家长可读可调，别把魔法数字埋进循环。
- **间隔要用「念完再计时」**：给 `speak(text,lang,onend)` 加**可选**第 3 参，在 `u.onend` 里回调 → 间隔才准（固定 `setTimeout` 会把朗读时长也算进去，5 秒实际只剩 3-4 秒）。可选参数不破坏既有调用。
- **防重入**：`_dictId` 自增作废上一轮 + 每步 `alive()` 校验。否则「停止/重开」时**上一条 utterance 的 onend 会另起一条并行循环**（两路同时报词，隐蔽且难查）。
- **兜底不能卡死**：浏览器不支持语音 / onend 不触发时退化为纯计时（安全网 `DICT_GAP+5000`）。
- 再点同一批 = 停止（用 `_dictSig` 比对）；报词过程只显示进度「第 X/N 个 · 第 r/3 遍」，**不显示词面**（避免偷看）。
- **别硬编码词数**：页头副标题与「报全册词语（N 词）」按钮都按 `allWords(CN_CUR).length` 动态算——旧代码写死「162」，Patch AB/AC 后实际 236，静默显示错数。

**导航用事件委托**（`document` 监听 `[data-act]`），**不要每次 render 重绑 onclick**——曾因重复 bind 致按钮全失效。**`tick` 只改 class/textContent，不整页 render**（会清掉 `qTimer`、丢滚动位置）。

## 6. 线上核验（发布后必跑，原「三件套」现为 8 项 + 2 套外部脚本）
```bash
PY=... ; NODE="C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-2/node.exe"
U="https://65f6accefa764c45a59c650e05f5132c.app.workbuddy.host"
"$PY" tools/verify_live.py              # 8 项：字节 md5 一致 / 无头渲染线上页断 DOM 的时间区间 / #tlEmpty / 版本章 / 线上 sw.js 已硬化 / 装桌面卡片已渲染 / favicon 指向版本化图标(-v2) / 三张图标线上=本地字节
"$NODE" tools/check_pwa_installable.js "$U"   # 可安装性错误数必须 0（动过 sw.js 必跑）
"$NODE" tools/verify_sw_freshness.js "$U"     # SW 换版差分：A(硬化SW)改内容+普通刷新拿新 / B(cache-first对照)拿旧，否则 INCONCLUSIVE
```
SW 差分坑：**首次导航一定不被 SW 拦截**（controller 为空），必须先做一次「已被接管」的导航把缓存喂上，对照组才成立。

## 7. 图片生成→切卡→注入→探针 流水线
给儿童端补词卡/插画用，离线放不下视频（体育用 SVG keyframes 动画；`PE_VIDEO` 存搜索关键词而非直链）。
1. **ImageGen**：`background:"opaque"` + 提示词强调 `plain pure white background / ABSOLUTELY NO TEXT ANYWHERE` → 出**行图**（3+3+4+1）便于切卡。
2. **切卡**：`tools/slice_word_cards.py`（复用 `make_cards.slice_row2`，bbox 用强物体像素 min<228 定位；物体阴影相连时用**手动 spans** 解决自动分割退化）。调色顺序：先压白底再提饱和/对比（顺序反了会糊）。
3. **注入**：`python tools/add_scenes.py <key1> <path1> <key2> <path2> ...`（base64 写入 `const IMG={...}`，只增不删其它图）。
4. **探针验收**：在**渲染后 DOM** 数 `noimg=none` + 数 emoji 兜底 = 0。

**enImgKey bug 教训**：含空格词条取图键不去空格 → 5 张图早画好却从没显示过，页面静默回落 emoji 兜底（`node --check`/页面报错全绿）。**凡是「字符串拼接查表」一律抽成纯函数当唯一入口**；验收按渲染结果，不是看数据里有没有。

**出预览截图给清姐看效果**（无头 Edge `--screenshot`）——两个坑：
1. **`*{animation:none!important;transition:none!important}` 必加**：`.sec{animation:fade .28s}` 在虚拟时钟下会停在起始帧，截出来整页半透明发虚（像坏了一样，其实是动画没跑完）。
2. **卡片 `<h3>` 的长副标题在 520px 宽会折行**（「Chant 歌 / 谣」）——`<span class="tiny">` 文案控制在 12 字内。
3. 想让某张卡落到视口最上方：`load` 后 `CUR/EN_U` 定位 + `render()`，再删掉除目标卡以外的 `.card` 与 `.crumb/.hero`。

## 7.1 离线英语音频包（设备缺 en-US 引擎的兜底 · Patch AH）
**症状**：英语/阅读模块点发音完全没声，但语文报词有声 → 根因是 `speak()` 走 `speechSynthesis`，而平板/浏览器**没有 en-US 语音引擎**（中文引擎在，所以中文有声）。浏览器静默不报错，肉眼看不出。
**方案**：把全部英语发音**预生成 MP3 内嵌**，彻底不依赖系统引擎。
1. `tools/gen_audio_pack.py`：从 `ENGLISH/EN_CUR/EN_DAILY/EN_CHANT/EN_BOOKS` 抽英文串（`eng_part()` 抠英文残留，多词或「uncle 叔父」这类带中文的只取英文部分；Chant 额外按单元合成「整首连读」一条，用原始行带标点入声）。用 `edge-tts`（`en-GB-MaisieNeural`，英式童声，与 KET 台同音色，`-8%` 稍慢）+ `ffmpeg` 压成 16kHz/24kbps 单声道 → base64 → 产出 `tmp/audio_pack.js`（`const AUDIO={...}`，当前 307 条 / 3.4MB）。
2. 注入：把 `const AUDIO={...}` 塞进主文件（在 `let _spkWarm` 前），并加 `audKey()` + `playAudioData()`；`speak()` 英语分支加「命中 `AUDIO[audKey(str)]` 则 `<audio>` 内嵌播放，否则回落 speechSynthesis」。
3. **`audKey()` 与生成端 `norm()` 必须逐字一致**（小写、去弯撇号、`[^a-z0-9' ]+`→空格、`\s+`→单空格）。否则「页面点的词」和「音频包的键」对不上，静默回落 TTS。回归 `verify_ah_features.py` 已对 `audKey("Uncle 叔父")==="uncle"` 等断言。
4. **词卡 `data-t` 已传完整英文短语**（如 `en="fruit shop"`），`enUnitGrid` 取 `lastIndexOf(" ")` 之前的全英文部分 → 与音频包键一致，直接命中。

**听感优化**：音色统一 Maisie 童声，比系统 TTS 更稳更可爱；离线可听，断网也能跟读。

⚠️ **注入写文件的致命坑（踩过）**：用 `io.open(HTML,"w")` 会在写入前**先截断文件**——若生成过程抛 `UnicodeEncodeError`（如 JS 转义 `\uD83D\uDD0A` 被 Python 当 surrogate 解析），主文件会被**清空成 0 字节**，且若补丁脚本第二遍重跑还会把备份也覆盖成空的。正确做法：① 写前先 `cp bak_before_*.html`；② 注入改到临时文件后 `os.replace(tmp, HTML)` 原子替换；③ JS 里要写 emoji 用**反引号模板里的 `\uD83D\uDD0A`** 或在 Python 用**原生 emoji 字符**，绝不用 `\uD83D` 这种 lone surrogate 当普通字符串（Python 写 UTF-8 会炸）。`patch_v3ah.py` 已按此修正。

## 7.2 皮肤（classic 原版 / girl 女生 / boy 男生 · Patch AG）
- 配色全挂 `:root` CSS 变量，皮肤 = 在 `body.skin-*` 下覆盖变量；`applySkin()` 按 `SKIN_ORDER=["classic","girl","boy"]` 增删 class，`nextSkin()` 由顶栏「🎨 换肤」循环；词卡底色 `PASTELS[skinName()]` 按皮肤取一套（同一内容只有一个来源）。
- 右侧淡插画底纹：径向渐变 + SVG 平铺，对比度 ≤5%、**无动画**、正文白底（不抢注意力）。
- **默认皮肤 = 女生版（2026-09-17 上线由清姐定）**。改默认值 = **3 处同改**：① `load()` 新档案默认 `skin:"girl"`；② `load()` 存档缺失时 `o.skin="girl"`；③ `skinName()` 兜底由 `"classic"`→`"girl"`（旧存档 `"auto"`/非法值也归 girl）。**只改前两处不够**——老用户存的 `"auto"` 会仍落 classic。
- ⚠️ **侧栏（左导航条）必须是 `body.skin-* #nav`**：侧栏元素是 `<div id="nav">`，基础样式用 `#nav`（ID，特异性 1,0,0）。皮肤覆盖若写成 `body.skin-* nav`（**类型**选择器，0,1,1）会被压过 → **侧栏颜色永远不变、且不报错**（2026-09-17 清姐发现「左导航条没换皮肤」就是这个）。改色务必用 ID：`body.skin-girl #nav{...}`。同理任何「皮肤覆盖某元素」都要**核对原选择器特异性**，别想当然用标签名。
- ⚠️ **「最上面的边框」= 窗口标题栏，吃 `theme-color` 不吃 CSS**：已装 App / 浏览器窗口顶部那条深色边，颜色来自 `theme-color`。做法：主 HTML 放 `<meta name="theme-color" content="#cb689b">`，`applySkin()` 里按皮肤改它的 `content`，并把 manifest 的 `theme_color` 同步为默认皮肤色（`build_publish.py` — 注意别和主 HTML 的 meta 重复注入）。**2026-09-17 调浅后的值：原版 `#1a5aa8` / 女生 `#cb689b` / 男生 `#3a8ed2`（三处同步：meta 默认值、`SKIN_THEME`、manifest）**。⚠️ 已装桌面 App 的窗口色可能需**关掉重开 / 重装**才刷新。
- ⚠️ **「主题色 + 硬编码伙伴色」是最阴的半覆盖**：渐变/配对色常写成 `linear-gradient(135deg,var(--cn),#23a074)`——`--cn` 换了皮肤、`#23a074`（绿）没换 → 女生版直接**粉绿渐变**（16 个 `.btn sm` 中招）。做法：把伙伴色抽成变量（`--cn2/--en2/--math2/--cn3`）在三套皮肤里各自赋值；同理**冷蓝面板/气泡**（`.ccgo #eaf1fd`、`.ccfull #f8fbff`、`.bub.q #e9f2ff`）要改用皮肤变量（`var(--mathbg)` / `--bubq`）。**改完务必再全 CSS 扫一遍**：`linear-gradient` 里同时出现 `var(--x)` 和 `#hex` 就是漏网，以及 `var(--x)` 与 `#hex` 同行的行。
- ⚠️ **换完主色还要清「冷色浅底/边框」（第四批 Patch AK）**：主色+渐变换掉后，仍会剩一批**冷蓝系浅色 hex** 让女生版「粉皮蓝骨」——卡片边框 `#eef2f7/#eaf0f7/#f0f3f8/#e0e6ee/#e6ecf3/#e9eef5/#d6e0ee`、面板与芯片浅底 `#f8fafc/#f1f5fa/#f6f9fc/#f4f7fb/#f6faff/#f2f6fd/#f7fbff`、首页学科卡文字 `#64748b`、大标题底 `#eef2f8`。做法：边框类→`var(--line)`、浅底类→新增 `var(--soft)`（:root `#f6f9fc`/girl `#fdf5f9`/boy `#f3f8fd`）、文字→`var(--sub)`、大标题底→`var(--bg)`。**验证手法**：用脚本 `s.count(hex)` 扫全部冷色 hex，残留只允许出现在①皮肤变量定义行②暖色 note/gift/chant③语义色 done/ok/wrong/trap（有意保留）。⚠️ `--bg:#eef2f8` 这类**变量定义**不是漏网，别误删。
- ⚠️ **调浅/调深底色后必须复核「文字对比度」**（Patch AL→AL2 真实教训）：把侧栏调浅（`#b8457e→#95376a→#79295a` → `#cb689b→#b64a81→#9d3a6f`），白字 nav 标签（原 `rgba(255,255,255,.8)`）的**有效对比度直接从 ~5.4 掉到 ~3.4**（低于 WCAG AA 的 4.5）——背景变浅不会报错，只会「看着有点糊」。两个手法：① **背景浅是需求就别动背景，改加强文字**（`.95` 白 + 极淡深色 `text-shadow`；副标/站点标/页脚一并提亮）；② **中间色档从 58% 挪到 50%**，让导航项更早落到深色区，兼顾「整体浅」与「文字可读」。复核方法：截图取样算对比度（`(L1+.05)/(L2+.05)`）。
- **应用图标（标签/桌面图标）在哪 + 怎么换**（Patch AL）：清姐说「某个图标是蓝色的」，先**放大她截图确认是哪个元素**——那次蓝绿「学」是 **manifest 图标**（`publish/assets/icons/`），**不是**侧栏那个白字标 `.g`（两者别搞混）。生成器 `tools/make_app_icon.py`：字标 + 皮肤同源渐变（浅莓 `#d26a9e` → 深莓 `#9d3a6f`），`fit_font()` 二分自适应字号（maskable 目标宽 0.60、普通 0.76，防溢出/过小）。主 HTML 另带**内联 SVG favicon**（`id="favIcon"`，保单文件离线可用），`build_publish.py` 用 `re.subn` 把它换成 PNG（`_fv==1` 断言防锚点丢）。改皮肤色时 manifest `theme_color` 要一起改（三处同步：meta 默认值 / `SKIN_THEME` / manifest）。
- 🚨 **换图标内容必须换文件名（换 URL）——否则永远看不到新图**（Patch AM 真实教训，2026-09-17 三轮反馈）：清姐反馈「桌面图标删了重开还是旧的蓝『学』」。**排查顺序（先证伪服务端，别急着改代码）**：① `curl` 线上图标与本地 `md5` 比对 → 这次**完全一致**，说明服务端早就对了，问题 100% 在客户端；② 看线上 `/favicon.ico` 是否 404（无兜底干扰）；③ 再定位缓存层。**根因三条叠加，本质都是「URL 不变就不重新取」**：ⓐ 浏览器有**独立于 HTTP 缓存的 favicon 数据库**（按 icon URL 索引）；ⓑ 已装 PWA 的**图标在安装时固化**，且 **删桌面快捷方式 ≠ 卸载应用**（开始菜单/任务栏启动的仍是同一个已装应用）；ⓒ `sw.js` 非导航资源原为**缓存优先**（`hit || net`，先回旧字节后台才更新）。**修法**：ⓐ 图标文件名带版本后缀（`icon-192-v2.png` 等，改图递增到 `-v3`…），旧的同名文件**保留**（内容同样是新图，避免旧 manifest 引用 404）；ⓑ `build_publish.py` 三处引用（favicon / apple-touch-icon / manifest icons）同步；ⓒ `sw.js` 非导航分支改**网络优先** `fetch(req,{cache:"no-store"})` + 失败回落缓存（图标仅几十 KB，从此不可能卡旧图）；ⓓ `verify_live.py` 加断言「favicon 指向版本化文件名」+「三张图标线上=本地字节」；ⓔ `verify_ah_features.py` 的 favicon 正则放行 `icon-192(-v\d+)?\.png`。**用户侧仍必须重装一次**：浏览器里**卸载应用** → 清除「缓存的图像和文件」→ 重新安装；若仍旧再刷 Windows 图标缓存（`ie4uinit.exe -show`）。
- ⚠️ **改界面上的短文本别裸 `s.replace("G2", ...)`**（Patch AL3 教训）：这个单文件里塞了大量 base64 图片，短字符串（尤其字母数字）**极可能也出现在 base64 里**——主 HTML 里 "G2" 共 3 处，只有 1 处是侧栏字标，另 2 处是图片数据。裸替换会悄悄改坏图片（不报错）。做法：用**带上下文的完整锚点**（`<div class="brand"><div class="g">G2</div>`）+ `assert s.count(old)==1` 命中数断言。同理适用于「一年级」「U4」这类短词。
- 🚨 **桌面图标有「两套入口」，各自缓存**（Patch AN）：①在线 PWA（`chrome_proxy.exe --app-id=…`）图标固化在 `Chrome\User Data\<profile>\Web Applications\_crx_<appid>\<名字>.ico` → 只能卸载+清缓存+重装；②本地文件版（`chrome.exe --app="file:///…"`，快捷方式名「宝贝学习工作台」）图标在 `%LOCALAPPDATA%\StudyWorkbench\app.ico` → **直接换 ico + `ie4uinit.exe -show` 即可，不用重装**。工具：`tools/check_installed_icon.py`（读 profile 判定「已装图标是新是旧」+ 打印安装时间/路径）、`tools/install_desktop_icon.py`（本地版：生成多尺寸 CoCo ico → 备份 → 覆盖 → 刷缓存）、**`tools/fix_installed_app_icon.py`（在线 PWA：整目录备份 → 换 ico + 把 `Manifest Resources` 下所有源图按原尺寸重画 → 刷缓存，实测「免重装」把 ❌ 变 ✅）**；`make_app_icon.py` 已拆出可复用 `make_ico()`。⚠️ **不要用脚本建桌面快捷方式**（360 主页防护会当篡改删掉，详见 `html-to-desktop-app` 技能），让清姐从开始菜单**手动拖**到桌面。
- 🧭 **「图标/桌面入口」排障顺序（三轮反馈才收敛，照这个顺序走别乱改代码）**：① `curl` 线上图标与本地比对 **md5**（先证伪服务端；本轮结论是服务端一直正确）→ ② 判定清姐看到的是**哪套入口**（在线 PWA / 本地文件版 / 浏览器标签 favicon，三者缓存互不相干）：`tools/check_installed_icon.py` 读 Chrome/Edge profile 输出 **app-id + 安装时间 + 图标是新是旧** → ③ 用对应工具**就地换**：本地文件版 `tools/install_desktop_icon.py`、在线 PWA `tools/fix_installed_app_icon.py`（都自带备份 + 刷 Windows 图标缓存）→ ④ 仍不生效才让清姐「浏览器里卸载应用 → 清缓存 → 重装」+ `ie4uinit.exe -show`。**普通刷新永远不换图标**（favicon 有独立数据库、已装应用图标安装时固化）。
- 验收：无头 `--dump-dom` 看新档案 `<body class="skin-girl">`；`verify_ah_features.py`（现 **17/17**）断言 girl/boy 切换时 `--bg` 变 **+ `#nav` 背景变 + `<meta theme-color>` 变 + `.btn` 渐变变（不含经典绿 `rgb(35,160,116)`）+ favicon 是 CoCo（不含旧蓝 `2f6bff`）**（2026-09-17 逐批新增，专门防这些静默半覆盖）。⚠️ **改这些颜色时必须同步改用例里的硬编码断言**（如 `navSkin` 的 `"184, 69, 126"` → `"203, 104, 155"`），否则会「假失败」。

## 8. 关键约定速查
- **版本章**「版本 MM-DD · HH:MM」在 `.navfoot` = 清姐辨新旧最快手段；**不要做成实时**（失去分辨力）。用例 39 动态从 HTML 抓此串，改这里不用担心测试过期。
- **数据基线**（改数据必同步）：`DATA:236/36/25/240/2/13` · `COV:40/40,13/13`（断言在 `verify_drilldown.py` L26、`verify_subject_modules.py` L53/54）。
- **发布后首次打开旧版**：先 `curl` 比字节 md5 → 字节已新就是缓存问题不是发布问题 → 让清姐强刷（Ctrl+F5；已装 PWA 先关掉再开，旧标签页 JS 还活着但永不重拉 HTML）→ 确认 sw.js 是否 no-store。
- **故意改掉某 UX 后，旧回归用例会「假失败」**：用例编码的是旧文案/旧数据源（如体育视频从「`PE_VIDEO` 每技能 B站/抖音搜索外链 + `暂无视频入口` 兜底」→「粘链接内嵌播放 + `去搜`」）。此时**更新用例到新行为**，但**保留仍成立的结构断言**（`VID:n=5`/`ENC`/`EMP:bad=0`）——别为了过测而回退 UX，也别删断言了事。（本次：`verify_v3_features.py` 用例 10/16。）
- 🔁 **「元信息三处一致性扫描」——每轮收尾必做**（2026-09-17 两次真实踩漏）：**元信息（SW 版本号 / 回归用例数 / 断言里的硬编码色值 / 数据基线数字）不跟数据走，改了一处不改另一处不会报错，只会静默过期**。历史上：skill 里 SW 版本停留在 **v13** 而线上已到 v17（跨 4 版）；报告 `教材核对报告.html` 里两处「16/16」没跟着改成 17/17。**收尾动作**：拿当前真值（`grep CACHE tools/build_publish.py`、跑一遍 `run_gates.py` 看汇总、`.navfoot` 构建章）去扫 **①工具脚本里的断言 ②`教材核对报告.html` ③本 skill 文件** 三处，全对齐才算完。
- **装桌面**：360 浏览器不支持 PWA 安装，须用 **Chrome 或 Edge** 打开链接 → 地址栏右侧「安装」。
- **交付前清理**：保留 `bak_before_*.html` 与 `tools/patch_v3*.py`（审计线索）；删 `tmp/_*.html` 探针**走 PowerShell 通道分批删**（见 §4.1，bash `rm` 会卡死），新产出的中间图别放 tmp。改完更新 `.workbuddy/memory/` 当日日志 + `MEMORY.md`。

### 8.1 离线备份与迁移（「卸载重装还能不能复现」的标准答案）
**复现能力 = 看四份东西在不在**——它们**不在同一个地方**，只备项目目录远远不够：

| 内容 | 位置 | 缺失后果 |
|---|---|---|
| 产品本体 | 项目目录（主 HTML + `tools/` + `assets/` + `publish/` + `教材核对报告.html`） | 产品没了（只能从线上扒回 index.html，能跑但没工具链/源图） |
| **方法（skill）** | `~/.workbuddy/skills/`（**用户级，与项目目录分居两处**）：`er2-workbench-dev` / `single-file-html-patch-verify` / `pwa-verify-deploy` / `html-to-desktop-app` / `image-strip-to-cards` | 有产品但**不会改、不敢发**（门禁、SW 版本铁律、图标换法全在 skill 里） |
| 记忆 | 项目 `.workbuddy/memory/`（逐日日志）+ 用户级 `~/.workbuddy/MEMORY.md`、`SOUL/IDENTITY/USER.md` | 教材为什么这么定、基线数字多少，要从头推 |
| **孩子进度** | **只在浏览器 `localStorage`**，不在任何文件里 | **最不可逆**：打卡/学习记录全丢 |

**一键打包**：`python tools/make_offline_backup.py` → 默认出到 `D:\备份\er2学习工作台_<日期>`（≈80MB / 380 文件，自动排 `tmp/`）；`--refresh` 只重写说明与清单。产出 `重建说明.md`（从零恢复步骤，含 md5 校验）+ `MANIFEST.txt`。

⚠️ 四条易错点：
- **`tmp/` 不备**（126MB，探针/音频中间产物，可从源码重跑）；**`assets/` 必须备**（58MB 源图，丢了得重画）。
- 卸载客户端**可能连 `~/.workbuddy`（skill + 记忆）一起清** → 备份包必须把 `skills/` 装走，别只备项目目录。
- 备份里的 md5 是**本地源** `二年级学习工作台.html` 的；线上 `publish/index.html` 是另一个值（构建时内联 SVG favicon 被换成 PNG，字节本就不同），**别当不一致去排查**。
- 「卸载**桌面 App 图标**」≠「卸载 **WorkBuddy 客户端**」：前者零影响（`make_app_icon.py` + `install_desktop_icon.py` 可重建），后者才会动 skill 与项目目录。

## 9. 复用检查清单（每次迭代）
- [ ] 内容改完跑了 arithmetic / pinyin 审计（0 问题）
- [ ] 数据基线 DATA/COV 断言仍成立（没多没少）
- [ ] 改课名同步改了 MA_CUR + MA_ERR/MA_EX/SC_DO/SC_EX（覆盖率断言绿）
- [ ] 补图走 enImgKey 纯函数 + 探针 noimg=none + emoji=0
- [ ] 课本照抄的内容（释义/歌谣）已用清晰照片逐字复核；两份副本（vocab / key）同步改且用例两处都断言
- [ ] 新增板块若沿用既有公共字段（单元标题等）则引用而非复制
- [ ] 界面上的词数/课数等都按数据动态算，没有硬编码残留（改数据不会静默显示错数）
- [ ] 改默认皮肤 = `load()` 新档案 + `load()` 存档缺省 + `skinName()` 兜底 **三处同改**（老用户 `"auto"` 才落到 girl）
- [ ] 改掉旧 UX 后，同步更新对应回归用例的过时文案断言（保留结构断言），别为了让旧用例过而回退
- [ ] 改皮肤后跑了「冷色 hex 全扫」：边框/浅底/文字残留清零（只留变量定义行 + 暖色语义色）
- [ ] **改底色深浅后复核过文字对比度**（浅底 + 80% 白会掉到 ~3.4）——不够就加强文字而非调回深底
- [ ] 换图标 / 改皮肤主色时，manifest 图标 + `theme_color` + `<meta theme-color>` + `SKIN_THEME` **四处同步**；**换图标内容时文件名必须递增版本后缀（`-v2`→`-v3`）并同步 `build_publish.py` 三处引用 + `verify_live.py` 的 `ICONS` 列表**
- [ ] 涉及「用户说改了但看不到」的问题，**先跑服务端取证**（线上 = 本地字节？），再往客户端缓存方向查 —— 别先改代码
- [ ] 本地门禁全绿：直接 `"$VENV"\tools\run_gates.py > tmp/_gates.log 2>&1 &`（后台！前台会被 SIGTERM）
- [ ] 注入大常量（AUDIO 包等）先写临时文件再 `os.replace` 原子替换；改动前先 `cp bak_before_*.html`（防 `open("w")` 截断清空主文件）
- [ ] stamp_build + build_publish（SW 版本号已递增）
- [ ] **元信息三处一致性扫描**：SW 版本 / 回归用例数 / 硬编码色值断言 → 工具脚本 ↔ `教材核对报告.html` ↔ 本 skill 全部对齐
- [ ] tmp 清理走 **PowerShell 通道分批删**；本轮新产出的中间图/探针没有落在 tmp
- [ ] 大改动后 / 换机或重装前：跑 `tools/make_offline_backup.py` 留离线包（含 `skills/`，不只项目目录）；并提醒清姐「学习进度」要用首页「💾 数据备份」导出——它不在项目文件里
- [ ] 重新取得清姐发布授权
- [ ] 线上核验：`verify_live.py`（现 **8/8**）+ PWA 0 错误 + SW 差分 A/B 通过

## 10. 内容外置与开源分发（2026-09-27 新增）

为"换地区/换教材版次 = 换内容包"做成了开源生成器，位于 **`D:\WorkBuddyProjects\er2-workbench\er2-dist\`**（2026-10-26 从工作区迁至 D 盘，便于统一查询）：
- `template.html`：本工作台的内容清空版（引擎 + `IMG`/`AUDIO` 资源保留；约 37 处内容常量替换为 `/*__PACK:NAME__*/` 锚点）。
- `sample-pack/shenzhen-2026-autumn.json`：从本产品自动抽取的参考内容包（**已 round-trip 验证一致**）——这是**妹妹 CoCo（二年级）**的范例。
- `schema/CONTENT_PACK.md`：内容包结构规范（外置与抽取的合同）。
- `tools/extract_pack.mjs`：从任意工作台 HTML 抽内容包 + 生成锚点模板（迁移/复刻用）。
- `tools/extract_from_photos.mjs`：**M3 照片→草案抽取器**（2026-10-26 新）。通用视觉大模型 API（OpenAI 兼容，用户自带 key），按 `--map` 分组投照片出草案；`--skeleton` 扫锚点生成空骨架、`--dry-run` 预览、`--fake` 离线自测。
- `tools/build_from_pack.mjs`：内容包内联进模板 → 单文件 HTML（**构建时内联**，保离线单文件）。
- `tools/gate_pack.mjs`：**版次无关结构自检门禁**（从内容包算基线，零硬编码地区数值；纯 Node，不需 Edge/Python）。
- `tools/make.mjs`：一键入口（构建 + 门禁）。
- `tools/verify_roundtrip.mjs`：外置↔重建忠诚性校验（零信息丢失证）。
- `ONBOARDING.md`：引导用户补齐资料 + 照片→草案抽取提示词（**双入口：脚本模式 / 对话 agent 模式**）。
- `README.md` / `LICENSE`(MIT) / `DEVELOPMENT.md`：开源分发说明。
- 一键打包：`D:\WorkBuddy交付物\er2-workbench-开源生成器.zip`（15 文件）。

⚠️ **家庭学段归属（2026-10-26 清姐纠正）**：本二年级工作台 = **妹妹 CoCo（老三）**；**二姐 Nancy（老二，四年级）** 的同类工作台后续另建、复用本生成器（内容包换四年级教材即可），不是这一个。

> 注意：`stamp_build.py` / `build_publish.py` / `run_gates.py` / `verify_live.py` 等**原项目 9 套 Python 门禁 + 发布闭环**已抽象为上面的 `gate_pack.mjs` + `make.mjs`，不再依赖 Python/Edge；原 `tools/`(100 个) 仅历史归档，新流程只用 `er2-dist/tools/` 这 6 个 `.mjs`。

**铁律落地**：① 内容约 37 处常量全外置；② `baseline` 改由脚本从内容包算（**取代硬编码 `DATA:236/36/25/240/2/13`**，通用门禁改断言结构自洽）；③ 注入时 `<` 转 `\u003C` 防 `</script>` 击穿；④ 英语 `ENGLISH[].vocab` ↔ `EN_CUR[].ls[].key` 仍须两处同步、课名即查表键等原铁律不变（见 §5 / §2）。

**现网产品 = `template + 本包` 构建结果，round-trip 已验证零丢失**；本 skill 自此是「生成器方法 + 原产品维护经验」双用——开源分发只关心"换内容包生成新工作台"。

