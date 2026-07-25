// services/error.js
// 核心错误服务
// 负责：错误编号、报告生成、管理员通知、AI 排查建议

const logger = require('../utils/logger');
const sanitizer = require('../utils/sanitizer');
const reporter = require('../utils/reporter');
const stService = require('./sillytavern');
const constants = require('../config/constants');

class ErrorService {
    constructor() {
        this._counter = 1000;
        this._bot = null;
    }

    /**
     * 注入 bot 实例（由 server.js 启动时调用）
     */
    setBot(bot) {
        this._bot = bot;
    }

    /**
     * 生成唯一错误编号
     * 格式：ST-YYYYMMDD-xxxx
     */
    _generateId() {
        const now = new Date();
        const dateStr = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
        ].join('');
        return `ST-${dateStr}-${this._counter++}`;
    }

    /**
     * 生成 AI 排查建议
     */
    _generateSuggestion(module, action, message) {
        const msg = (message || '').toLowerCase();

        if (msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('connect')) {
            return '🔌 连接失败：检查 SillyTavern 是否运行、端口是否正确、WebSocket 连接是否正常';
        }
        if (msg.includes('timeout')) {
            return '⏰ 操作超时：SillyTavern 响应过慢，检查模型加载状态或增大超时时间';
        }
        if (msg.includes('etelegram')) {
            return '📡 Telegram API 错误：检查 Bot Token 是否有效、网络连接是否正常';
        }
        if (module === 'generation') {
            return '💬 生成异常：检查 SillyTavern 前端是否打开、模型 API 是否正常';
        }
        if (module === 'character') {
            return '🎭 角色操作异常：检查角色名称是否正确、角色数据是否完整';
        }
        if (module === 'chat') {
            return '💬 聊天操作异常：检查聊天名称是否存在、是否切换到了正确的角色';
        }
        if (module === 'server' && (action === 'uncaughtException' || action === 'unhandledRejection')) {
            return '🐛 未捕获异常：检查代码逻辑，查看报告中的 stack 定位具体位置';
        }
        return '🔍 未知错误：查看 logs/ 目录下的详细日志，或使用 /debug 命令获取系统状态';
    }

    /**
     * 创建错误报告
     * @param {Error|string} error - 错误对象或消息
     * @param {string} module - 来源模块
     * @param {string} action - 操作名
     * @param {object} context - 上下文（自动脱敏）
     * @param {string} traceId - 关联的 traceId（可选）
     * @returns {Promise<string>} errorId
     */
    async createReport(error, module, action, context = {}, traceId = null) {
        const errorId = this._generateId();
        const errMsg = error?.message || String(error);
        const errStack = error?.stack || '';

        logger.error('error', `[${errorId}] ${module}:${action} — ${errMsg}`);

        // 保存报告
        reporter.saveReport({
            errorId,
            traceId,
            timestamp: new Date().toISOString(),
            module,
            action,
            message: errMsg,
            stack: errStack,
            context,
            stStatus: {
                connected: stService.isConnected(),
                wsPort: stService.port,
                ongoingStreams: stService.ongoingStreams.size,
            },
            suggestion: this._generateSuggestion(module, action, errMsg),
        });

        // 管理员通知（同步，不阻塞）
        await this._notifyAdmin(errorId, module, action, errMsg);

        return errorId;
    }

    /**
     * 通知管理员（可配置关闭）
     */
    async _notifyAdmin(errorId, module, action, message) {
        const adminChatId = constants.adminChatId;
        if (!adminChatId || !this._bot) return;

        try {
            const lines = [
                `❗️ 错误报告 #${errorId}`,
                `📍 ${module}:${action}`,
                `📝 ${(message || '').substring(0, 150)}`,
                `🔍 /debug report ${errorId}`,
            ];
            await this._bot.sendMessage(adminChatId, lines.join('\n'));
            logger.debug('error', `管理员通知已发送: ${errorId}`);
        } catch (err) {
            // 通知失败不向上抛，避免递归
            logger.warn('error', `管理员通知失败: ${err.message}`);
        }
    }

    /**
     * 同步创建报告（用于非 async 上下文中）
     */
    createReportSync(error, module, action, context = {}) {
        // 异步执行但不 await
        this.createReport(error, module, action, context).catch(() => {});
    }
}

module.exports = new ErrorService();
