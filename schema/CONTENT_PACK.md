# 内容包（Content Pack）结构规范 v1

内容包是「二年级学习工作台」**唯一需要按地区/教材版次替换的数据载体**。
工作台本体（模板）装引擎与离线资源（图片/音频/渲染/皮肤变量），内容包装全部**文字与排程数据**。
构建时（`build_from_pack.mjs`）把内容包内联进模板，产出仍是单个离线 HTML。

> 权威范例：`../sample-pack/shenzhen-2026-autumn.json`（深圳 2026 秋，从现网产品自动抽取，已 round-trip 验证）。
> 新地区/新版次 = 复制该文件、改 `edition` 元数据 + 各内容段，再构建。

---

## 顶层结构

```
{
  "edition": { ... 版次元数据 ... },
  "baseline": { ... 自动计算的基线（给通用门禁用，勿手填） ... },
  "sections": { ... 以下各内容段 ... }
}
```

### `edition`（版次元数据，必填）
| 字段 | 说明 | 示例 |
|---|---|---|
| `id` | 全局唯一标识，用于 localStorage 键与缓存隔离 | `shenzhen-2026-autumn` |
| `region` | 地区 | `深圳` |
| `grade` | 年级 | `二年级` |
| `year` / `term` | 学年 / 学期 | `2026` / `秋季` |
| `subjects` | 各科的教材版次（展示给用户） | `{chinese:"人教版", math:"北师大版", ...}` |
| `saveKey` | localStorage 主键（必须含版次，避免与别的版次串档） | `er2_workbench_v2` |
| `source` / `extractedAt` | 来源说明 / 抽取日期 | — |

### `baseline`（自动计算，勿手填）
由构建/校验脚本从 `sections` 算出：`cnWords / cnUnits / maUnits / scUnits / enUnits / totalLessons / scheduleRows / holidays / workdays`。**取代原 skill 里硬编码的 `DATA:236/36/25/240/2/13`**——通用门禁改为断言这些计算值自洽（如 `cnWords == 词语表实际条数`）。

---

## `sections` 内容段清单

| 段名 | 类型 | 内容 | 抽取来源页 |
|---|---|---|---|
| `WEEKDAY` `SAT` `SUN` `FREE` | 数组 | 四套作息（上学/周六/周日/假期自由） | 作息表 |
| `HL_SRC` | 字符串 | 节假日数据源文号 | 国务院通知 |
| `HOLIDAYS` | 数组 | 放假区间（如 `["2026-10-01","2026-10-07"]`） | 国务院通知 |
| `WORKDAYS` | 数组 | 调休上班日（ISO 日期） | 国务院通知 |
| `CN_CUR` | 数组 | 语文单元→课文→词语表/背诵 | 课本目录 + 词语表页 |
| `MA_CUR` | 数组 | 数学单元→课→目标/例题/易错 | 课本目录 + 例题页 |
| `SC_CUR` | 数组 | 科学单元→课→探究目标 | 课本目录 |
| `EN_CUR` | 数组 | 英语单元→课时 | 英语课本目录 |
| `ENGLISH` | 数组 | 英语单词/词组 + 释义 + 歌谣标题(`big`) | 英语单词页 |
| `EN_DAILY` `EN_CHANT` `EN_BOOKS` | 数组 | 日常用语 / 歌谣 / 分级读物 | 英语课本 |
| `CHINESE` `POEMS` | 数组 | 古诗/课文补充 | 课本 |
| `MATH` `SCIENCE` `FOOTBALL` `READ_CN` `READ_EN` `DOLCH` `LABOR` | 数组 | 数学/科学/体育/中英文阅读/高频词/劳动 模块内容 | 对应模块 |
| `PLAN_NAME` `PLAN_SHORT` | 对象 | 四套计划的名称/短名 | 固定（可本地化） |
| `SKIN_ORDER` `SKIN_NAME` `SKIN_ICON` `SKIN_THEME` `PASTELS` | 混合 | 皮肤顺序/名称/图标/主题色/粉彩底色 | 皮肤配置 |
| `MA_ERR` `MA_EX` `SC_DO` `SC_EX` | 对象 | 数学/科学 例题/易错/观察/实验（**按课名索引**） | 课本例题页 |

### 关键形状
- **三级下钻**：`CN_CUR/MA_CUR/SC_CUR/EN_CUR` 统一为
  `[{ u:"单元名", th:"主题", art:"封面图key(可空)", ls:[{ l:"课名", art, key, w:[[词,解释],...], rec:[背诵要求] }] }]`
- **作息块**：`{ id, t:"起", e:"止", label, dur, type, stars, ic }`
  - `type` 取值：`work/rest/sport/meal/dict/cn_read/en_read/sci/extra/reward`
- **英语单词**：`ENGLISH[]` 含 `big`(歌谣标题，Chant 页复用，勿另存副本)、`vocab`(词卡释义)。**`ENGLISH[].vocab` 与 `EN_CUR[].ls[].key` 是同一内容的两份副本，必须同步**（原 skill 铁律）。

---

## 铁律（抽内容/改内容时必守）

1. **课名即查表键**：`MA_ERR/MA_EX/SC_DO/SC_EX` 按 `课名` 索引。改课名 = 同时改 `MA_CUR {l:"…"}` + 两张表 `"…":`，**次数对不上会静默丢失例题/易错点**。
2. **两份副本同步**：英语释义 `ENGLISH[].vocab` ↔ `EN_CUR[].ls[].key` 改一处必改另一处。
3. **作息 id 四套不重复**：`dayObj().tasks` 按 id 打卡，撞了串账。
4. **词语表按印刷体，绝不 AI 猜**：拍词语表页逐字抄；读不准就请用户重拍（见抽取流程）。
5. **图片/音频是资源不是内容**：`IMG`(图) `AUDIO`(英语发音) 留在模板，内容包只按 **key** 引用（`IMG[sec+"_banner"]` 等）。换地区若需新图，走图片流水线另行注入。
6. **`<` 已自动转义**：构建时已把内容里的 `<` 转 `\u003C`，防止 `</script>` 击穿；内容作者无需操心。
7. **baseline 勿手填**：由脚本从 sections 算，手填会与内容脱节。

---

## 与现网产品的对应关系
- 现网 `二年级学习工作台.html` 的内容常量（约 37 处）已由 `extract_pack.mjs` 抽成此包；模板为该文件的内容清空版（带 `/*__PACK:NAME__*/` 锚点）。
- 现网产品 = 本包 + 模板 构建后的结果（round-trip 已验证一致）。
