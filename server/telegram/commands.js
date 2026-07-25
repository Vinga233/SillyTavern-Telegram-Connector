// telegram/commands.js
// Slash 命令处理

const logger = require('../utils/logger');
const stService = require('../services/sillytavern');
const menus = require('../menus');
const sessionStore = require('../state/session');

module.exports = function setupCommands(bot) {
    bot.onText(/^\/(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const fullCommand = match[1].trim();
        const parts = fullCommand.split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // 系统命令
        if (['reload', 'restart', 'exit', 'ping'].includes(command)) {
            await handleSystemCommand(bot, command, chatId);
            return;
        }

        // 菜单命令
        if (command === 'start' || command === 'menu') {
            await menus.showMain(bot, chatId);
            return;
        }

        // 帮助
        if (command === 'help') {
            const helpText = [
                '🌙 Snow AI — 帮助',
                '',
                '📝 直接输入文字即可聊天',
                '',
                '原生命令:',
                '/menu — 打开控制面板',
                '/new — 新聊天',
                '/regen — 重新生成',
                '/undo — 撤销上一轮',
                '/role — 当前角色',
                '/switch — 切换角色',
                '/status — 查看状态',
                '/memory — 记忆管理',
                '/help — 帮助',
                '',
                '💡 完整功能请使用 /menu',
            ].join('\n');
            await bot.sendMessage(chatId, helpText).catch(err => {
                logger.error('telegram', '发送帮助失败:', err.message);
            });
            return;
        }

        // 检查 ST 连接
        if (!stService.isConnected() && command !== 'status') {
            await bot.sendMessage(chatId, '⚠️ SillyTavern 未连接，请先确保 SillyTavern 已启动并连接扩展。').catch(() => {});
            return;
        }

        bot.sendChatAction(chatId, 'typing').catch(() => {});

        switch (command) {
            // === 聊天管理 ===
            case 'new':
                stService.executeCommand('new', null, chatId);
                await bot.sendMessage(chatId, '📝 正在创建新聊天...').catch(() => {});
                break;

            case 'regen':
                stService.executeCommand('regenerate', [], chatId);
                await bot.sendMessage(chatId, '🔄 正在重新生成...').catch(() => {});
                break;

            case 'undo':
                stService.executeCommand('undo', [], chatId);
                await bot.sendMessage(chatId, '↩️ 正在撤销...').catch(() => {});
                break;

            // === 角色管理 ===
            case 'role':
                const roleSession = sessionStore.get(chatId);
                const roleCharName = roleSession?.currentCharacter || '未知';
                await bot.sendMessage(chatId, `🎭 当前角色: ${roleCharName}\n使用 /switch 切换角色`).catch(() => {});
                break;

            case 'charinfo':
                const charInfoName = args.length > 0 ? args.join(' ') : (sessionStore.get(chatId)?.currentCharacter || '');
                if (!charInfoName) {
                    await bot.sendMessage(chatId, '请指定角色名，例如: /charinfo Seraphina').catch(() => {});
                    break;
                }
                if (!stService.isConnected()) {
                    await bot.sendMessage(chatId, '⚠️ SillyTavern 未连接').catch(() => {});
                    break;
                }
                try {
                    await bot.sendMessage(chatId, `🔍 正在查询: ${charInfoName}...`).catch(() => {});
                    const charService = require('../services/character');
                    const charData = await charService.getCharacterInfo(chatId, charInfoName);
                    const infoText = [
                        `🎭 ${charData.name}`,
                        '',
                        charData.description ? `📝 描述\n${charData.description}` : null,
                        charData.personality ? `🎭 性格\n${charData.personality}` : null,
                        charData.scenario ? `🌍 场景\n${charData.scenario}` : null,
                        charData.first_mes ? `💬 开场白\n${charData.first_mes}` : null,
                    ].filter(Boolean).join('\n\n');
                    await bot.sendMessage(chatId, infoText).catch(() => {});
                } catch (err) {
                    await bot.sendMessage(chatId, `⚠️ 获取角色信息失败: ${err.message}`).catch(() => {});
                }
                break;

            case 'switch':
                if (args.length > 0) {
                    stService.executeCommand('switchchar', args, chatId);
                    sessionStore.setCurrentCharacter(chatId, args.join(' '));
                    await bot.sendMessage(chatId, `🔄 正在切换到: ${args.join(' ')}`).catch(() => {});
                } else {
                    await bot.sendMessage(chatId, '请指定角色名，例如: /switch Seraphina\n使用 /listchars 查看可用角色').catch(() => {});
                }
                break;

            // === 状态 ===
            case 'status':
                const stConnected = stService.isConnected();
                const s = sessionStore.get(chatId);
                const statusText = [
                    '📊 Snow AI 状态',
                    '',
                    `🤖 SillyTavern: ${stConnected ? '✅ 已连接' : '❌ 未连接'}`,
                    `🎭 角色: ${s?.currentCharacter || '未知'}`,
                    `💬 模式: ${s?.mode === 'chat' ? '聊天' : '控制面板'}`,
                ].join('\n');
                await bot.sendMessage(chatId, statusText).catch(() => {});
                break;

            // === 记忆管理 ===
            case 'memory':
                const mText = [
                    '🧠 记忆管理',
                    '',
                    '功能开发中，敬请期待...',
                    '',
                    '使用 /menu 打开完整控制面板',
                ].join('\n');
                await bot.sendMessage(chatId, mText).catch(() => {});
                break;

            // === 原生命令（复用 service） ===
            case 'listchars':
            case 'listchats':
                stService.executeCommand(command, null, chatId);
                break;

            case 'switchchar':
                if (args.length === 0) {
                    await bot.sendMessage(chatId, '请指定角色名称，用法: /switchchar <名称>').catch(() => {});
                } else {
                    stService.executeCommand('switchchar', args, chatId);
                }
                break;

            case 'switchchat':
                if (args.length === 0) {
                    await bot.sendMessage(chatId, '请指定聊天名称，用法: /switchchat <名称>').catch(() => {});
                } else {
                    stService.executeCommand('switchchat', args, chatId);
                }
                break;

            default:
                // switchchar_N / switchchat_N 格式
                const charMatch = command.match(/^switchchar_(\d+)$/);
                if (charMatch) {
                    stService.executeCommand(command, null, chatId);
                    break;
                }
                const chatMatch = command.match(/^switchchat_(\d+)$/);
                if (chatMatch) {
                    stService.executeCommand(command, null, chatId);
                    break;
                }
                await bot.sendMessage(chatId, `未知命令: /${command}，使用 /help 查看所有命令`).catch(() => {});
        }
    });
};

async function handleSystemCommand(bot, command, chatId) {
    if (command === 'ping') {
        const bridgeStatus = '✅ Telegram Bot 运行中';
        const stStatus = stService.isConnected()
            ? '✅ SillyTavern 已连接'
            : '❌ SillyTavern 未连接';
        await bot.sendMessage(chatId, `${bridgeStatus}\n${stStatus}`).catch(() => {});
        return;
    }

    if (!stService.isConnected()) {
        if (command === 'reload') {
            await bot.sendMessage(chatId, '正在重载...').catch(() => {});
            stService.reloadServer(chatId);
        } else if (command === 'restart') {
            await bot.sendMessage(chatId, '正在重启...').catch(() => {});
            stService.restartServer(chatId);
        } else if (command === 'exit') {
            await bot.sendMessage(chatId, '正在关闭...').catch(() => {});
            stService.exitServer();
        }
        return;
    }

    stService.client.commandToExecuteOnClose = { command, chatId };
    stService.send({ type: 'system_command', command: 'reload_ui_only', chatId });
}

