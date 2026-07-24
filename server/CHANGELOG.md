# CHANGELOG.md

> 项目：SillyTavern Telegram Connector
> 所有显著变更均记录在此文件

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

