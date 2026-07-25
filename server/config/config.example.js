// config/config.example.js
// Telegram Bot 配置示例
// 使用方法：复制为 config.js 后修改

module.exports = {
    // Telegram Bot Token — 从 @BotFather 获取
    telegramToken: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',

    // WebSocket 服务器端口（需与 ST 扩展配置一致）
    wssPort: 2333,

    // 用户白名单（空数组 = 允许所有用户）
    // 可从 @userinfobot 获取你的 User ID
    allowedUserIds: [],

    // 管理员 Telegram User ID（可选）
    // 配置后，错误报告会自动通知到该用户
    // 从 @userinfobot 获取你的 User ID
    adminChatId: null,
};

