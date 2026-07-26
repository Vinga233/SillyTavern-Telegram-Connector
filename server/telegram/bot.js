// telegram/bot.js
// Telegram Bot 初始化、轮询管理、白名单检查

const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const config = require('../config/config');
const constants = require('../config/constants');
const generationService = require('../services/generation');
const sessionStore = require("../state/session");
const stService = require('../services/sillytavern');

// Bot 原生命令菜单
const BOT_COMMANDS = [
    { command: 'menu', description: '打开主控制面板' },
    { command: 'new', description: '新建聊天' },
    { command: 'regen', description: '重新生成' },
    { command: 'undo', description: '撤销上一轮' },
    { command: 'role', description: '查看当前角色' },
    { command: 'switch', description: '切换角色' },
    { command: 'status', description: '查看状态' },
    { command: 'memory', description: '记忆管理' },
    { command: 'help', description: '帮助信息' },
];

class BotService {
    constructor() {
        this.bot = null;
        this.token = config.telegramToken;
    }

    async initialize() {
        if (!this.token || this.token === constants.TOKEN_PLACEHOLDER) {
            logger.error('telegram', '请在 config.js 中设置 Telegram Bot Token');
            process.exit(1);
        }

        this.bot = new TelegramBot(this.token, { polling: false });
        logger.info('telegram', '正在初始化 Telegram Bot...');

        // 注册原生命令菜单
        try {
            await this.bot.setMyCommands(BOT_COMMANDS);
            logger.info('telegram', `已注册 ${BOT_COMMANDS.length} 个原生命令`);
        } catch (err) {
            logger.warn('telegram', '注册原生命令失败（可忽略）:', err.message);
        }

        generationService.setBot(this.bot);
        return this.bot;
    }

    async startPolling() {
        try {
            if (process.env.TELEGRAM_CLEAR_UPDATES) {
                let lastUpdateId = 0;
                let updates;
                do {
                    updates = await this.bot.getUpdates({
                        offset: lastUpdateId,
                        limit: 100,
                        timeout: 0,
                    });
                    if (updates && updates.length > 0) {
                        lastUpdateId = updates[updates.length - 1].update_id + 1;
                        logger.info('telegram', `清理了 ${updates.length} 条消息`);
                    }
                } while (updates && updates.length > 0);
                delete process.env.TELEGRAM_CLEAR_UPDATES;
                logger.info('telegram', '消息队列清理完成');
            } else {
                const updates = await this.bot.getUpdates({ limit: 100, timeout: 0 });
                if (updates && updates.length > 0) {
                    const lastUpdateId = updates[updates.length - 1].update_id;
                    await this.bot.getUpdates({ offset: lastUpdateId + 1, limit: 1, timeout: 0 });
                    logger.info('telegram', `已清除 ${updates.length} 条待处理消息`);
                } else {
                    logger.info('telegram', '没有待处理消息需要清除');
                }
            }

            await this.bot.startPolling({ restart: true, clean: true });
            logger.info('telegram', 'Telegram Bot 轮询已启动');

            if (process.env.RESTART_NOTIFY_CHATID) {
                const chatId = parseInt(process.env.RESTART_NOTIFY_CHATID);
                if (!isNaN(chatId)) {
                    setTimeout(() => {
                        this.bot.sendMessage(chatId, '🔁 服务器已重启并准备就绪')
                            .catch(err => logger.error('telegram', '发送重启通知失败:', err))
                            .finally(() => delete process.env.RESTART_NOTIFY_CHATID);
                    }, 2000);
                }
            }
        } catch (error) {
            logger.error('telegram', '启动轮询出错:', error);
            await this.bot.startPolling({ restart: true, clean: true });
        }
    }

    checkWhitelist(userId, chatId, text) {
        if (config.allowedUserIds && config.allowedUserIds.length > 0) {
            if (!config.allowedUserIds.includes(userId)) {
                logger.info('telegram', `拒绝非白名单用户: UserID=${userId} ChatID=${chatId}`);
                this.bot.sendMessage(chatId, '抱歉，您无权使用此机器人。').catch(() => {});
                return false;
            }
        }
        return true;
    }

    async handleSTMessage(data) {
        console.log('[TG RECV] type=' + data.type + ' chatId=' + data.chatId + ' text.length=' + (data.text ? data.text.length : 0));
        try {
            if (data.type === 'stream_chunk' && data.chatId) {
                await generationService.handleStreamChunk(data);
            } else if (data.type === 'stream_end' && data.chatId) {
                await generationService.handleStreamEnd(data);
            } else if (data.type === 'final_message_update' && data.chatId) {
                await generationService.handleFinalUpdate(data);
            } else if (data.type === 'error_message' && data.chatId) {
                generationService.handleError(data);
            } else if (data.type === 'ai_reply' && data.chatId) {
                await generationService.handleAiReply(data);
            } else if (data.type === 'typing_action' && data.chatId) {
                generationService.handleTypingAction(data);
            } else if (data.type === 'chat_info' && data.data) {
                const chatId = data.chatId;  // 可能是 undefined (全局事件广播)
                const info = data.data;
                logger.info('chat_info', 'ChatID=' + (chatId || 'broadcast') + ' character=' + info.characterName + ' chat=' + info.chatName);
                if (chatId) {
                    if (info.chatName) {
                        sessionStore.setCurrentChatName(chatId, info.chatName);
                    }
                    if (info.characterName) {
                        sessionStore.setCurrentCharacter(chatId, info.characterName);
                    }

                }
            } else if (data.type === 'command_executed') {
                await generationService.handleCommandExecuted(data);
            }
        } catch (error) {
            logger.error('telegram', '处理 SillyTavern 消息出错:', error);
        }
    }
}

module.exports = new BotService();
