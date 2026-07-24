# PROJECT_MEMORY.md — 项目记忆档案

> 生成日期：2026-07-24
> 用途：提供给 AI 助手快速恢复项目上下文
> 本文件由架构复盘自动生成

---

## 1. 项目概览

### 项目名称
SillyTavern Telegram Connector（代号：Snow AI）

### 项目目的
将 SillyTavern 的 AI 角色聊天能力通过 Telegram 延伸到手机端，打造私人 AI 控制台。

### 解决的问题
- 手机端无法直接使用 SillyTavern（仅 Web 端）
- 需要随时随地与自部署的 AI 角色聊天
- 需要一个可扩展的个人 AI 助手入口

### 目标用户
- 仅作者本人（单用户、本地部署）
- 不支持多用户、商业化、云部署

### 最终效果
```
手机 Telegram
    ↓ 发送消息 / 点击按钮
Telegram Connector（桥接服务器）
    ↓ WebSocket 协议
SillyTavern（角色引擎）
    ↓ API 调用
自部署 LLM 模型
```

---

## 2. 技术架构

### 整体架构图

```
┌─────────────────────────────────────┐
│         手机 Telegram 客户端          │
│    (/menu /regen /switch 等命令)     │
└──────────────┬──────────────────────┘
               │ Telegram Bot API
               ▼
┌──────────────────────────────────────┐
│    Telegram Connector（server.js）    │
│                                      │
│  ┌──────────┐  ┌──────────────────┐  │
│  │ Telegram  │  │    Menus 模块    │  │
│  │ 消息处理  │  │  Inline Keyboard │  │
│  │ 命令路由  │  │  单消息编辑      │  │
│  └────┬─────┘  └────────┬─────────┘  │
│       │                 │            │
│  ┌────▼─────────────────▼─────────┐  │
│  │      Services 业务层           │  │
│  │  Character / Chat / Memory     │  │
│  │  Generation（流式处理）         │  │
│  └───────────────┬─────────────────┘  │
│                  │                    │
│  ┌───────────────▼─────────────────┐  │
│  │   SillyTavern WebSocket 通信    │  │
│  │   (端口 2333)                   │  │
│  └───────────────┬─────────────────┘  │
└──────────────────┼───────────────────┘
                   │ WebSocket
┌──────────────────▼───────────────────┐
│   SillyTavern（浏览器端扩展）          │
│   端口 8000                          │
└──────────────────┬───────────────────┘
                   │ HTTP API
┌──────────────────▼───────────────────┐
│           LLM 模型 API                │
│    (Claude / OpenAI / 本地模型等)     │
└──────────────────────────────────────┘
```

### 各层职责

| 层 | 技术 | 职责 |
|----|------|------|
| Telegram UI | node-telegram-bot-api | 消息接收、Inline Keyboard、Callback 处理 |
| Command 路由 | bot.onText + callback_data | 将 Telegram 事件分发到对应 Service |
| Menus 层 | Inline Keyboard + editMessageText | 控制面板 UI，单消息编辑模式 |
| Session 层 | Map<chatId, Session> | 用户状态管理（chat/control 模式） |
| Services 层 | Node.js 类封装 | Character / Chat / Memory / Generation 业务逻辑 |
| WebSocket 层 | ws 库 | 与 SillyTavern 扩展的双向通信 |
| ST 扩展 | 前端 JavaScript | 桥接 Connector WebSocket 和 SillyTavern API |

---

## 3. 核心设计思想

### 关键设计决策

1. **Telegram 是"控制层"而非"命令入口"**
   - 设计区分了 Chat Mode（文字输入→聊天）和 Control Mode（按钮→操作面板）
   - 用户打字自动进入聊天，点按钮进入控制，0 学习成本

2. **单消息编辑模式**
   - 所有菜单通过 `editMessageText` 更新同一条消息
   - 避免聊天窗口被机器人消息刷屏
   - 用户视角就像在使用一个原生 App

