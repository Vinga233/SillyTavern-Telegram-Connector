// state/runtime.js
// 运行时状态管理 — 独立于 Session，管理生成生命周期
//
// 设计原则：
//   - runtime 跟踪"当前正在发生什么"
//   - session 跟踪"用户偏好是什么"
//   - 各自独立，互不耦合
//
// 生成状态机：
//   idle → generating → streaming → finalizing → completed
//                                                → failed
//
// 超时保护：
//   generating: 300s
//   streaming:  300s
//   finalizing:  30s
//   超时后自动标记为 failed，防止无限卡死

const logger = require("../utils/logger");

const STATUS = Object.freeze({
    IDLE: "idle",
    GENERATING: "generating",
    STREAMING: "streaming",
    FINALIZING: "finalizing",
    COMPLETED: "completed",
    FAILED: "failed",
});

const ACTIVE_TIMEOUTS = Object.freeze({
    GENERATING: 300 * 1000,  // 5 min
    STREAMING: 300 * 1000,   // 5 min
    FINALIZING: 30 * 1000,   // 30 sec
});

const ENTRY_MAX_AGE = 30 * 60 * 1000; // 30 min

class RuntimeStore {
    constructor() {
        this._entries = new Map();
        this._maxEntries = 100;
    }

    create(chatId, userId = null) {
        const entry = {
            chatId,
            userId,
            generation: {
                status: STATUS.IDLE,
                requestId: null,
                telegramMessageId: null,
                startTime: null,
                lastText: "",
                finalized: false,
            },
            traceId: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this._entries.set(chatId, entry);
        return entry;
    }

    get(chatId) {
        return this._entries.get(chatId) || null;
    }

    getOrCreate(chatId, userId = null) {
        let entry = this._entries.get(chatId);
        if (!entry) {
            entry = this.create(chatId, userId);
        }
        return entry;
    }

    _update(chatId, updates) {
        const entry = this._entries.get(chatId);
        if (!entry) return null;
        Object.assign(entry, updates, { updatedAt: Date.now() });
        return entry;
    }

    // ===== Generation 状态管理 =====

    startGeneration(chatId, userId = null) {
        const entry = this.getOrCreate(chatId, userId);
        entry.generation = {
            status: STATUS.GENERATING,
            requestId: null,
            telegramMessageId: null,
            startTime: Date.now(),
            lastText: "",
            finalized: false,
        };
        entry.updatedAt = Date.now();
        return entry;
    }

    startStreaming(chatId, telegramMessageId) {
        const entry = this._entries.get(chatId);
        if (!entry) return null;
        entry.generation.status = STATUS.STREAMING;
        entry.generation.telegramMessageId = telegramMessageId;
        entry.updatedAt = Date.now();
        return entry;
    }

    updateStream(chatId, text) {
        const entry = this._entries.get(chatId);
        if (!entry) return null;
        entry.generation.lastText = text;
        entry.updatedAt = Date.now();
        return entry;
    }

    startFinalizing(chatId) {
        const entry = this._entries.get(chatId);
        if (!entry) return null;
        entry.generation.status = STATUS.FINALIZING;
        entry.updatedAt = Date.now();
        return entry;
    }

    completeGeneration(chatId) {
        const entry = this._entries.get(chatId);
        if (!entry) return null;
        entry.generation.status = STATUS.COMPLETED;
        entry.generation.finalized = true;
        entry.updatedAt = Date.now();
        return entry;
    }

    failGeneration(chatId) {
        const entry = this._entries.get(chatId);
        if (!entry) return null;
        entry.generation.status = STATUS.FAILED;
        entry.updatedAt = Date.now();
        return entry;
    }

    // ===== 查询方法 =====

    getStatus(chatId) {
        const entry = this._entries.get(chatId);
        return entry ? entry.generation.status : STATUS.IDLE;
    }

    isGenerating(chatId) {
        const entry = this._entries.get(chatId);
        if (!entry) return false;
        const s = entry.generation.status;
        return s === STATUS.GENERATING || s === STATUS.STREAMING || s === STATUS.FINALIZING;
    }

    isFinalized(chatId) {
        const entry = this._entries.get(chatId);
        return entry ? entry.generation.finalized : false;
    }

    getGenerationStats(chatId) {
        const entry = this._entries.get(chatId);
        if (!entry || entry.generation.status === STATUS.IDLE) return null;
        const g = entry.generation;
        return {
            status: g.status,
            duration: g.startTime ? Date.now() - g.startTime : 0,
            textLength: g.lastText.length,
            hasTelegramMessage: g.telegramMessageId !== null,
            finalized: g.finalized,
        };
    }

    setTraceId(chatId, traceId) {
        return this._update(chatId, { traceId });
    }

    setRequestId(chatId, requestId) {
        const entry = this._entries.get(chatId);
        if (entry) {
            entry.generation.requestId = requestId;
        }
        return entry;
    }

    reset(chatId) {
        const entry = this._entries.get(chatId);
        if (entry) {
            entry.generation = {
                status: STATUS.IDLE,
                requestId: null,
                telegramMessageId: null,
                startTime: null,
                lastText: "",
                finalized: false,
            };
            entry.traceId = null;
            entry.updatedAt = Date.now();
        }
        return entry;
    }

    delete(chatId) {
        this._entries.delete(chatId);
    }

    getActiveGenerations() {
        const active = [];
        for (const [chatId, entry] of this._entries) {
            if (this.isGenerating(chatId)) {
                active.push({ chatId, status: entry.generation.status });
            }
        }
        return active;
    }

    /**
     * 获取所有条目（用于 debug 展示）
     */
    getAllEntries() {
        const entries = [];
        for (const [chatId, entry] of this._entries) {
            entries.push({
                chatId,
                status: entry.generation.status,
                requestId: entry.generation.requestId,
                traceId: entry.traceId,
                duration: entry.generation.startTime ? Date.now() - entry.generation.startTime : 0,
                finalized: entry.generation.finalized,
                telegramMessageId: entry.generation.telegramMessageId,
                textLength: entry.generation.lastText.length,
                updatedAt: entry.updatedAt,
            });
        }
        return entries;
    }

    // ===== 超时清理 =====

    /**
     * 清理卡死的生成（超时自动标记为 failed）
     * 在 generation 定时器中定期调用
     */
    cleanupExpired() {
        const now = Date.now();
        const timeouts = [];
        const toDelete = [];

        for (const [chatId, entry] of this._entries) {
            const g = entry.generation;
            const age = now - (g.startTime || entry.createdAt);

            switch (g.status) {
                case STATUS.GENERATING:
                    if (age > ACTIVE_TIMEOUTS.GENERATING) {
                        logger.warn("runtime", "Generation timeout (generating) chatId=" + chatId + " age=" + age + "ms traceId=" + (entry.traceId || "none"));
                        g.status = STATUS.FAILED;
                        timeouts.push({ chatId, status: "generating", age, traceId: entry.traceId, requestId: g.requestId });
                    }
                    break;
                case STATUS.STREAMING:
                    if (age > ACTIVE_TIMEOUTS.STREAMING) {
                        logger.warn("runtime", "Generation timeout (streaming) chatId=" + chatId + " age=" + age + "ms traceId=" + (entry.traceId || "none"));
                        g.status = STATUS.FAILED;
                        timeouts.push({ chatId, status: "streaming", age, traceId: entry.traceId, requestId: g.requestId });
                    }
                    break;
                case STATUS.FINALIZING:
                    if (age > ACTIVE_TIMEOUTS.FINALIZING) {
                        logger.warn("runtime", "Generation timeout (finalizing) chatId=" + chatId + " age=" + age + "ms traceId=" + (entry.traceId || "none"));
                        g.status = STATUS.FAILED;
                        timeouts.push({ chatId, status: "finalizing", age, traceId: entry.traceId, requestId: g.requestId });
                    }
                    break;
                case STATUS.FAILED:
                case STATUS.COMPLETED:
                    // 已完成/失败的条目超过 30 分钟后删除
                    if (now - entry.updatedAt > ENTRY_MAX_AGE) {
                        toDelete.push(chatId);
                    }
                    break;
                case STATUS.IDLE:
                    if (now - entry.updatedAt > ENTRY_MAX_AGE) {
                        toDelete.push(chatId);
                    }
                    break;
            }
        }

        for (const chatId of toDelete) {
            this._entries.delete(chatId);
        }

        return { timeouts, deleted: toDelete.length };
    }
}

const runtimeStore = new RuntimeStore();

// 每 30 秒检查一次卡死生成
setInterval(() => runtimeStore.cleanupExpired(), 30 * 1000);

module.exports = runtimeStore;
module.exports.STATUS = STATUS;
