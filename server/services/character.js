// services/character.js
// 角色管理服务

const logger = require('../utils/logger');
const stService = require('./sillytavern');

class CharacterService {
    async listCharacters(chatId) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        return stService.executeCommand('listchars', null, chatId);
    }

    async switchCharacter(chatId, nameOrIndex) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        const args = typeof nameOrIndex === 'string' ? [nameOrIndex] : [String(nameOrIndex)];
        return stService.executeCommand('switchchar', args, chatId);
    }

    async switchCharacterByIndex(chatId, index) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        const command = `switchchar_${index}`;
        return stService.executeCommand(command, null, chatId);
    }

    async getCurrentCharacter(chatId) {
        if (!stService.isConnected()) {
            throw new Error('SillyTavern 未连接');
        }
        // 通过发送 listchars 获取当前角色在前端处理
        return stService.executeCommand('listchars', null, chatId);
    }
}

module.exports = new CharacterService();