3. **模块化架构**
   - server.js 仅 15 行，只做启动
   - telegram/、services/、menus/、state/ 四层分离
   - 新增功能不需要修改现有路由逻辑

4. **Callback 统一协议**
   - `module:action:param` 格式
   - 例如 `char:switch:Seraphina`、`generate:retry`
   - 新增模块只需加一个 case，不改架构

5. **状态驱动**
   - 每个用户有独立 Session（mode / currentMenu / currentCharacter）
   - 按钮操作 = control 模式，文字输入 = chat 模式
   - 不需要显式"退出菜单"

### 值得保留的设计

- Session 状态管理（state/session.js）
- Callback 协议格式（module:action:param）
- Service 层封装（services/ 目录）
- Generation 流式处理（节流编辑、Promise-based messageId）
- 单消息编辑模式
- 日志按模块/日期轮转

---

## 4. 已实现功能清单

| 功能 | 状态 | 说明 | 优先级 |
|------|------|------|--------|
| Telegram 原生命令菜单 | ✅ 完成 | 9 个命令，通过 setMyCommands 注册 | 核心 |
| Inline Keyboard 主菜单 | ✅ 完成 | 一级菜单 + 6 个子菜单，单消息编辑 | 核心 |
| 角色管理 | ✅ 完成 | 查看列表、切换角色、显示当前 | 核心 |
| 聊天转发 | ✅ 完成 | Telegram → ST 消息转发 | 核心 |
| 流式回复 | ✅ 完成 | 逐词编辑、节流控制、最终更新 | 核心 |
| 重新生成 | ✅ 完成 | /regen + 菜单按钮 | 核心 |
| 撤销回复 | ✅ 完成 | /undo + 菜单按钮 | 核心 |
| 新建聊天 | ✅ 完成 | /new + 菜单按钮 | 核心 |
| 状态查看 | ✅ 完成 | /status + 菜单按钮，显示 ST 连接状态 | 核心 |
| Chat/Control 模式切换 | ✅ 完成 | 文字=聊天，按钮=控制 | 核心 |
| 白名单 | ✅ 完成 | config 配置，可选 | 安全 |
| 重启保护 | ✅ 完成 | 防循环重启 | 运维 |
| PM2 进程管理 | ✅ 完成 | 后台运行 + 开机自启 | 运维 |
| 文件日志 | ✅ 完成 | 按模块/日期轮转 | 运维 |
| 快捷回复 | ✅ 完成 | 6 个预设快捷回复按钮 | 扩展 |
| 帮助信息 | ✅ 完成 | /help + 菜单按钮 | 基础 |
| 记忆管理 | ⏳ 预留 | 菜单入口已建，功能待实现 | 扩展 |
| 世界书 | ⏳ 预留 | 菜单入口已建，功能待实现 | 扩展 |
| 设置页 | ⏳ 预留 | 菜单入口已建，功能待实现 | 扩展 |
| 停止生成 | ⚠️ 部分实现 | 按钮已加，后端处理待完善 | 扩展 |

---

## 5. 关键代码模块分析

### 目录结构

```
server/
│
├── server.js                 # 启动入口（15 行）
│
├── config/
│   ├── config.js             # Telegram Token + WS 端口 + 白名单
│   └── constants.js          # 模块/动作常量枚举
│
├── telegram/                 # Telegram 交互层
│   ├── bot.js                # Bot 初始化、setMyCommands、轮询、白名单检查、ST→TG 转发
│   ├── commands.js           # Slash 命令路由（/start /menu /regen /undo 等）
│   ├── callbacks.js          # Callback Query 分发（module:action:param 路由）
│   └── messages.js           # 普通消息 → Chat Mode 转发
│
├── services/                 # 业务逻辑层
│   ├── sillytavern.js        # WebSocket 服务器、连接管理、进程控制
│   ├── generation.js         # 流式消息处理、消息编辑节流
│   ├── character.js          # 角色管理（listchars / switchchar）
│   ├── chat.js               # 聊天管理（new / listchats / switchchat）
│   └── memory.js             # 记忆管理（预留接口）
│
├── menus/                    # 菜单 UI 层
│   └── index.js              # 所有菜单定义（主菜单 + 6 个子菜单）
│
├── state/
│   └── session.js            # 用户会话状态管理（单例 Map）
│
├── utils/
│   ├── logger.js             # 文件日志（按模块/日期轮转）
│   └── errors.js             # 统一错误处理
│
└── logs/                     # 运行时日志
```

