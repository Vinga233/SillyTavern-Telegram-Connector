# Changelog

## v1.8.0-history-chat-stable

发布日期：2026-07-26

基于 v1.7.5 的稳定版本，修复了历史聊天角色检测和 AI 回复重复发送问题。

### Fixed（修复）

- **历史聊天显示"请先选择一个角色"**
  - 根因：`listchats` handler 使用 `context.characterId`（ST 的 `this_chid`），页面刷新后变为 `undefined`
  - 修复：增加 fallback，当 `characterId === undefined` 时通过 `context.name2` 查找角色
- **AI 回复重复发送**
  - 根因：`finalHandler` 同时注册了 `GENERATION_ENDED` 和 `GENERATION_STOPPED`，用户停止生成时两个事件均触发
  - 修复：删除 `GENERATION_STOPPED` 上的 `finalHandler` 注册，增加 `_finalSendLocks` 单次执行锁

### Changed（改进）

- `listchats` handler 增加 `name2` fallback 查找逻辑
- `handleFinalMessage` 增加 `(chatId, lastMessageId)` 去重锁

### Technical Details

**文件:** `st-extension/index.js`
- `case 'listchats'`: 当 `context.characterId === undefined` 时通过 `context.name2` 在 `characters` 数组中查找
- `handleFinalMessage`: 增加 `_finalSendLocks` map，`chatId + '_' + lastMessageIdInChatArray` 作为 key
- `user_message` handler: 删除 `event_types.GENERATION_STOPPED` 上的 `finalHandler` 注册

---

## v1.7.5 — Past Chats Feature + Stability Fixes

发布日期：2026-07-26

### Added（新增）

- **Past Chats（历史聊天）功能**
  - `listchats`, `switchchat`, `switchchat_N` 命令
  - `chat_info` WebSocket action 用于角色/聊天状态同步
  - CHAT_CHANGED / CHAT_LOADED 事件监听，自动从 ST 同步状态
- `/greet N` 命令：选择 alternate_greetings 开场白
- Telegram 角色菜单增加"📁 历史聊天"按钮
- `setCurrentChatName()` session 方法

### Fixed（修复）

- `/switch` 数字索引无法解析
  - `commands.js`: 增加纯数字判断，调用 `selectCharacterById(Number)`
- `character_info` 超时
  - `sillytavern.js _handleResponse`: 修复 payload 未定义引用错误
- CHARACTER_MESSAGE_RENDERED 监听时序
  - Extension: listener 注册移到 `selectCharacterById()/doNewChat()` 之前
- Generation 状态机 finalized 保护
  - `handleStreamChunk`: 检测到 finalized 时 reset runtime 而非 return
  - `handleFinalUpdate`: 恢复 finalized guard，避免重复处理
- Session 初始化
  - `commands.js`: slash 命令增加 `getOrCreate` session
- Telegram 发送链路
  - 所有 `sendMessage` 增加 `await + try/catch`
- 翻译错误隔离
  - `handleFinalMessage` 的 setTimeout 内增加 `try/catch`

### Technical Details

**新增文件:**
- `server/utils/debugTrace.js` — 统一调试追踪
- `server/utils/characterNormalizer.js` — 角色卡数据标准化

**修改文件:**
- `server/telegram/commands.js` — switch 数字解析, greet 命令, chat_info 同步
- `server/telegram/callbacks.js` — chats:list callback
- `server/menus/index.js` — 历史聊天按钮
- `server/state/session.js` — setCurrentChatName()
- `server/telegram/bot.js` — chat_info handler
- `server/services/generation.js` — 状态机修复
- `server/services/sillytavern.js` — payload bug 修复
- `st-extension/index.js` — CHAT_CHANGED/LOADED 同步, 事件时序修复

---

## v1.7.4 — Debug Trace Instrumentation

发布日期：2026-07-25

### Added（新增）

- `utils/debugTrace.js` — 统一调试追踪模块（traceId, timestamp, event, payload）
- `/debug state` 命令 — 输出完整 Session / CharacterState / Runtime 状态
- Extension WebSocket 增加 request/response 日志

### Fixed（修复）

