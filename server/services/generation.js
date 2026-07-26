// services/generation.js
// 流式消息处理 — 管理 SillyTavern → Telegram 的流式回复
//
// 流式消息生命周期（受 runtime.js 状态机约束）：
//   startGeneration → startStreaming → updateStream (×N)
//       → startFinalizing → completeGeneration (finalized=true)
//       → failGeneration
//
// 异常恢复：
//   - stream_end 后 30s 无 final_message_update → 发送 fallback 文本
//   - 重复 final_message_update → finalized 保护
//   - Telegram edit 失败 → 记录日志，不崩溃

const logger = require("../utils/logger");
const stService = require("./sillytavern");
const runtime = require("../state/runtime");

const FINAL_WAIT_TIMEOUT = 30 * 1000; // 30 sec

class GenerationService {
    constructor() {
        this.bot = null;
        this._streamTimers = new Map();
        this._finalWaitTimers = new Map(); // chatId → timer
    }

    setBot(bot) {
        this.bot = bot;
    }

    // ==================== stream_chunk ====================

    async handleStreamChunk(data) {
        console.log("[TG RECV] handleStreamChunk chatId=" + data.chatId + " text.length=" + (data.text ? data.text.length : 0));
        const chatId = data.chatId;

        // 如果上一轮已 finalized，重置运行时为新消息创建新 Telegram 消息
        if (runtime.isFinalized(chatId)) {
            console.log("[TG RUNTIME RESET] chatId=" + chatId + " oldMessageId=" + (runtime.get(chatId)?.generation?.telegramMessageId || "none") + " newGeneration=true");
            logger.info("generation", "[chatId=" + chatId + "] 检测到新消息流，重置 runtime");
            this._clearFinalWaitTimer(chatId);
            if (this._streamTimers.has(chatId)) {
                clearTimeout(this._streamTimers.get(chatId));
                this._streamTimers.delete(chatId);
            }
            runtime.reset(chatId);
        }

        let rtEntry = runtime.get(chatId);
        if (!rtEntry || rtEntry.generation.status === runtime.STATUS.IDLE) {
            runtime.startGeneration(chatId);
            try {
                console.log("[TG SEND START] initial chatId=" + chatId);
                const sentMessage = await this.bot.sendMessage(chatId, "正在思考...");
                console.log("[TG SEND SUCCESS] initial message_id=" + sentMessage.message_id + " chatId=" + chatId);
                runtime.startStreaming(chatId, sentMessage.message_id);
            } catch (err) {
                console.log("[TG SEND ERROR] initial chatId=" + chatId + " error=" + err.message);
                logger.error("generation", "[chatId=" + chatId + "] 发送初始消息失败: " + err.message);
                runtime.failGeneration(chatId);
                return;
            }
        }

        runtime.updateStream(chatId, data.text);

        if (!this._streamTimers.has(chatId)) {
            const timer = setTimeout(async () => {
                this._streamTimers.delete(chatId);
                const current = runtime.get(chatId);
                if (!current || current.generation.finalized) return;
                const msgId = current.generation.telegramMessageId;
                if (msgId) {
                    try {
                        await this.bot.editMessageText(current.generation.lastText, {
                            chat_id: chatId,
                            message_id: msgId,
                        });
                    } catch (err) {
                        if (!err.message.includes("message is not modified")) {
                            logger.error("generation", "[chatId=" + chatId + "] 编辑流式消息失败: " + err.message);
                        }
                    }
                }
            }, 500);
            this._streamTimers.set(chatId, timer);
        }
    }

    // ==================== stream_end ====================

    async handleStreamEnd(data) {
        console.log("[TG RECV] handleStreamEnd chatId=" + data.chatId);
        const chatId = data.chatId;
        const entry = runtime.get(chatId);

        if (!entry || entry.generation.status === runtime.STATUS.IDLE) {
            logger.warn("generation", "[chatId=" + chatId + "] 收到 stream_end 但无对应运行时");
            return;
        }

        if (entry.generation.finalized) {
            logger.debug("generation", "[chatId=" + chatId + "] 已 finalized，忽略 stream_end");
            return;
        }

        if (this._streamTimers.has(chatId)) {
            clearTimeout(this._streamTimers.get(chatId));
            this._streamTimers.delete(chatId);
        }

        runtime.startFinalizing(chatId);
        logger.info("generation", "[chatId=" + chatId + "] 流式结束，等待 final_message_update");

        // 设置恢复超时：30s 内无 final_message_update → 发送 fallback
        const tid = "recovery-" + chatId + "-" + Date.now();
        this._startFinalWaitTimer(chatId, entry);
    }