### 模块关系图

```
server.js
    │
    ├── telegram/bot.js ──────────┬── telegram/commands.js
    │                             ├── telegram/callbacks.js
    │                             ├── telegram/messages.js
    │                             └── services/generation.js
    │
    ├── services/sillytavern.js ───┬── services/character.js
    │                              ├── services/chat.js
    │                              └── services/memory.js
    │
    ├── menus/index.js
    ├── state/session.js
    └── utils/logger.js + errors.js
```

### 文件修改指南

**不易修改（改动需谨慎）：**
- `services/sillytavern.js` — WebSocket 协议变更会影响 ST 扩展
- `services/generation.js` — 流式处理逻辑改动易引入竞态
- `telegram/commands.js` — 命令路由错了会影响所有 slash 命令
- `telegram/bot.js` — 初始化流程，出错整个 Bot 不可用

**容易扩展：**
- `menus/index.js` — 直接加函数定义菜单布局，不改路由
- `telegram/callbacks.js` — 按 module 加 case 即可扩展
- `services/` 目录 — 加新服务文件，不影响现有服务
- `state/session.js` — 在 Session 对象上加字段即可

---

## 6. 项目优点分析

### 设计正确的决策

1. **先设计架构再写代码**
   - V1.5 架构重构避免了 server.js 单文件膨胀到数千行
   - 后续加 Agent、MCP 不需要改现有路由

2. **Chat/Control 模式分离**
   - 用户无感知切换，文字=聊天，按钮=操作
   - 比 Telegram 常见的"退出菜单模式"设计更自然

3. **Callback 统一协议**
   - module:action:param 简单可扩展
   - 比随机 callback_data 字符串好维护

4. **单消息编辑**
   - 体验好，不刷屏
   - 原项目没有这个设计，是 V1.5 提升最大的点

### 降低后续开发成本的设计

- 模块化架构：加新功能只需新增文件，不修改现有文件
- Service 层封装：Telegram 命令和 Inline Button 共用同一 service
- Session 状态管理：所有用户状态集中管理，方便加新状态字段
- 日志系统：按模块归档，排查问题不用翻混在一起的日志

### 可扩展性体现

- memory.js 和 services/ 目录结构天然支持加 Agent 服务
- callback 协议可以无缝扩展 module:action:param
- Telegram 命令和菜单按钮调用同一 service 层
- 预留了 worldbook、memory、settings 的菜单入口

---

## 7. 项目不足与技术债

### P1: 需要优先解决

| 问题 | 原因 | 影响 | 方案 |
|------|------|------|------|
| 角色切换后 inline button 未更新 | char:switch 后没有触发菜单刷新 | 用户需返回菜单再进才能看到新角色 | switch 成功后调用菜单刷新 |
| SillyTavern 断连后菜单按钮不可用 | 按钮操作直接调用 stService | 用户点击按钮无反馈 | 在 callback 中增加连接检查 + 友好提示 |
| 停止生成（stop）不完全 | 只发了 WebSocket 信号，ST 端未完全实现 | 按钮失效 | 确认 ST 扩展的 stop_generation 处理逻辑 |

### P2: 建议优化

