// services/memory.js
// 记忆管理服务（预留接口，V1 暂不实现完整功能）

const logger = require('../utils/logger');
const stService = require('./sillytavern');

class MemoryService {
    async summarize(chatId) {
        if (!stService.isConnected()) throw new Error('SillyTavern 未连接');
        logger.info('memory', `记忆总结请求: ChatID ${chatId}`);
        // 预留：后续实现记忆总结
        throw new Error('记忆总结功能将在后续版本实现');
    }

    async getSummary(chatId) {
        if (!stService.isConnected()) throw new Error('SillyTavern 未连接');
        logger.info('memory', `查看记忆摘要: ChatID ${chatId}`);
        throw new Error('记忆查看功能将在后续版本实现');
    }

    async clearContext(chatId) {
        if (!stService.isConnected()) throw new Error('SillyTavern 未连接');
        logger.info('memory', `清理上下文: ChatID ${chatId}`);
        throw new Error('上下文清理功能将在后续版本实现');
    }

    async refreshMemory(chatId) {
        if (!stService.isConnected()) throw new Error('SillyTavern 未连接');
        logger.info('memory', `刷新记忆: ChatID ${chatId}`);
        throw new Error('记忆刷新功能将在后续版本实现');
    }
}

module.exports = new MemoryService();
