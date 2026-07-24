// telegram/messages.js
// 普通消息处理 — 聊天模式下的消息转发

const logger = require('../utils/logger');
const sessionStore = require('../state/session');
const stService = require('../services/sillytavern');

module.exports = function setupMessages(bot) {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        const userId = msg.from.id;

        // 忽略命令（由 commands.js 处理）
        if (!text || text.startsWith('/')) return;

        // 获取 session，自动切到聊天模式
        const session = sessionStore.getOrCreate(chatId, userId);
        sessionStore.setMode(chatId, 'chat');

        // 转发到 SillyTavern
        if (stService.isConnected()) {
            logger.info('telegram', `用户 ${chatId}: "${text}" (模式: chat)`);
            stService.client.send(JSON.stringify({
                type: 'user_message',
                chatId: chatId,
                text: text,
            }));
        } else {
            await bot.sendMessage(chatId, '⚠️ 我现在无法连接到 SillyTavern。请确保 SillyTavern 已启动并连接了 Telegram 扩展。').catch(() => {});
        }
    });
};
