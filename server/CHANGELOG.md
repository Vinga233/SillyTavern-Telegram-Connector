# CHANGELOG.md

> 项目：SillyTavern Telegram Connector
> 所有显著变更均记录在此文件

---

## [1.7.1] — 2026-07-25

### Production Stabilization

V1.7 稳定化补丁，所有变更只涉及稳定性，无新功能。

### Runtime 生命周期保护

- **超时自动清理**：generating 超时 5min、streaming 超时 5min、finalizing 超时 30s 自动标记为 failed
- **`cleanupExpired()`**：每 30 秒检测卡死生成，记录 timeout/traceId/requestId 到日志
- **`getAllEntries()`**：新增 debug 方法，查看所有运行时条目
- **`setRequestId()`**：支持在 runtime 中关联 requestId

### Generation 异常恢复

- **final_message_update 恢复超时**：stream_end 后 30s 无 final_message_update → 发送 fallback 文本（已收到的不完整内容或 "生成超时" 提示），标记 failed
- **finalized 保护增强**：所有 handler 入口检查 finalized 标志，防止重复编辑
- **日志格式统一**：所有 generation 日志增加 `[chatId=N]` 前缀

### Debug 命令

- **`/debug runtime`**：显示所有运行时条目（chatId / status / duration / traceId）
- **`/debug metrics`**：显示请求统计（total / success / failed / timeout / avg latency / per-action）
- **`/debug requests`**：显示 pending WebSocket 请求数量
- `/debug` 不再要求 ST 连接

### Metrics 稳定性

- **`snapshot()`**：深拷贝快照，外部修改不影响内部计数
- **`getHealth(stService)`**：返回系统健康摘要（normal / degraded / busy），含连接状态和超时率

### 测试

- **新增 `scripts/test-smoke.js`**：33 个测试用例覆盖 Runtime 状态机（21 项）、Metrics（11 项）、ServiceWrapper（1 项）

### 修改文件

| 文件 | 变更 |
|------|------|
| `state/runtime.js` | 超时清理 + getAllEntries + setRequestId |
| `services/generation.js` | final_message_update 恢复超时 + finalized 保护 + 日志格式 |
| `services/metrics.js` | snapshot() + getHealth() |
| `telegram/commands.js` | 3 个新 debug 子命令 |
| `scripts/test-smoke.js` | 新增 smoke test（33 项） |

---

## [1.7.0] — 2026-07-25

### Runtime State Layer

- **新增 `state/runtime.js`**：独立于 Session 的运行时状态管理
- 生成状态机：idle → generating → streaming → finalizing → completed / failed
- 6 种状态常量 + 查询方法（isGenerating / isFinalized / getStatus）
- 与 Session 分离原则：Session 管用户偏好，Runtime 管线程瞬时状态

### Streaming 生命周期修复

- **finalized 保护**：final_message_update 只执行一次，后续自动忽略
- 状态机约束：stream_chunk → stream_end → final_message_update 三阶段受 runtime 约束
- `forceCleanup()`：用于外部超时处理的强制清理接口

### Request Metrics

- **新增 `services/metrics.js`**：WebSocket request/response 全链路统计
- 按 action 分类记录：total / success / failed / timeout / latency
- 接入 sillytavern.js 的 request() / _handleResponse() / timeout 三个注入点
- _pendingRequests 扩展存储 action / startTime，支持延迟计算

### Service Middleware

- **新增 `utils/serviceWrapper.js`**：通用 Service 包装器
- 自动注入：logger（入口/出口/异常日志）、trace（子节点追加）、error capture（错误报告）
- 不改变业务逻辑：character.js 和 chat.js 仅改 module.exports 一行

### Telegram UI 增强

- **角色详情展示**：`char:info` callback → 显示 name / description / personality / first_mes
- **聊天上下文展示**：`chat:history` 增强 → 显示角色名 + 聊天名 + 最近 8 条消息
- **状态面板增强**：`status:show` 新增 runtime 生成状态 + metrics 请求统计
- **开场白选择流程**：修复 `char:greetings` / `char:greeting` callback 路由
- 菜单 callback_target 一致性修复

### 修改文件清单

