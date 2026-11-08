# dsh-claim-check

**来源原文是否真的支持这条断言？**

*逐字节、确定性、可复算：逐字片段、数字、带标签的数值、否定与限定。转述按 `insufficient` 处理，绝不报“支持”。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 它做什么

- **逐字片段检查** —— 断言中的每一段引用都必须出现在原文中（空白与 Unicode 已规范化）。
- **数字检查** —— 断言中的每个数字字面量都必须出现在原文中，并容忍格式差异（`2.50` = `2.5`）。
- **带标签的数值检查** —— 当断言写 `d = 0.80`、原文写 `d = 0.45` 时，断言被判为 `disproven`，并同时显示两个值。正是这一步把“少了一个数字”变成真正的矛盾。
- **极性检查** —— 拿否定句（“**not** significant”）的片段拼出的肯定断言，会被判为 `contradicted`。
- **强度检查** —— 把带限定或仅表相关性的句子（“may be associated”“preliminary”）说成因果结论（“proves”“demonstrates”），会被判为 `contradicted`。
- **REP 集成** —— 原文快照 + 断言 + 判定 + 各项检查会组成一条合法记录；`claim_bind` 可对照 `doc_anchor` / `cite_verify` 已经存储的证据做检查。

## 它不做什么

- **不做语义判断。** 没有逐字片段的转述判为 `insufficient`，而不是“支持”。这是有意设定的边界，不是缺陷。
- **不重做数据分析。** 它不检查底层统计量是否正确 —— 那属于 `dsh-statcheck`。
- **不读 PDF。** 请先抽取文本（`dsh-doc-anchor`）。
- **不指控学术不端。** 判定只针对文本，绝不针对作者。
- **不调用模型。** 每一项发现都能由两个字符串重新算出。

## 判定语义

| 判定 | 含义 |
|---|---|
| `verified` | 找到了逐字片段，**且**数字一致（并且没有极性/强度矛盾） |
| `disproven` | 引用片段不存在，或某个带标签的数值与原文矛盾 |
| `contradicted` | 被引句子的否定或限定被翻转了 |
| `insufficient` | 没有逐字片段（属于转述），或缺少数字，或原文没有相关内容 |
| `unverified` | REP v1 为没有任何可核查内容的断言保留；v0.1 把这类转述报告为 `insufficient` |

`insufficient` 从不表示“假”，也从不表示“干净”。

## 工具

### `claim_check`

`{ claim, text? | path?, quote?, persist? }` → `{ ok, verdict, checks[], quotes[], labels[], evidenceId?, claimId?, recordPath? }`。

### `claim_bind`

`{ claim, evidenceId, quote?, persist? }` —— 从 REP 存储中读取证据的文本快照，并把断言与判定写入该存储。

### `claim_report`

`{ claim, verdict, checks }` → `{ ok, markdown, sarif }`。失败/警告级检查会转成 SARIF 结果。

### 错误码

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `EVIDENCE_UNKNOWN` · `STORE_ERROR`