| 问题 | 原因 | 影响 | 方案 |
|------|------|------|------|
| 角色切换使用 callback_data 传递角色名 | 中文名可能导致 Telegram callback 长度限制 | 长角色名可能截断 | 使用序号或 ID 代替角色名 |
| 没有定期清理 Session | Session Map 持续增长 | 内存泄漏 | 增加超时清理机制 |
| 日志文件无限增长 | 没有轮转删除策略 | 磁盘占用 | 增加日志保留天数配置 |
| config.js 中 Token 明文存储 | 本地使用问题不大 | 安全风险 | 支持 .env 文件加载 |
| PM2 启动没有自动连接 ST 扩展 | ST 扩展需手动点连接 | 每次重启需手动操作 | 研究 ST 扩展的 autoConnect 配置 |

### P3: 未来考虑

- 无单元测试覆盖
- 没有 TypeScript 类型定义
- 错误处理不够细分（所有错误走同一流程）
- 没有速率限制（防止连续点击刷消息）

---

## 8. 下一阶段优化路线

### 短期（V1.5 → V1.6）
- [ ] 修复角色切换后菜单不刷新的问题
- [ ] 实现记忆管理功能（memory:summary / memory:view）
- [ ] 实现世界书管理功能（worldbook:view / enable / disable）
- [ ] 增加 Session 超时清理
- [ ] 完善停止生成流程
- [ ] 日志文件按天保留自动清理

### 中期（V1.6 → V1.7）
- [ ] Agent 工具调用入口（agents 服务模块）
- [ ] 快捷消息自定义配置（用户可编辑快捷回复内容）
- [ ] 设置页面实现（模型切换、参数调节）
- [ ] 错误处理细化（细分错误类型，针对性恢复）
- [ ] 角色搜索功能

### 长期（V2.0）
- [ ] MCP（Model Context Protocol）集成
- [ ] 浏览器自动化（如 BOSS 直聘投递）
- [ ] TTS 语音回复
- [ ] 图片理解与生成
- [ ] 长期记忆数据库
- [ ] 文件处理能力

---

## 9. 给未来 AI 助手的上下文说明

### 项目背景
这是一个将 SillyTavern（AI 角色扮演引擎）通过 Telegram Bot 桥接到手机端的个人项目。作者是单人开发者，项目部署在本地 Windows 机器上。

### 用户目标
实现一个可以随时随地在手机上使用的个人 AI 助手，以 SillyTavern 的角色卡系统为基础，未来逐步接入 Agent、MCP、自动化等能力。

### 设计原则（不要破坏）
1. **不谈业务逻辑** — commands.js、callbacks.js、menus 只做路由分发，不实现业务
2. **单消息编辑** — 所有菜单必须复用同一条消息，不刷屏
3. **Chat/Control 分离** — 文字=聊天，按钮=控制，两者不互相阻塞
4. **Service 复用** — slash 命令和 inline button 必须调用同一 service 方法
5. **不修改 SillyTavern 核心代码** — 所有改动只在 Connector 项目内

### 不能破坏的功能
- 流式消息编辑（generation.js 的节流逻辑）
- 白名单检查（安全底线）
- 重启保护（防循环重启）
- WebSocket 通信协议（ST 扩展依赖）

### 推荐开发方式
1. 先读 `PROJECT_MEMORY.md` 了解全貌
2. 加新功能时看 `callbacks.js` 是否有类似 case 可参考
3. 新业务逻辑写在 `services/` 下
4. 新菜单入口写在 `menus/index.js` 下
5. 启动后通过 PM2 管理进程（`pm2 start` / `pm2 logs` / `pm2 save`）

---

## 10. 自评打分

| 维度 | 分数 | 说明 |
|------|------|------|
| 架构评分 | 8/10 | 模块化清晰，但部分 callback 逻辑仍有优化空间 |
| 扩展性评分 | 9/10 | callback 协议和 service 层设计天然支持扩展 |
| 代码质量评分 | 7/10 | 代码结构合理但缺少测试和类型检查 |
| 维护成本评分 | 8/10 | 模块化减少维护负担，日志系统便于排查 |

