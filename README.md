# Snow AI — SillyTavern Telegram Connector

将 SillyTavern 的 AI 角色聊天能力扩展到手机 Telegram，打造私人 AI 控制台。

```
手机 Telegram → Telegram Bot → Connector → SillyTavern → LLM 模型
```

---

## 功能

- **Telegram Inline Keyboard 控制面板** — 主菜单 + 子菜单，单消息编辑不刷屏
- **角色管理** — 查看角色列表、切换角色、显示当前角色
- **流式回复** — 逐词生成，实时编辑更新
- **重新生成 / 撤销回复** — `/regen` `/undo`
- **快捷回复** — 预设快捷消息一键发送
- **Chat / Control 模式** — 打字即聊天，按钮即控制，自动切换
- **原生 Telegram 命令菜单** — 输入 `/` 弹出 9 个快捷命令
- **世界书 / 记忆管理** — 菜单入口已预留（功能开发中）
- **开机自启动** — PM2 后台运行 + Windows Startup 支持
- **会话状态管理** — 独立用户 session，不丢失上下文
- **文件日志** — 按模块和日期归档，方便排查

---

## 快速开始

### 前提条件

- Node.js 18+
- 正在运行的 SillyTavern 实例（含 Telegram Connector 扩展）
- Telegram Bot Token（从 [@BotFather](https://t.me/BotFather) 获取）

### 安装

```bash
# 1. 克隆
git clone https://github.com/qiqi20020612/SillyTavern-Telegram-Connector.git
cd SillyTavern-Telegram-Connector

# 2. 进入服务器目录并安装依赖
cd server
npm install

# 3. 创建配置文件
cp config/config.example.js config/config.js
# Windows: copy config\config.example.js config\config.js

# 4. 编辑 config/config.js，填入你的 Bot Token
```

### 启动

```bash
cd server
node server.js
```

### Telegram 使用

1. 打开 Telegram，找到你的 Bot
2. 发送 `/start` 或 `/menu` 打开控制面板
3. 点击按钮管理角色、切换聊天、重新生成
4. 直接打字即可开始聊天

---

## Telegram 命令

| 命令 | 说明 |
|------|------|
| `/menu` | 打开控制面板 |
| `/new` | 新建聊天 |
| `/regen` | 重新生成 |
| `/undo` | 撤销上一轮 |
| `/role` | 查看当前角色 |
| `/switch <角色名>` | 切换角色 |
| `/status` | 查看状态 |
| `/memory` | 记忆管理 |
| `/help` | 帮助信息 |

输入 `/` 即可弹出原生命令菜单。

---

## 配置

```js
// server/config/config.js
{
    telegramToken: 'xxx',         // @BotFather 获取（必填）
    wssPort: 2333,                // WebSocket 端口（默认 2333）
    allowedUserIds: [],           // 用户白名单（空 = 允许所有人）
}
```

---

## PM2 进程管理

```bash
# 安装 PM2
npm install pm2 -g

# 启动
pm2 start server/server.js --name "tg-connector"

# 保存进程列表（重启后自动恢复）
pm2 save

# 查看日志
pm2 logs tg-connector

# 重启
pm2 restart tg-connector
```

### Windows 开机自启动

创建启动脚本 `start.bat`：
```batch
cd /d D:\path\to\SillyTavern-Telegram-Connector\server
pm2 resurrect
```

放入 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`

---

## 项目结构

```
server/
├── server.js                 # 启动入口
├── config/
│   ├── config.example.js     # 配置模板
│   └── constants.js          # 常量定义
├── telegram/
│   ├── bot.js                # Telegram Bot 初始化
│   ├── commands.js           # Slash 命令路由
│   ├── callbacks.js          # 按钮事件路由
│   └── messages.js           # 聊天消息处理
├── services/
│   ├── sillytavern.js        # WebSocket 服务器
│   ├── generation.js         # 流式回复处理
│   ├── character.js          # 角色管理
│   ├── chat.js               # 聊天管理
│   └── memory.js             # 记忆管理（预留）
├── menus/
│   └── index.js              # 所有菜单布局
├── state/
│   └── session.js            # 用户状态管理
├── utils/
│   ├── logger.js             # 日志系统
│   └── errors.js             # 错误处理
└── logs/                     # 运行时日志
```

---

## SillyTavern 扩展安装

本项目的 SillyTavern 扩展需安装在 SillyTavern 中：

1. 打开 SillyTavern Web 界面
2. 进入 **Extensions**（扩展）选项卡
3. 点击 **Install Extension**
4. 输入 URL: `https://github.com/qiqi20020612/SillyTavern-Telegram-Connector`
5. 重启 SillyTavern
6. 在 Extensions → Telegram Connector 中设置 WebSocket 为 `ws://127.0.0.1:2333`
7. 点击 **连接**

---

## 技术栈

| 组件 | 技术 |
|------|------|
| Telegram Bot | node-telegram-bot-api |
| WebSocket | ws |
| 进程管理 | PM2 |
| 运行时 | Node.js 18+ |
| 角色引擎 | SillyTavern |

---

## 许可证

本项目基于原项目 [SillyTavern-Telegram-Connector](https://github.com/qiqi20020612/SillyTavern-Telegram-Connector) 开发，遵循 GPL-3.0 许可证。
