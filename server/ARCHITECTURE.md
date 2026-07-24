# ARCHITECTURE.md — 系统架构文档

> 面向开发者，描述系统结构和模块设计

---

## 一、整体架构

### 三层架构

```
┌──────────────────────────────────────────────────────────┐
│                    Presentation Layer                     │
│                                                          │
│  Telegram Bot API  ←──→  Inline Keyboard / Callback     │
│                                                          │
│  （消息输入、菜单显示、按钮交互）                           │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                    Service Layer                          │
│                                                          │
│  CharacterService    ChatService    MemoryService        │
│  GenerationService   SillyTavernService                  │
│                                                          │
│  （业务逻辑、状态管理）                                    │
└──────────────────────────┬───────────────────────────────┘
                           │ WebSocket
┌──────────────────────────▼───────────────────────────────┐
│                    SillyTavern Layer                      │
│                                                          │
│  ST Extension (Browser) → ST API → LLM Model            │
│                                                          │
│  （角色引擎、对话生成）                                    │
└──────────────────────────────────────────────────────────┘
```

---

## 二、模块详解

### 2.1 启动入口 — `server.js`

```javascript
// 职责：初始化各模块、启动服务
async function main() {
    const bot = await botService.initialize();   // 1. Telegram Bot
    setupCommands(bot);                          // 2. 注册命令
    setupCallbacks(bot);                         // 3. 注册按钮回调
    setupMessages(bot);                          // 4. 注册消息处理
    stService.start();                           // 5. WebSocket 服务器
    stService.onMessage(handleSTMessage);        // 6. ST 消息转发
    await botService.startPolling();             // 7. 开始轮询
}
```

### 2.2 Telegram 层 — `telegram/`

| 文件 | 核心职责 |
|------|----------|
| bot.js | Bot 初始化、setMyCommands、轮询管理、白名单、ST→TG 消息转发 |
| commands.js | bot.onText 路由 (/start /menu /regen /undo 等) |
| callbacks.js | bot.on('callback_query') 路由 (menu: / char: / generate: 等) |
| messages.js | bot.on('message') 非命令消息 → chat mode 转发 |

### 2.3 业务层 — `services/`

| 文件 | 核心职责 |
|------|----------|
| sillytavern.js | WebSocket Server (port 2333)、连接/断开管理、进程控制 |
| generation.js | 流式消息处理、消息编辑节流、会话生命周期管理 |
| character.js | 角色列表 / 切换角色 → WebSocket execute_command |
| chat.js | 新聊天 / 聊天列表 / 切换聊天 → WebSocket execute_command |
| memory.js | 记忆管理（接口预留） |

### 2.4 菜单层 — `menus/index.js`

定义 7 个菜单函数：

```
showMain()          → 一级菜单（8 个按钮）
showCharacterMenu() → 角色管理二级菜单
showCharacterList() → 角色列表页
showCharacterSwitch() → 切换角色页
showMemoryMenu()    → 记忆管理二级菜单
showWorldBookMenu() → 世界书二级菜单
showGenerateMenu()  → 生成控制二级菜单
showQuickMenu()     → 快捷回复二级菜单
showSettingsMenu()  → 设置二级菜单
```

### 2.5 状态层 — `state/session.js`

```javascript
Session = {
    userId,              // Telegram User ID
    mode,                // 'chat' | 'control'
    currentMenu,         // 当前菜单名
    currentCharacter,    // 当前角色名
    pendingAction,       // 待执行动作
    menuMessageId,       // 菜单消息 ID（用于 edit）
    createdAt,
    updatedAt,
}
```

### 2.6 基础设施 — `utils/`

| 文件 | 职责 |
|------|------|
| logger.js | 文件日志（telegram.log / st.log / error.log / debug.log）按日期轮转 |
| errors.js | 统一错误处理，生成用户友好消息 + 重试按钮 |

---

## 三、数据流

### 聊天消息流

```
用户输入 "你好"
    → Telegram Bot API
    → bot.on('message')
    → 检查白名单 → 忽略命令
    → session.setMode('chat')
    → stService.client.send({ type:'user_message', chatId, text })
    → ST 扩展接收 → ST API → LLM
    → ST 扩展返回 stream_chunk / stream_end
    → generationService.handleStreamChunk / handleStreamEnd
    → bot.editMessageText / bot.sendMessage
    → 用户看到回复
```

### 按钮操作流

```
用户点击 "🎭 角色管理"
    → bot.on('callback_query')
    → data = 'chars:menu'
    → routeCallback(bot, chatId, messageId, 'chars', 'menu', '')
    → menus.showCharacterMenu(bot, chatId, messageId)
    → bot.editMessageText(...) 更新同一消息
```

### 命令流

```
用户输入 /switch Seraphina
    → bot.onText(/^\/(.+)/)
    → command = 'switch', args = ['Seraphina']
    → characterService.switchCharacter 或 stService.executeCommand
```

---

## 四、WebSocket 协议

### Connector → ST 扩展

| type | 说明 |
|------|------|
| execute_command | 执行 slash 命令（listchars / switchchar / new 等） |
| user_message | 转发用户聊天消息 |
| system_command | 系统命令（reload_ui_only / stop_generation） |

### ST 扩展 → Connector

| type | 说明 | 处理模块 |
|------|------|----------|
| stream_chunk | 流式文本片段 | generation.js |
| stream_end | 流式结束 | generation.js |
| final_message_update | 最终文本更新 | generation.js |
| ai_reply | 非流式完整回复 | generation.js |
| typing_action | 输入中状态 | generation.js |
| error_message | 错误消息 | generation.js |
| command_executed | 命令执行结果 | generation.js |

---

## 五、菜单 Callback 协议

格式：`module:action:param`

```
menu:main              → 显示一级菜单
menu:back              → 返回上一级

char:list              → 查看角色列表
char:switch            → 进入角色选择
char:switch:{name}     → 切换到指定角色

generate:retry         → 重新生成
generate:undo          → 撤销回复
generate:stop          → 停止生成

quick:action:{text}    → 发送快捷回复

memory:view            → 查看记忆
memory:summary         → 生成摘要

status:show            → 查看状态
help:show              → 显示帮助
```

---

## 六、配置说明

```javascript
// config/config.js
{
    telegramToken: 'xxx',         // @BotFather 获取（勿泄露）
    wssPort: 2333,                // WebSocket 端口（须和 ST 扩展配置一致）
    allowedUserIds: [],           // 用户白名单（空=允许所有人）
}
```

---

## 七、依赖项

```
node-telegram-bot-api  ^0.64.0   ← Telegram Bot API
ws                     ^8.14.2   ← WebSocket 服务器
```

无数据库、无外部服务依赖。

---

## 八、部署架构

```
┌──────────────────────┐
│     Windows 主机     │
│                      │
│  PM2 (进程管理)      │
│    └─ tg-connector   │  ← 端口 2333
│                      │
│  SillyTavern         │  ← 端口 8000
│    └─ ST 扩展 (WebSocket 客户端)
│                      │
│  开机自启动          │
│    └─ start_all.bat  │
└──────────────────────┘
```