- Character Card 返回角色卡数据不完整问题
- `character_card_raw` action 返回完整 character object
- `characterNormalizer.js` 兼容新旧两种角色卡数据结构

### Technical Details

**新增文件:**
- `server/utils/debugTrace.js`
- `server/utils/characterNormalizer.js`

**修改文件:**
- `st-extension/index.js` — character_card_raw, character_info 改进
- `server/telegram/commands.js` — debug state 命令

---

## v1.7.4-a — Session Character Sync Fix

发布日期：2026-07-25

### Fixed（修复）

- Telegram menu 显示"当前角色: 未知"
  - 根因：`switchchar`/`switch`/`switchchar_N` 命令成功切换 ST 角色后，没有同步 `session.currentCharacter`
  - 修复：在三个命令成功路径中增加 `sessionStore.setCurrentCharacter()`

### Technical Details

**修改文件:**
- `server/telegram/commands.js` — switch, switchchar, switchchar_N 成功后保存角色名到 session

---

## v1.7.3 — Character Greeting Event Bridge Fix

发布日期：2026-07-25

### Fixed（修复）

- 角色切换后无法自动发送角色卡 first_mes
  - 根因：SillyTavern 原生已经在 `doNewChat()` 内部生成了 `first_mes`（通过 `CHARACTER_MESSAGE_RENDERED` 事件），但 Extension 没有监听该事件
  - 修复：删除 `sendCharacterGreeting()` 和基于 `setTimeout` + `context.chat[0]` 的读取方式，改为注册一次性 `CHARACTER_MESSAGE_RENDERED` 监听器

### Technical Details

**修改文件:**
- `st-extension/index.js`
  - 删除 `sendCharacterGreeting()` 函数（手动模拟 greeting）
  - 在 `switchchar`/`new` handler 中先注册 `CHARACTER_MESSAGE_RENDERED` 一次性监听，再执行角色切换

---

## v1.7.2 — Character Initialization Fix

发布日期：2026-07-25

### Fixed（修复）

- 通过 Telegram 切换新角色后，SillyTavern 没有自动输出角色 greeting / first message
  - 修复：`switchchar`/`doNewChat()` 后通过 `selectCharacterById()` + `doNewChat()` 触发 ST 原生角色初始化流程

### Technical Details

**修改文件:**
- `st-extension/index.js` — 增加 `sendCharacterGreeting()` 实验性修复（v1.7.3 中被替换为事件桥方案）
- `server/services/character.js` — switchCharacter 流程调整
- `server/services/generation.js` — greeting 发送路径确认

---

## v1.7 + v1.7.1 — Runtime State, Metrics, Middleware, Streaming Stabilization

发布日期：2026-07-25

### Added（新增）

- **Runtime State Layer** (`server/state/runtime.js`)
  - 完整 generation 生命周期管理（idle → generating → streaming → finalizing → completed → failed）
  - `cleanupExpired()` — 自动清理超时生成
- **Request Metrics** (`server/services/metrics.js`)
  - `snapshot()` / `reset()` 安全查询接口
- **Service Middleware** (`server/utils/serviceWrapper.js`)
  - `wrapService()` — 不改变 `this` 上下文 / async 返回 / error 传播
- **Streaming Finalized Protection**
  - `generation.js`: 拦截重复 final_message_update、超时 fallback

### Fixed（修复）

- Runtime 长时间卡死：增加超时清理机制
- stream_chunk 后没有 final_message_update：增加异常恢复
- final_message_update 重复到达：finalized 保护
- Metrics 外部直接修改内部对象：要求使用 `snapshot()` / `reset()`

### Technical Details

**新增文件:**
- `server/state/runtime.js` — 状态机管理
- `server/services/metrics.js` — 请求指标统计
- `server/utils/serviceWrapper.js` — 服务包装器
- `server/scripts/test-smoke.js` — 基础冒烟测试

**修改文件:**
- `server/services/generation.js` — 流式最终化保护、超时恢复
- `server/services/sillytavern.js` — 路由适配

---

## v1.6.x — Error Handling & Diagnostics System

发布日期：2026-07-25

