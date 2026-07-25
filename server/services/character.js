// services/character.js
// 角色管理服务

const stService = require("./sillytavern");

class CharacterService {
    async listCharacters(chatId) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        return stService.executeCommand("listchars", null, chatId);
    }

    async switchCharacter(chatId, nameOrIndex) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const args = typeof nameOrIndex === "string" ? [nameOrIndex] : [String(nameOrIndex)];
        return stService.executeCommand("switchchar", args, chatId);
    }

    async switchCharacterByIndex(chatId, index) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const command = "switchchar_" + index;
        return stService.executeCommand(command, null, chatId);
    }

    async getCurrentCharacter(chatId) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        return stService.executeCommand("listchars", null, chatId);
    }

    async getCharacterInfo(chatId, charName) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const res = await stService.request("character_info", { name: charName }, chatId);
        return res.data;
    }

    async getAlternateGreetings(chatId, charName) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const res = await stService.request("alternate_greetings", { name: charName }, chatId);
        return res.data;
    }

    async getCharacterCardRaw(chatId, charName) {
        if (!stService.isConnected()) {
            throw new Error("SillyTavern 未连接");
        }
        const res = await stService.request("character_card_raw", { name: charName }, chatId);
        return res.data;
    }

    async getNormalizedCharacterCard(chatId, charName) {
        const raw = await this.getCharacterCardRaw(chatId, charName);
        if (!raw || !raw.character) {
            throw new Error("未找到角色: " + charName);
        }
        const normalizer = require("../utils/characterNormalizer");
        return normalizer.normalize(raw.character);
    }
}

const { wrapService } = require("../utils/serviceWrapper");
module.exports = wrapService(new CharacterService(), "character");
