// services/chat.js
// 聊天管理服务

const logger = require('../utils/logger');
const stService = require('./sillytavern');

class ChatService {
    async newChat(chatId) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        return stService.executeCommand('new', null, chatId);
    }

    async listChats(chatId) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        return stService.executeCommand('listchats', null, chatId);
    }

    async switchChat(chatId, name) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        return stService.executeCommand('switchchat', [name], chatId);
    }

    async sendMessage(chatId, text) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        const payload = JSON.stringify({ type: 'user_message', chatId, text });
        stService.client.send(payload);
        return true;
    }
}

module.exports = new ChatService();