| 状态 | 文件 |
|------|------|
| 新增 | `state/runtime.js` |
| 新增 | `services/metrics.js` |
| 新增 | `utils/serviceWrapper.js` |
| 修改 | `services/generation.js` |
| 修改 | `services/sillytavern.js` |
| 修改 | `services/character.js` |
| 修改 | `services/chat.js` |
| 修改 | `telegram/callbacks.js` |
| 修改 | `menus/index.js` |

---

## [1.6.0] — 2026-07-24

### Error Reporting 系统

- **新增 `services/error.js`**：核心错误服务，错误编号 ST-YYYYMMDD-xxxx
- **新增 `utils/reporter.js`**：JSON 错误报告文件管理
- **新增 `utils/sanitizer.js`**：敏感信息过滤（token / api key / password）
- **新增 `utils/diagnose.js`**：系统诊断包生成器，自动排除敏感信息
- **Trace 链追踪**：`utils/trace.js`，每次 Telegram 操作生成 TG-YYYYMMDD-xxxx 追踪链
- `/debug` 命令：查看系统状态、错误报告、生成诊断包
- 管理员通知：错误发生时通过 Telegram 发送简短通知（可配置关闭）
- AI 排查建议：根据错误类型自动生成排查建议

### Alternate Greetings

- **备用开场白系统**：`/select_greeting` 命令 + callback 菜单
- ST 扩展新增 `alternate_greetings` request 类型
- 开场白选择 → 新建聊天 → 写入对应 first message

### Chat History

- **聊天历史查询**：`requestChatHistory` 统一协议请求
- `/context` 命令：显示最近 5 条消息
- Session 新增 `currentChatName`
- ST 扩展新增 `chat_history` request 类型

### Character Card

- **角色卡详情**：`getCharacterInfo` 统一协议请求
- `/charinfo` 命令：显示角色 name / description / personality / scenario / first_mes
- 菜单按钮化：角色管理 → 角色详情 → 切换开场白
- ST 扩展新增 `character_info` request 类型

### Response 统一协议

- WebSocket 新增 `type: "request"` / `type: "response"` 协议
- `requestId` + `_pendingRequests` 队列 + timeout 机制
- ST 端 `onmessage` 分发 `request` → 执行 → `response`

### Streaming 修复

- `stream_end` 改为仅结束信号，不携带文本
- `final_message_update` 作为唯一终态文本
- 流式消息生命周期：chunk → end → final_update
- handleFinalMessage 注册方式从 on 改为 once，防止重复发送

---

## [1.5.0] — 2026-07-24

### 架构重构（重大变更）

完全重构了项目架构，从单文件 `server.js`（772 行）拆分为模块化架构：

```
server.js → 启动入口（15 行）
telegram/ → Telegram 交互层（4 文件）
services/ → 业务逻辑层（5 文件）
menus/    → 菜单 UI 层（1 文件）
state/    → 会话状态（1 文件）
utils/    → 基础设施（2 文件）
```

### 新增功能

- **Inline Keyboard 菜单系统** — 一级菜单 + 6 个子菜单，按钮导航
- **单消息编辑模式** — `editMessageText` 更新同一消息，不刷屏
- **Chat/Control 模式** — 文字=聊天，按钮=控制，自动切换
- **用户会话状态** — 每个用户独立 session（角色/菜单/模式）
- **统一 Callback 协议** — `module:action:param` 格式
- **文件日志系统** — 按模块和日期归档
- **统一错误处理** — 用户友好错误消息 + 重试按钮
- **快捷回复** — 6 个预设快捷回复按钮
- **原生命令菜单** — 9 个命令通过 setMyCommands 注册

### 保留功能

- ✅ 所有原有 slash 命令（/help /new /listchars /switchchar 等）
- ✅ WebSocket 协议完全兼容
- ✅ 流式消息处理不变
- ✅ 白名单机制
- ✅ 重启保护
- ✅ PM2 进程管理
- ✅ 开机自启动

---

## [1.0.0] — 原始版本

### 初始功能

- Telegram Bot 连接（node-telegram-bot-api）
- WebSocket 桥接（ws 库）
- 消息转发（Telegram ↔ SillyTavern）
- Slash 命令（/help /new /listchars /switchchar /listchats /switchchat）
- 系统命令（/reload /restart /exit /ping）
- 流式回复（逐词编辑、节流控制）
- 白名单检查
- 重启保护机制
- 单文件 server.js（772 行）
