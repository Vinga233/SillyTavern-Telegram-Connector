// server.js — 启动入口
// SillyTavern Telegram Connector V1.5

const stService = require('./services/sillytavern');
const botService = require('./telegram/bot');
const setupCommands = require('./telegram/commands');
const setupCallbacks = require('./telegram/callbacks');
const setupMessages = require('./telegram/messages');
const menus = require('./menus');
const logger = require('./utils/logger');

async function main() {
    // 1. 初始化 Telegram Bot
    const bot = await botService.initialize();

    // 2. 注册消息处理器
    setupCommands(bot);
    setupCallbacks(bot);
    setupMessages(bot);

    // 3. 启动 WebSocket 服务器（等待 ST 扩展连接）
    stService.start();

    // 4. ST 消息 → Telegram 转发
    stService.onMessage(async (data) => {
        await botService.handleSTMessage(data);
    });

    // 5. 连接状态变化通知
    stService.onConnectionChange((connected) => {
        logger.info('server', `SillyTavern 连接状态: ${connected ? '已连接' : '已断开'}`);
    });

    // 6. 启动 Telegram 轮询
    await botService.startPolling();

    // 7. 发送启动就绪通知
    logger.info('server', '🌙 Snow AI Telegram Connector 已启动');
    logger.info('server', `WebSocket 端口: ${stService.port}`);
    logger.info('server', '等待 SillyTavern 扩展连接...');

    // 8. 出错时保持进程存活（PM2 管理重启）
    process.on('uncaughtException', (error) => {
        logger.error('server', '未捕获异常:', error.message);
    });

    process.on('unhandledRejection', (error) => {
        logger.error('server', '未处理的 Promise 拒绝:', error.message);
    });
}

main().catch((error) => {
    logger.error('server', '启动失败:', error.message);
    process.exit(1);
});
