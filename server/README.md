# Snow AI Telegram Bridge Server

SillyTavern Telegram Connector 的服务器端组件。

## 启动

```bash
cd server
npm install
cp config/config.example.js config/config.js
# 编辑 config/config.js 填入 Bot Token
node server.js
```

## PM2

```bash
pm2 start server.js --name "tg-connector"
pm2 save
```

## 文档

| 文件 | 用途 |
|------|------|
| `PROJECT_MEMORY.md` | AI 项目记忆档案 |
| `ARCHITECTURE.md` | 系统架构文档 |
| `CHANGELOG.md` | 变更日志 |

详见项目根目录 `README.md`
