// menus/index.js
// 菜单入口和工具函数

const sessionStore = require('../state/session');

// ===== 工具函数 =====

function buildMenuRow(...buttons) {
    return buttons;
}

function buildMainKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🎭 角色管理', callback_data: 'chars:menu' },
             { text: '🧠 记忆管理', callback_data: 'memory:menu' }],
            [{ text: '📚 世界书', callback_data: 'worldbook:menu' },
             { text: '⚡ 快捷回复', callback_data: 'quick:menu' }],
            [{ text: '🔄 生成控制', callback_data: 'generate:menu' }],
            [{ text: '📝 聊天管理', callback_data: 'chat:new' },
             { text: '⚙ 设置', callback_data: 'settings:menu' }],
            [{ text: '📊 状态', callback_data: 'status:show' },
             { text: '❓ 帮助', callback_data: 'help:show' }],
        ],
    };
}

function buildBackButton(backTarget = 'menu:main') {
    return [{ text: '⬅ 返回', callback_data: backTarget }];
}

// ===== 菜单显示函数 =====

async function showMain(bot, chatId, messageId) {
    const text = [
        '🌙 Snow AI',
        '欢迎回来，请选择操作：',
        '',
        '💡 直接输入文字即可开始聊天',
    ].join('\n');

    const keyboard = buildMainKeyboard();

    if (messageId) {
        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: keyboard,
        }).catch(() => {});
    } else {
        const sent = await bot.sendMessage(chatId, text, { reply_markup: keyboard }).catch(() => {});
        if (sent) {
            sessionStore.setMenuMessageId(chatId, sent.message_id);
        }
    }
}

async function showCharacterMenu(bot, chatId, messageId) {
    const session = sessionStore.get(chatId);
    const currentChar = session?.currentCharacter || '未知';
    const text = [
        '🎭 角色管理',
        '',
        `⭐ 当前角色: ${currentChar}`,
        '',
        '请选择操作:',
    ].join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: '📚 查看角色列表', callback_data: 'char:list' }],
            [{ text: '🔄 切换角色', callback_data: 'char:switch' }],
            [{ text: '⭐ 当前角色', callback_data: 'char:current' }],
            buildBackButton('menu:main'),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

async function showCharacterList(bot, chatId, messageId) {
    const text = [
        '📚 角色列表',
        '',
        '正在获取角色列表...',
    ].join('\n');

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [buildBackButton('chars:menu')],
        },
    }).catch(() => {});

    // 触发角色列表命令
    const stService = require('../services/sillytavern');
    if (stService.isConnected()) {
        stService.executeCommand('listchars', null, chatId);
    }
}

async function showCharacterSwitch(bot, chatId, messageId) {
    const text = [
        '🔄 切换角色',
        '',
        '请选择角色:',
        '',
        '正在获取角色列表...',
    ].join('\n');

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [buildBackButton('chars:menu')],
        },
    }).catch(() => {});

    // 触发角色列表命令
    const stService = require('../services/sillytavern');
    if (stService.isConnected()) {
        stService.executeCommand('listchars', null, chatId);
    }
}

async function showMemoryMenu(bot, chatId, messageId) {
    const text = [
        '🧠 记忆管理',
        '',
        '请选择操作:',
    ].join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: '📌 查看记忆', callback_data: 'memory:view' },
             { text: '📝 生成摘要', callback_data: 'memory:summary' }],
            [{ text: '🧹 清理上下文', callback_data: 'memory:clear' },
             { text: '🔄 刷新记忆', callback_data: 'memory:refresh' }],
            buildBackButton('menu:main'),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

async function showWorldBookMenu(bot, chatId, messageId) {
    const text = [
        '📚 世界书',
        '',
        '请选择操作:',
    ].join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: '📖 查看', callback_data: 'worldbook:view' },
             { text: '✅ 启用', callback_data: 'worldbook:enable' },
             { text: '❌ 关闭', callback_data: 'worldbook:disable' }],
            buildBackButton('menu:main'),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

async function showGenerateMenu(bot, chatId, messageId) {
    const text = [
        '🔄 生成控制',
        '',
        '请选择操作:',
    ].join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: '🔁 重新生成', callback_data: 'generate:retry' },
             { text: '↩ 撤销回复', callback_data: 'generate:undo' }],
            [{ text: '⏹ 停止生成', callback_data: 'generate:stop' }],
            buildBackButton('menu:main'),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

async function showQuickMenu(bot, chatId, messageId) {
    const text = [
        '⚡ 快捷回复',
        '',
        '选择要发送的快捷回复:',
    ].join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: '▶ 继续剧情', callback_data: 'quick:action:继续剧情' }],
            [{ text: '📝 总结一下', callback_data: 'quick:action:请总结一下当前的剧情' }],
            [{ text: '🎭 改变语气', callback_data: 'quick:action:请换一种语气说话' }],
            [{ text: '📖 更详细描述', callback_data: 'quick:action:请更详细地描述' }],
            [{ text: '⏭ 跳过当前情节', callback_data: 'quick:action:跳过当前情节，进入下一段' }],
            buildBackButton('menu:main'),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

async function showSettingsMenu(bot, chatId, messageId) {
    const text = [
        '⚙ 设置',
        '',
        '请选择操作:',
    ].join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: '🤖 当前模型', callback_data: 'settings:model' }],
            [{ text: '📏 上下文状态', callback_data: 'settings:context' }],
            [{ text: '🔔 通知设置', callback_data: 'settings:notify' }],
            buildBackButton('menu:main'),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

module.exports = {
    showMain,
    showCharacterMenu,
    showCharacterList,
    showCharacterSwitch,
    showMemoryMenu,
    showWorldBookMenu,
    showGenerateMenu,
    showQuickMenu,
    showSettingsMenu,
};
