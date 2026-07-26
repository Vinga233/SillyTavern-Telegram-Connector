// state/session.js
// 用户会话状态管理

const constants = require('../config/constants');
const dt = require('../utils/debugTrace');

class SessionStore {
    constructor() {
        // Map<chatId, Session>
        this._sessions = new Map();
    }

    create(chatId, userId) {
        const session = {
            userId: userId,
            mode: constants.MODE.CHAT,
            currentMenu: null,
            currentCharacter: null,
            currentChatName: null,
            pendingAction: null,
            menuMessageId: null,
            lastMessageId: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this._sessions.set(chatId, session);
        return session;
    }

    get(chatId) {
        return this._sessions.get(chatId) || null;
    }

    getOrCreate(chatId, userId) {
        let session = this._sessions.get(chatId);
        if (!session) {
            session = this.create(chatId, userId);
        }
        return session;
    }

    update(chatId, updates) {
        const session = this._sessions.get(chatId);
        if (!session) return null;
        Object.assign(session, updates, { updatedAt: Date.now() });
        return session;
    }

    setMode(chatId, mode) {
        dt.log('session', 'setMode', chatId, { mode });
        return this.update(chatId, { mode });
    }

    setMenu(chatId, menu) {
        dt.log('session', 'setMenu', chatId, { menu });
        return this.update(chatId, { currentMenu: menu });
    }

    setPendingAction(chatId, action) {
        return this.update(chatId, { pendingAction: action });
    }

    setMenuMessageId(chatId, messageId) {
        return this.update(chatId, { menuMessageId: messageId });
    }

    setCurrentCharacter(chatId, name) {
        const session = this._sessions.get(chatId);
        const oldVal = session?.currentCharacter || null;
        const ret = this.update(chatId, { currentCharacter: name });
        dt.log('session', 'setCurrentCharacter', chatId, { old: oldVal, new: name });
        return ret;
    }

    setCurrentChatName(chatId, name) {
        const session = this._sessions.get(chatId);
        const oldVal = session?.currentChatName || null;
        const ret = this.update(chatId, { currentChatName: name });
        dt.log('session', 'setCurrentChatName', chatId, { old: oldVal, new: name });
        return ret;
    }

    delete(chatId) {
        this._sessions.delete(chatId);
    }

    getAll() {
        return Array.from(this._sessions.entries());
    }
}

// 单例
const sessionStore = new SessionStore();

module.exports = sessionStore;


