# 开发者文档（生成器内部）

本仓库是「二年级学习工作台」的**生成器**：`template.html`(引擎+资源) + `内容包`(数据) → `build_from_pack.mjs` → 单文件 HTML。

## 工具链
| 工具 | 作用 |
|---|---|
| `tools/extract_pack.mjs` | 从任意工作台 HTML 抽内容包 + 生成锚点模板（升级旧产品用） |
| `tools/build_from_pack.mjs` | 内容包内联进模板 → 最终 HTML（构建时内联，保离线单文件） |
| `tools/verify_roundtrip.mjs` | 外置↔重建忠诚性校验（零信息丢失证） |

## 关键事实
- **内容全外置**：约 37 处内容常量（`CN_CUR/MA_CUR/SC_CUR/EN_CUR/ENGLISH/作息/皮肤/补表…`）已抽进内容包；`IMG`(图) `AUDIO`(发音) 留模板，内容包按 key 引用。
- **构建时内联**：`build_from_pack` 把 JSON 直接作为 JS 字面量注入 `/*__PACK:NAME__*/` 锚点；注入时 `<` 转 `\u003C` 防 `</script>` 击穿。
- **基线不硬编码**：`baseline` 由脚本从内容包算（取代原 `DATA:236/...` 硬数字），通用门禁改断言结构自洽。

## 更深的方法（铁律/皮肤/图标/音频/SW 版本/发布闭环）
模板脱胎于原深圳2026秋产品，其完整开发与发布经验见原 skill：
`~/.workbuddy/skills/er2-workbench-dev/SKILL.md`（含教材准确性铁律、三级下钻、图片流水线、9 套门禁、PWA 发布闭环）。
开源分发后，这些经验归"维护原产品"用；**本仓库只关心"换内容包生成新工作台"**。

## 路径约定
示例脚本里的绝对路径（如 `C:/Users/...`）是开发机示例；开源后请用相对路径或将工具链装进仓库（Python venv + Node + 无头 Edge 即可，无外部依赖）。