## 兼容性与安装

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`**（2026-11-08 实测）；peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0`（实测 `24.22.1`），仅 ESM |
| Peer 依赖 | `@perrylink/dsh-research-core ^0.1.0`、`@deepseek-ai/cordis ^4.0.5-alpha.1`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| 运行时依赖 | **零** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core @perrylink/dsh-claim-check
dsh --profile <name> --dump-config | grep @perrylink/dsh-claim-check
```

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 时不挂载任何内容 |
| `root` | `.claim-check` | 存储与记录的根目录 |
| `workspaceRoot` | `process.cwd()` | 来源路径必须解析到该目录内 |
| `maxChars` | `2000000` | 原文字符数上限（超限即失败，绝不截断） |
| `persist` | `true` | 存储证据、断言与记录 |

## 评测

### 回归基线 —— `dsh-research-bench` claims v0.1.0（50 个用例）

```sh
pnpm run bench:claims
```

| 指标 | 值 |
|---|---:|
| 判定准确率 | **1.00** |
| verified 精确率 / 召回率 | **1.00 / 1.00** |
| insufficient 精确率 / 召回率 | **1.00 / 1.00** |
| contradicted 精确率 / 召回率 | **1.00 / 1.00** |
| disproven 精确率 / 召回率 | **1.00 / 1.00** |
| 过度声称率（把不受支持的断言判为 verified） | **0.00** |
| 对受支持断言的误报率 | **0.00** |

逐用例原始预测：[`bench/results-claims.json`](bench/results-claims.json)。

**有效性说明（引用这些数字前请先读）。** 这 50 个用例与检测规则是按照同一份评分标准一起写出的，而且在开发过程中有一个原本受支持的用例失败后，极性规则被收窄了。因此这些数字是**回归基线，而不是对真实稿件准确率的无偏估计**。下面的留出集是下一步；它是由同一作者编写的时间留出集，而不是完全盲测。

### 留出集（held-out）—— `dsh-research-bench` claims-heldout v0.1.0（50 个用例，2026-11-08 冻结）

```sh
pnpm run bench:claims-holdout
```

这 50 个用例位于同级 `dsh-research-bench` 工作树的 `data/claims-heldout/`（7 段合成原文，每段 4 句），并在第一次评测运行之前冻结。`SUMMARY.json` 记录 `heldOut: true`、`frozenAt: "2026-11-08"` 与 `sha256:016eaa67ba12ec1b3022e68dbc627b414c43733551fdd457b70dd1907e81d470`。运行器每次都会重新计算 `cases.jsonl` 的哈希；若与冻结哈希不一致就拒绝评分。冻结之后没有改过任何标签。

| 指标 | 回归基线 | 留出集 |
|---|---:|---:|
| 判定准确率 | 1.00 | **0.96**（48/50） |
| verified 精确率 / 召回率 | 1.00 / 1.00 | **0.88 / 1.00** |
| insufficient 精确率 / 召回率 | 1.00 / 1.00 | **1.00 / 1.00** |
| contradicted 精确率 / 召回率 | 1.00 / 1.00 | **1.00 / 0.83** |
| disproven 精确率 / 召回率 | 1.00 / 1.00 | **1.00 / 1.00** |
| 过度声称率（把不受支持的断言判为 verified） | 0.00 | **0.06**（2/35） |
| 对受支持断言的误报率 | 0.00 | **0.00** |

逐类准确率：supported 15/15、paraphrase 10/10、number-wrong 8/8、negated 6/7、quote-mined 4/5、insufficient 5/5。

逐用例原始预测：[`bench/results-claims-holdout.json`](bench/results-claims-holdout.json)；markdown：[`bench/results-claims-holdout.md`](bench/results-claims-holdout.md)。

**两处错误都是过度声称，而且都是线索词表覆盖不足。** 本留出集上的引用定位、数字匹配与带标签数值矛盾全部正确；错误来自词法线索表不认识的语义线索：

1. `claim-0034`（negated；期望 `contradicted`，实际 `verified`）。原文说 "The coating failed to improve rate capability..."，断言只引用了 "improve rate capability at 4.2 V"。"Failed to" 是语义否定，但 v0.1 的否定线索是 `not` / `no` / `never` / ...，不包含它，因此极性检查没有触发。候选修复：把 `fail(?:ed|s)? to`、`unable to`、`declined to` 加入线索表，并补回归测试。
2. `claim-0045`（quote-mined；期望 `contradicted`，实际 `verified`）。原文说 "Cooling seems tied to canopy density..."，断言把这种关联说成 "proves" 的因果结论。"Seems tied to" 是带限定/关联性的说法，但 v0.1 的限定线索不包含它，因此强度检查没有触发。候选修复：把 `seem(?:s|ed)?`、`appear(?:s|ed)?`、`tied to`、`linked to`、`tentative`、`exploratory` 加入限定线索，并补测试。

这正是回归基线无法暴露的问题：基线用例和线索词表是同一作者一起写的。

**独立性说明（如实）。** 留出集**不是完全盲测**。它由与回归基线同一位评分标准作者按照 `rubric/CLAIMS.md` 编写，并沿用同样的构造约定（显式双引号片段、每条断言一个引用片段、合成英文段落）。独立的是内容：7 个新主题、新句子、新数字，且没有复用 `data/claims` 的任何 source 段落或 claim；标签在第一次评测运行前就已固定并写入哈希，冻结后未再改动。它是时间上的留出集、是对线索词表覆盖度的检验，而不是对真实稿件准确率的无偏估计：该集合是合成的，且每类样本很小（5–15 条）。数据集目前留在同级 bench 工作树中；本仓库提交运行器和冻结后的结果，不提交这些用例。

### 测试

**26 个测试**，分布在三个文件：evaluator（含所有格的引号抽取、首个 token 重复时的精确引用偏移、句子定位、verified / 转述 / 引文缺失 / 带标签数值矛盾 / 否定翻转 / 带限定词的过度声称 / 零结果准确性 / 区间引用 / 数字缺失 / 内容缺失）、runtime/tools（REP 记录合法性、重复核查不产生证据冲突、persist=false、路径逃逸、绑定已存证据及其文本快照而非第一个快照；schema、渲染器、失败分支、包契约）、mount（enabled/disabled 挂载契约）。

## 已知限制（v0.1）

- 不解析间接引用、引文标记与表格查找。
- 限定词检测是词法式的（使用固定的线索词表），因此刻意避开这些动词的因果断言可能通过检查。
- 被引用的*区间*或样本量不携带方向信息，因此只对带方向性的片段做极性检查。
- 非英文断言在结构上可用，但线索词表只有英文。
- 留出集运行发现了两处具体的线索缺口：`failed to`（语义否定）与 `seems tied to`（限定/关联）；均记录在上面的留出集小节中。

## 许可

Apache-2.0。运行时不含第三方代码。
