// telegram/callbacks.js
// Callback Query 路由分发

const logger = require('../utils/logger');
const sessionStore = require('../state/session');
const menus = require('../menus');
const stService = require('../services/sillytavern');
const characterService = require('../services/character');
const chatService = require('../services/chat');
const memoryService = require('../services/memory');
const { handleError, buildErrorKeyboard } = require('../utils/errors');

module.exports = function setupCallbacks(bot) {
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const userId = query.from.id;
        const data = query.data;

        // 应答 callback（去除加载状态）
        await bot.answerCallbackQuery(query.id).catch(() => {});

        // 获取或创建 session
        const session = sessionStore.getOrCreate(chatId, userId);
        sessionStore.setMode(chatId, 'control');
        sessionStore.setMenuMessageId(chatId, messageId);

        // 解析 callback data: module:action:param
        const parts = data.split(':');
        const module = parts[0];
        const action = parts[1];
        const param = parts.slice(2).join(':');

        logger.info('callback', `ChatID=${chatId} Data=${data}`);

        try {
            await routeCallback(bot, chatId, messageId, module, action, param);
        } catch (error) {
            logger.error('callback', `处理 callback 失败:`, error);
            const errorMsg = handleError(chatId, error, 'callback');
            await bot.editMessageText(errorMsg || '⚠️ 操作失败，请重试', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: buildErrorKeyboard(),
            }).catch(() => {});
        }
    });
};