对应 commits:
- `3e58609` Phase 1: 基础工具 — trace 链追踪 + sanitizer 脱敏 + reporter 报告文件
- `7e1fc86` Phase 2: ErrorService — 错误编号/报告生成/管理员通知/AI排查建议
- `04b2fae` Phase 3: /debug 命令 + diagnose 诊断包 + config.example
- `761a37d` Phase 4: 全局异常接入 — server.js + errorService + /debug 命令

### Added（新增）

- **Trace Chain** (`utils/trace.js`)
  - 请求级 traceId 生成与传递
- **Sanitizer** (`utils/sanitizer.js`) — 敏感信息脱敏
- **Reporter** (`utils/reporter.js`) — 错误报告文件生成与管理
- **Error Service** (`services/error.js`)
  - 错误编号生成、管理员通知、AI 排查建议
- **Diagnose** (`utils/diagnose.js`) — 诊断包生成
- `/debug` 命令 — runtime / metrics / requests 子命令

### Technical Details

**新增文件:**
- `server/utils/trace.js`
- `server/utils/sanitizer.js`
- `server/utils/reporter.js`
- `server/services/error.js`
- `server/utils/diagnose.js`

---

## v1.5.x — Core Feature Development

发布日期：2026-07-25

对应 commits:
- `699b076` Phase 1: Streaming 修复 — stream_end 去文本, handleFinalMessage 改为 once
- `a9ba3aa` Phase 2: Response 统一协议 — request/response 机制 + ST 端 request 分发
- `41779e1` Phase 3: Character Card — getCharacterInfo + char:info callback + /charinfo + 菜单详情按钮
- `b73c23b` Phase 4: Chat History — session currentChatName + requestChatHistory + /context + 菜单
- `a3a7c0c` Phase 5: Alternate Greetings — select_greeting 命令 + 菜单 + callback

### Added（新增）

- **Response 统一协议**: request/response WebSocket 消息机制
- **Character Card**: 角色详细信息查询（`/charinfo`、菜单角色详情按钮）
- **Chat History**: 聊天上下文查看（`/context`、菜单上下文按钮）
- **Alternate Greetings**: 开场白选择功能
- ST Extension 端 request 分发路由

### Technical Details

**修改文件:**
- `server/services/sillytavern.js` — request/response 协议
- `server/services/character.js` — getCharacterInfo
- `server/services/chat.js` — requestChatHistory
- `server/telegram/callbacks.js` — char:info, char:greetings, char:greeting callbacks
- `server/telegram/commands.js` — /charinfo, /context, /greet 命令
- `server/menus/index.js` — 角色详情、开场白、上下文菜单按钮
- `st-extension/index.js` — request 分发、alternate_greetings handler

---

## v1.5.0 — Modular Architecture and Telegram Menu System

发布日期：2026-07-24

### Added（新增）

- **模块化架构重构**
  - `server/` 目录结构：`services/`, `telegram/`, `menus/`, `config/`, `utils/`, `state/`
  - 分层架构：Telegram Layer → Session Layer → Service Layer → SillyTavern WebSocket Layer
- **Telegram 菜单系统**
  - 角色管理菜单、记忆管理菜单、世界书菜单、生成控制菜单、快捷回复菜单、设置菜单
  - 内联键盘导航
- **Session 管理** (`state/session.js`)
  - 用户会话状态管理
- **Generation Service** (`services/generation.js`)
  - 流式消息处理、非流式回复处理
- **Character Service** (`services/character.js`)
  - 角色切换、角色信息查询
- **Chat Service** (`services/chat.js`)
  - 聊天历史获取

### Technical Details

**核心架构文件:**
- `server/server.js` — WebSocket 服务器入口
- `server/menus/index.js` — 菜单 UI 定义与渲染
- `server/telegram/bot.js` — Telegram Bot 初始化
- `server/telegram/commands.js` — 命令路由
- `server/telegram/callbacks.js` — Callback Query 路由
- `server/services/generation.js` — 生成流程管理
- `server/services/sillytavern.js` — ST WebSocket 通信
- `server/state/session.js` — 会话状态

---
