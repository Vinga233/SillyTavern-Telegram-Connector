// utils/errors.js
// 统一错误处理

const logger = require('./logger');

const ERROR_MESSAGES = {
    ST_DISCONNECTED: '⚠️ SillyTavern 连接已断开\n\n请确保：\n• SillyTavern 已启动\n• Telegram 扩展已连接 (Extensions → Telegram Connector → 连接)',
    ST_NOT_READY: '⏳ SillyTavern 正在准备中，请稍后再试',
    TELEGRAM_API: '⚠️ Telegram 通信失败，请稍后重试',
    COMMAND_FAILED: '❌ 命令执行失败',
    UNKNOWN: '⚠️ 发生未知错误',
    STREAM_TIMEOUT: '⏰ 回复生成超时，请重试',
};

function handleError(chatId, error, context) {
    const ctx = context || 'unknown';
    logger.error('error', `[${ctx}] ${error?.message || error}`);

    if (!chatId) return;

    let message;
    if (error?.message?.includes('ETELEGRAM')) {
        message = ERROR_MESSAGES.TELEGRAM_API;
    } else if (error?.message?.includes('WebSocket') || error?.message?.includes('ws')) {
        message = ERROR_MESSAGES.ST_DISCONNECTED;
    } else if (error?.message?.includes('timeout') || error?.message?.includes('TIMEOUT')) {
        message = ERROR_MESSAGES.STREAM_TIMEOUT;
    } else {
        message = `${ERROR_MESSAGES.COMMAND_FAILED}\n\`${error?.message || error}\``;
    }

    return message;
}

function buildErrorKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🔄 重试', callback_data: 'menu:main' }],
        ],
    };
}

module.exports = { handleError, buildErrorKeyboard, ERROR_MESSAGES };
