// services/generation.js
// 流式消息处理 — 管理 SillyTavern → Telegram 的流式回复

const logger = require('../utils/logger');
const stService = require('./sillytavern');

class GenerationService {
    constructor() {
        this.bot = null;
    }

    setBot(bot) {
        this.bot = bot;
    }

    async handleStreamChunk(data) {
        let session = stService.ongoingStreams.get(data.chatId);

        if (!session) {
            let resolveMessagePromise;
            const messagePromise = new Promise((resolve) => {
                resolveMessagePromise = resolve;
            });

            session = {
                messagePromise,
                resolveMessagePromise,
                lastText: data.text,
                timer: null,
                isEditing: false,
            };
            stService.ongoingStreams.set(data.chatId, session);

            // 发送初始消息
            try {
                const sentMessage = await this.bot.sendMessage(data.chatId, '正在思考...');
                resolveMessagePromise(sentMessage.message_id);
            } catch (err) {
                logger.error('generation', '发送流式初始消息失败:', err.message);
                stService.ongoingStreams.delete(data.chatId);
            }
        } else {
            session.lastText = data.text;
        }

        // 节流编辑
        if (!session.timer) {
            session.timer = setTimeout(async () => {
                const currentSession = stService.ongoingStreams.get(data.chatId);
                if (currentSession) {
                    try {
                        const currentMessageId = await currentSession.messagePromise;
                        if (currentMessageId) {
                            await this.bot.editMessageText(currentSession.lastText, {
                                chat_id: data.chatId,
                                message_id: currentMessageId,
                            });
                        }
                    } catch (err) {
                        if (!err.message.includes('message is not modified')) {
                            logger.error('generation', '编辑流式消息失败:', err.message);
                        }
                    }
                    currentSession.timer = null;
                }
            }, 500);
        }
    }

    async handleStreamEnd(data) {
        const session = stService.ongoingStreams.get(data.chatId);
        if (session) {
            if (session.timer) {
                clearTimeout(session.timer);
                session.timer = null;
            }
            try {
                const messageId = await session.messagePromise;
                if (messageId && data.text) {
                    await this.bot.editMessageText(data.text, {
                        chat_id: data.chatId,
                        message_id: messageId,
                    });
                }
            } catch (err) {
                logger.error('generation', '流式结束编辑消息失败:', err.message);
            }
            stService.ongoingStreams.delete(data.chatId);
        } else {
            logger.warn('generation', `收到 stream_end 但无对应会话: ${data.chatId}`);
            if (data.text) {
                await this.bot.sendMessage(data.chatId, data.text).catch(err => {
                    logger.error('generation', '发送流式结束消息失败:', err.message);
                });
            }
        }
    }

    async handleFinalUpdate(data) {
        const session = stService.ongoingStreams.get(data.chatId);
        if (session) {
            if (session.timer) {
                clearTimeout(session.timer);
                session.timer = null;
            }
            try {
                const messageId = await session.messagePromise;
                if (messageId) {
                    await this.bot.editMessageText(data.text, {
                        chat_id: data.chatId,
                        message_id: messageId,
                    });
                    logger.info('generation', `ChatID ${data.chatId} 流式最终更新已发送`);
                }
            } catch (err) {
                logger.error('generation', '最终更新编辑失败:', err.message);
            }
            stService.ongoingStreams.delete(data.chatId);
        } else {
            // 非流式回复
            if (data.text) {
                await this.bot.sendMessage(data.chatId, data.text).catch(err => {
                    logger.error('generation', '发送非流式回复失败:', err.message);
                });
            }
        }
    }

    async handleAiReply(data) {
        // 清理可能的流式会话
        if (stService.ongoingStreams.has(data.chatId)) {
            logger.info('generation', `清理 ChatID ${data.chatId} 的流式会话（收到非流式回复）`);
            stService.ongoingStreams.delete(data.chatId);
        }
        if (data.text) {
            await this.bot.sendMessage(data.chatId, data.text).catch(err => {
                logger.error('generation', `发送非流式AI回复失败: ${err.message}`);
            });
        }
    }

    handleTypingAction(data) {
        if (data.chatId) {
            this.bot.sendChatAction(data.chatId, 'typing').catch(err => {
                logger.error('generation', '发送输入中状态失败:', err);
            });
        }
    }

    handleError(data) {
        if (data.chatId && data.text) {
            this.bot.sendMessage(data.chatId, data.text);
        }
    }

    async handleCommandExecuted(data) {
        logger.info('generation', `命令 ${data.command} 执行完成: ${data.success ? '成功' : '失败'}`);
        if (data.message) {
            logger.info('generation', `命令消息: ${data.message}`);
        }
        // 如果命令执行结果需要通知用户，发送消息
        if (data.notifyUser && data.chatId && data.message) {
            await this.bot.sendMessage(data.chatId, data.message).catch(err => {
                logger.error('generation', '发送命令执行通知失败:', err.message);
            });
        }
    }
}

// 单例
const generationService = new GenerationService();

module.exports = generationService;