    _startFinalWaitTimer(chatId, entry) {
        if (this._finalWaitTimers.has(chatId)) {
            clearTimeout(this._finalWaitTimers.get(chatId));
        }

        const timer = setTimeout(async () => {
            this._finalWaitTimers.delete(chatId);
            const current = runtime.get(chatId);
            if (!current || current.generation.finalized || current.generation.status !== runtime.STATUS.FINALIZING) {
                return; // 已经完成或状态已变
            }

            logger.warn("generation", "[chatId=" + chatId + "] final_message_update 超时，发送 fallback");
            const traceId = current.traceId || "unknown";

            // 用已收到的文本作为 fallback（如果有）
            const fallbackText = current.generation.lastText && current.generation.lastText.trim()
                ? current.generation.lastText + "\n\n_（生成可能不完整）_"
                : "⚠️ 回复生成超时，请重试";

            try {
                const msgId = current.generation.telegramMessageId;
                if (msgId) {
                    await this.bot.editMessageText(fallbackText, {
                        chat_id: chatId,
                        message_id: msgId,
                    });
                } else {
                    await this.bot.sendMessage(chatId, fallbackText);
                }
            } catch (err) {
                logger.error("generation", "[chatId=" + chatId + "] fallback 发送失败: " + err.message);
            }

            runtime.failGeneration(chatId);
            logger.info("generation", "[chatId=" + chatId + "] traceId=" + traceId + " 生成已标记为 failed（超时恢复）");
        }, FINAL_WAIT_TIMEOUT);

        this._finalWaitTimers.set(chatId, timer);
    }

    _clearFinalWaitTimer(chatId) {
        if (this._finalWaitTimers.has(chatId)) {
            clearTimeout(this._finalWaitTimers.get(chatId));
            this._finalWaitTimers.delete(chatId);
        }
    }

    // ==================== final_message_update ====================

    async handleFinalUpdate(data) {
        const chatId = data.chatId;
        const entry = runtime.get(chatId);
        console.log("[TG RECV] handleFinalUpdate chatId=" + chatId + " text.length=" + (data.text ? data.text.length : 0) + " telegramMessageId=" + (entry && entry.generation ? entry.generation.telegramMessageId : "no-entry"));

        if (entry && entry.generation.finalized) {
            console.log("[TG FINAL GUARD] chatId=" + chatId + " finalized=" + entry.generation.finalized + " ignored=true");
            logger.debug("generation", "[chatId=" + chatId + "] 已 finalized，忽略 final_message_update");
            return;
        }
        // 清除恢复超时（final 已到达）
        this._clearFinalWaitTimer(chatId);

        if (this._streamTimers.has(chatId)) {
            clearTimeout(this._streamTimers.get(chatId));
            this._streamTimers.delete(chatId);
        }

        if (entry && entry.generation.telegramMessageId) {
            try {
                console.log("[TG SEND START] editMessageText final_update chatId=" + chatId);
                    await this.bot.editMessageText(data.text, {
                    chat_id: chatId,
                    message_id: entry.generation.telegramMessageId,
                });
                console.log("[TG SEND SUCCESS] editMessageText final_update chatId=" + chatId);
                    logger.info("generation", "[chatId=" + chatId + "] 流式最终更新已发送");
            } catch (err) {
                console.log("[TG SEND ERROR] editMessageText final_update chatId=" + chatId + " error=" + err.message);
                    logger.error("generation", "[chatId=" + chatId + "] 最终更新编辑失败: " + err.message);
                    // 回退到 sendMessage
                    console.log("[TG SEND START] editMessageText fallback to sendMessage chatId=" + chatId);
                    try {
                        const fallbackSent = await this.bot.sendMessage(chatId, data.text);
                        console.log("[TG SEND SUCCESS] editMessageText fallback message_id=" + fallbackSent.message_id + " chatId=" + chatId);
                        runtime.completeGeneration(chatId);
                    } catch (sendErr) {
                        console.log("[TG SEND ERROR] editMessageText fallback chatId=" + chatId + " error=" + sendErr.message);
                    }
            }
            runtime.completeGeneration(chatId);
        } else {
            if (data.text) {
                try {
                    console.log("[TG SEND START] final_update_fallback chatId=" + chatId);
                    const sent = await this.bot.sendMessage(chatId, data.text);
                    if (!entry) {
                        runtime.startGeneration(chatId);
                    }
                    runtime.startStreaming(chatId, sent.message_id);
                    runtime.updateStream(chatId, data.text);
                    runtime.completeGeneration(chatId);
                    console.log("[TG SEND SUCCESS] final_update_fallback message_id=" + sent.message_id + " chatId=" + chatId);
                    logger.info("generation", "[chatId=" + chatId + "] 非流式回复已发送");
                } catch (err) {
                    console.log("[TG SEND ERROR] final_update_fallback chatId=" + chatId + " error=" + err.message);
                    logger.error("generation", "[chatId=" + chatId + "] 发送非流式回复失败: " + err.message);
                }
            }
        }
    }

