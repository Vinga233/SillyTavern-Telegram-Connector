// services/chat.js
// 聊天管理服务

const stService = require("./sillytavern");

class ChatService {
    async newChat(chatId) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        return stService.executeCommand("new", null, chatId);
    }

    async listChats(chatId) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        return stService.executeCommand("listchats", null, chatId);
    }

    async switchChat(chatId, name) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        return stService.executeCommand("switchchat", [name], chatId);
    }

    async sendMessage(chatId, text) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const payload = JSON.stringify({ type: "user_message", chatId, text });
        stService.client.send(payload);
        return true;
    }

    async requestChatHistory(chatId, limit = 5) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const res = await stService.request("chat_history", { limit }, chatId);
        return res.data;
    }
}

const { wrapService } = require("../utils/serviceWrapper");
module.exports = wrapService(new ChatService(), "chat");