async function routeCallback(bot, chatId, messageId, module, action, param) {
    const session = sessionStore.get(chatId);

    switch (module) {
        // ===== 菜单导航 =====
        case 'menu':
            if (action === 'main') {
                sessionStore.setMenu(chatId, null);
                await menus.showMain(bot, chatId, messageId);
            } else if (action === 'back') {
                // 返回上一级菜单
                const currentMenu = session.currentMenu;
                if (currentMenu === 'character' || currentMenu === 'memory' || currentMenu === 'generate' ||
                    currentMenu === 'worldbook' || currentMenu === 'quick' || currentMenu === 'settings') {
                    sessionStore.setMenu(chatId, null);
                    await menus.showMain(bot, chatId, messageId);
                } else {
                    await menus.showMain(bot, chatId, messageId);
                }
            }
            break;

        // ===== 角色管理 =====
        case 'char':
            if (action === 'list') {
                await menus.showCharacterList(bot, chatId, messageId);
            } else if (action === 'switch') {
                await menus.showCharacterSwitch(bot, chatId, messageId);
            } else if (action === 'current') {
                // 显示当前角色（通过 menu 显示）
                await menus.showCharacterMenu(bot, chatId, messageId);
            } else if (action === 'greetings') {
                const greetCharName = param || session?.currentCharacter;
                if (!greetCharName) {
                    await bot.editMessageText('⚠️ 未指定角色', {
                        chat_id: chatId, message_id: messageId,
                        reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'chars:menu' }]] },
                    }).catch(() => {});
                    break;
                }
                if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); break; }
                await bot.editMessageText(`🔍 正在获取开场白: ${greetCharName}...`, {
                    chat_id: chatId, message_id: messageId,
                }).catch(() => {});
                try {
                    const greetData = await characterService.getAlternateGreetings(chatId, greetCharName);
                    const rows = greetData.greetings.map((g, i) => [
                        { text: `${g.selected ? '✅ ' : ''}开场白 ${i + 1}`, callback_data: `char:greeting:${greetCharName}:${i}` },
                    ]);
                    rows.push([{ text: '⬅ 返回', callback_data: 'chars:menu' }]);
                    const greetText = [
                        `🎭 切换开场白 — ${greetCharName}`,
                        '',
                        ...greetData.greetings.map((g, i) =>
                            `${g.selected ? '✅' : '  '} ${i + 1}. ${g.preview}${g.preview.length >= 80 ? '...' : ''}`
                        ),
                    ].join('\n');
                    await bot.editMessageText(greetText, {
                        chat_id: chatId, message_id: messageId,
                        reply_markup: { inline_keyboard: rows },
                    }).catch(() => {});
                } catch (err) {
                    await bot.editMessageText(`⚠️ 获取开场白失败\n\n${err.message}`, {
                        chat_id: chatId, message_id: messageId,
                        reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'chars:menu' }]] },
                    }).catch(() => {});
                }
            } else if (action === 'greeting') {
                // 格式: char:greeting:角色名:序号
                const [greetName, greetIdStr] = [param?.split(':')[0], param?.split(':')[1]];
                if (!greetName || !greetIdStr) { break; }
                if (stService.isConnected()) {
                    stService.executeCommand('select_greeting', [greetName, greetIdStr], chatId);
                    await bot.editMessageText(`🔄 已选择开场白 #${parseInt(greetIdStr) + 1}，正在创建新聊天...`, {
                        chat_id: chatId, message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            } else if (action.startsWith('switch:')) {
                const charName = param;
                if (stService.isConnected()) {
                    await bot.editMessageText(`🔄 正在切换到角色: ${charName}...`, {
                        chat_id: chatId,
                        message_id: messageId,
                    }).catch(() => {});
                    sessionStore.setCurrentCharacter(chatId, charName);
                    stService.executeCommand('switchchar', [charName], chatId);
                    // 短暂延迟后返回角色菜单
                    setTimeout(async () => {
                        await menus.showCharacterMenu(bot, chatId, messageId);
                    }, 1500);
                } else {
                    await bot.editMessageText('⚠️ SillyTavern 未连接', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: buildErrorKeyboard(),
                    }).catch(() => {});
                }
            }
            break;

        // ===== 角色管理子菜单 =====
        case 'chars':
            if (action === 'menu') {
                sessionStore.setMenu(chatId, 'character');
                await menus.showCharacterMenu(bot, chatId, messageId);
            }
            break;

        // ===== 记忆管理 =====
        case 'memory':
            if (action === 'menu') {
                sessionStore.setMenu(chatId, 'memory');
                await menus.showMemoryMenu(bot, chatId, messageId);
            } else if (action === 'view') {
                await bot.editMessageText('📌 查看记忆\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'memory:menu' }]] },
                }).catch(() => {});
            } else if (action === 'summary') {
                await bot.editMessageText('📝 正在生成摘要...\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'memory:menu' }]] },
                }).catch(() => {});
            } else if (action === 'clear') {
                await bot.editMessageText('🧹 清理上下文\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'memory:menu' }]] },
                }).catch(() => {});
            } else if (action === 'refresh') {
                await bot.editMessageText('🔄 刷新记忆\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'memory:menu' }]] },
                }).catch(() => {});
            }
            break;

        // ===== 世界书 =====
        case 'worldbook':
            if (action === 'menu') {
                sessionStore.setMenu(chatId, 'worldbook');
                await menus.showWorldBookMenu(bot, chatId, messageId);
            } else if (action === 'view') {
                await bot.editMessageText('📖 世界书\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'worldbook:menu' }]] },
                }).catch(() => {});
            } else if (action === 'enable') {
                await bot.editMessageText('✅ 启用世界书\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'worldbook:menu' }]] },
                }).catch(() => {});
            } else if (action === 'disable') {
                await bot.editMessageText('❌ 关闭世界书\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'worldbook:menu' }]] },
                }).catch(() => {});
            }
            break;

        // ===== 生成控制 =====
        case 'generate':
            if (action === 'menu') {
                sessionStore.setMenu(chatId, 'generate');
                await menus.showGenerateMenu(bot, chatId, messageId);
            } else if (action === 'retry') {
                if (stService.isConnected()) {
                    stService.executeCommand('regenerate', [], chatId);
                    await bot.editMessageText('🔄 正在重新生成...', {
                        chat_id: chatId,
                        message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            } else if (action === 'undo') {
                if (stService.isConnected()) {
                    stService.executeCommand('undo', [], chatId);
                    await bot.editMessageText('↩️ 已撤销上一条回复', {
                        chat_id: chatId,
                        message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            } else if (action === 'stop') {
                if (stService.isConnected()) {
                    stService.send({ type: 'system_command', command: 'stop_generation' });
                    await bot.editMessageText('⏹ 已停止生成', {
                        chat_id: chatId,
                        message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            }
            break;

        // ===== 聊天管理 =====
        case 'chat':
            if (action === 'new') {
                if (stService.isConnected()) {
                    stService.executeCommand('new', null, chatId);
                    await bot.editMessageText('📝 正在创建新聊天...', {
                        chat_id: chatId,
                        message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            } else if (action === 'history') {
                if (!stService.isConnected()) {
                    await showDisconnectedError(bot, chatId, messageId);
                    break;
                }
                await bot.editMessageText('📖 正在获取聊天上下文...', {
                    chat_id: chatId,
                    message_id: messageId,
                }).catch(() => {});
                try {
                    const chatHistory = await chatService.requestChatHistory(chatId, 5);
                    sessionStore.setCurrentCharacter(chatId, chatHistory.characterName);
                    sessionStore.setCurrentChatName(chatId, chatHistory.chatName);
                    const lines = [
                        '📖 当前聊天',
                        `🎭 ${chatHistory.characterName} | 💬 ${chatHistory.chatName}`,
                        '',
                        '━━━━━━━━━━━━━━━━━━━━',
                        ...chatHistory.messages.map(m => {
                            const prefix = m.role === 'user' ? '你' : chatHistory.characterName;
                            const text = m.text.length > 60 ? m.text.substring(0, 60) + '...' : m.text;
                            return `${prefix}：${text}`;
                        }),
                        '━━━━━━━━━━━━━━━━━━━━',
                        '',
                        `📊 共 ${chatHistory.messages.length} 条最近消息`,
                    ].join('\n');
                    await bot.editMessageText(lines, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔄 刷新', callback_data: 'chat:history' }],
                                [{ text: '📝 新聊天', callback_data: 'chat:new' }],
                                [{ text: '⬅ 返回', callback_data: 'menu:main' }],
                            ],
                        },
                    }).catch(() => {});
                } catch (err) {
                    logger.error('callback', `获取聊天历史失败: ${err.message}`);
                    await bot.editMessageText(`⚠️ 获取聊天历史失败\n\n${err.message}`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'menu:main' }]] },
                    }).catch(() => {});
                }
            }
            break;

        // ===== 快捷回复 =====
        case 'quick':
            if (action === 'menu') {
                sessionStore.setMenu(chatId, 'quick');
                await menus.showQuickMenu(bot, chatId, messageId);
            } else if (action === 'action') {
                if (stService.isConnected() && param) {
                    stService.client.send(JSON.stringify({
                        type: 'user_message',
                        chatId: chatId,
                        text: param,
                    }));
                    await bot.editMessageText(`⚡ 已发送快捷回复: ${param}`, {
                        chat_id: chatId,
                        message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            }
            break;

        // ===== 设置 =====
        case 'settings':
            if (action === 'menu') {
                sessionStore.setMenu(chatId, 'settings');
                await menus.showSettingsMenu(bot, chatId, messageId);
            } else if (action === 'model') {
                await bot.editMessageText('🤖 当前模型\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'settings:menu' }]] },
                }).catch(() => {});
            } else if (action === 'context') {
                await bot.editMessageText('📏 上下文状态\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'settings:menu' }]] },
                }).catch(() => {});
            } else if (action === 'notify') {
                await bot.editMessageText('🔔 通知设置\n\n功能开发中，敬请期待...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅ 返回', callback_data: 'settings:menu' }]] },
                }).catch(() => {});
            }
            break;

        // ===== 状态 =====
        case 'status':
            if (action === 'show') {
                const stConnected = stService.isConnected();
                const statusText = [
                    '📊 Snow AI 状态',
                    '',
                    `🤖 SillyTavern: ${stConnected ? '✅ 已连接' : '❌ 未连接'}`,
                    `🎭 当前角色: ${session.currentCharacter || '未知'}`,
                    `💬 模式: ${session.mode === 'chat' ? '聊天' : '控制面板'}`,
                ].join('\n');
                await bot.editMessageText(statusText, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 刷新', callback_data: 'status:show' }],
                            [{ text: '⬅ 返回', callback_data: 'menu:main' }],
                        ],
                    },
                }).catch(() => {});
            }
            break;

        // ===== 帮助 =====
        case 'help':
            if (action === 'show') {
                const helpText = [
                    '❓ 帮助',
                    '',
                    '📝 直接输入文字即可开始聊天',
                    '',
                    '📋 可用命令:',
                    '/menu — 打开控制面板',
                    '/new — 新聊天',
                    '/listchars — 角色列表',
                    '/switchchar <名称> — 切换角色',
                    '/listchats — 聊天记录',
                    '/ping — 连接状态',
                    '',
                    '💡 提示: 文字输入 = 聊天模式',
                    '按钮操作 = 控制面板',
                ].join('\n');
                await bot.editMessageText(helpText, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⬅ 返回', callback_data: 'menu:main' }],
                        ],
                    },
                }).catch(() => {});
            }
            break;

        default:
            logger.warn('callback', `未知模块: ${module}`);
    }
}

async function showDisconnectedError(bot, chatId, messageId) {
    await bot.editMessageText('⚠️ SillyTavern 连接已断开\n\n请确保 SillyTavern 已启动并连接扩展。', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 重试', callback_data: 'menu:main' }],
            ],
        },
    }).catch(() => {});
}