    // ==================== ai_reply ====================

    async handleAiReply(data) {
        console.log("[TG RECV] handleAiReply chatId=" + data.chatId + " text.length=" + (data.text ? data.text.length : 0));
        const chatId = data.chatId;

        this._clearFinalWaitTimer(chatId);

        const entry = runtime.get(chatId);
        if (entry && entry.generation.status !== runtime.STATUS.IDLE) {
            logger.info("generation", "[chatId=" + chatId + "] 清理运行时（收到非流式回复）");
            runtime.reset(chatId);
        }

        if (data.text) {
            try {
                console.log("[TG SEND START] ai_reply chatId=" + chatId);
                const sent = await this.bot.sendMessage(chatId, data.text);
                console.log("[TG SEND SUCCESS] ai_reply message_id=" + sent.message_id + " chatId=" + chatId);
                runtime.startGeneration(chatId);
                runtime.startStreaming(chatId, sent.message_id);
                runtime.updateStream(chatId, data.text);
                runtime.completeGeneration(chatId);
                logger.info("generation", "[chatId=" + chatId + "] ai_reply 已发送");
            } catch (err) {
                console.log("[TG SEND ERROR] ai_reply chatId=" + chatId + " error=" + err.message);
                logger.error("generation", "[chatId=" + chatId + "] 发送 ai_reply 失败: " + err.message);
            }
        }
    }

    // ==================== typing ====================

    handleTypingAction(data) {
        if (data.chatId) {
            this.bot.sendChatAction(data.chatId, "typing").catch(err => {
                logger.error("generation", "[chatId=" + data.chatId + "] 发送输入中状态失败: " + err);
            });
        }
    }

    // ==================== error_message ====================

    handleError(data) {
        if (data.chatId && data.text) {
            this._clearFinalWaitTimer(data.chatId);
            runtime.failGeneration(data.chatId);
            this.bot.sendMessage(data.chatId, data.text).catch(() => {});
        }
    }

    // ==================== command_executed ====================

    async handleCommandExecuted(data) {
        logger.info("generation", "命令 " + data.command + " 执行完成: " + (data.success ? "成功" : "失败"));
        if (data.message) {
            logger.info("generation", "命令消息: " + data.message);
        }
        if (data.notifyUser && data.chatId && data.message) {
            await this.bot.sendMessage(data.chatId, data.message).catch(err => {
                logger.error("generation", "[chatId=" + data.chatId + "] 发送命令执行通知失败: " + err.message);
            });
        }
    }

    forceCleanup(chatId) {
        this._clearFinalWaitTimer(chatId);
        if (this._streamTimers.has(chatId)) {
            clearTimeout(this._streamTimers.get(chatId));
            this._streamTimers.delete(chatId);
        }
        runtime.reset(chatId);
        logger.info("generation", "强制清理 ChatID " + chatId);
    }
}

const generationService = new GenerationService();
module.exports = generationService;
