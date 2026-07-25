// telegram/commands.js
// Slash 命令处理

const logger = require('../utils/logger');
const dt = require('../utils/debugTrace');
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
                dt.log('commands', 'menu_command', chatId, { command });
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
        if (!stService.isConnected() && command !== 'status' && command !== 'debug') {
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
                    const normalizer = require('../utils/characterNormalizer');
                    const cardData = await charService.getNormalizedCharacterCard(chatId, charInfoName);
                    const infoText = normalizer.formatTelegramText(cardData);
                    await bot.sendMessage(chatId, infoText).catch(() => {});
                } catch (err) {
                    await bot.sendMessage(chatId, `⚠️ 获取角色信息失败: ${err.message}`).catch(() => {});
                }
                break;

            case 'switch':
                dt.log('commands', 'switch_received', chatId, { args });
                if (args.length === 0) {
                    await bot.sendMessage(chatId, '请指定角色名称，用法: /switch <名称>').catch(() => {});
                } else {
                    const targetName = args.join(' ');
                    try {
                        const charService = require('../services/character');
                        await charService.switchCharacter(chatId, targetName);
                    dt.log('commands', 'switch_before_execute', chatId, { targetName });
                        sessionStore.setCurrentCharacter(chatId, targetName);
                    dt.log('commands', 'switch_session_update', chatId, { targetName });
                        await bot.sendMessage(chatId, `✅ 已切换到角色: ${targetName}`).catch(() => {});
                    } catch (err) {
                        await bot.sendMessage(chatId, `⚠️ 切换失败: ${err.message}`).catch(() => {});
                    }
                }
                break;

            case 'context':
                try {
                    const chatService = require('../services/chat');
                    const historyData = await chatService.requestChatHistory(chatId, 6);
                    const charName = historyData.characterName || sessionStore.get(chatId)?.currentCharacter || '未知';
                    const lines = [`📖 上下文 — ${charName}`, ''];
                    if (historyData.messages && historyData.messages.length > 0) {
                        for (const msg of historyData.messages) {
                            const role = msg.is_user ? '👤' : '🤖';
                            const text = (msg.text || msg.mes || '').substring(0, 120).replace(/\n/g, ' ');
                            lines.push(`${role} ${text}`);
                        }
                    } else {
                        lines.push('（暂无消息记录）');
                    }
                    await bot.sendMessage(chatId, lines.join('\n')).catch(() => {});
                } catch (err) {
                    await bot.sendMessage(chatId, `⚠️ 获取上下文失败: ${err.message}`).catch(() => {});
                }
                break;

            // === 调试 ===
            case 'debug':
                try {
                    const diagnose = require('../utils/diagnose');
                    const reporter = require('../utils/reporter');
                    const runtime = require('../state/runtime');
                    const metrics = require('../services/metrics');
                    const subCmd = args[0]?.toLowerCase();

                    if (subCmd === 'save') {
                        await bot.sendMessage(chatId, '💾 正在生成诊断包...').catch(() => {});
                        const filepath = await diagnose.saveDiagnoseFile();
                        await bot.sendMessage(chatId, '✅ 诊断包已保存\n' + filepath).catch(() => {});
                    } else if (subCmd === 'report' && args[1]) {
                        const report = reporter.getReport(args[1]);
                        if (report) {
                            const rLines = [
                                '📋 错误报告 #' + report.errorId,
                                '⏱ ' + report.timestamp,
                                '📍 ' + report.module + ':' + report.action,
                                '📝 ' + report.message,
                            ];
                            if (report.stack) rLines.push('\n堆栈:\n' + report.stack.substring(0, 300));
                            if (report.suggestion) rLines.push('\n💡 建议:\n' + report.suggestion);
                            await bot.sendMessage(chatId, rLines.join('\n')).catch(() => {});
                        } else {
                            await bot.sendMessage(chatId, '❌ 未找到报告: ' + args[1]).catch(() => {});
                        }
                    } else if (subCmd === 'state') {
                        const sessionStore = require('../state/session');
                        const sess = sessionStore.get(chatId);
                        const rt = runtime.get(chatId);
                        const rtStats = rt ? runtime.getGenerationStats(chatId) : null;
                        const stateLines = [
                            '📊 完整状态',
                            '',
                            '── Session ──',
                            '模式: ' + (sess?.mode || '无'),
                            '菜单: ' + (sess?.currentMenu || '无'),
                            '角色: ' + (sess?.currentCharacter || '未知'),
                            '聊天: ' + (sess?.currentChatName || '无'),
                            '',
                            '── Runtime ──',
                            '生成状态: ' + (rtStats?.status || 'idle'),
                            '持续时间: ' + (rtStats?.duration ? (rtStats.duration / 1000).toFixed(1) + 's' : '0s'),
                            '文本长度: ' + (rtStats?.textLength || 0),
                            '已终结: ' + (rtStats?.finalized ? '是' : '否'),
                            '',
                            '── Metrics ──',
                        ].join('\n');
                        try {
                            const snap = metrics.snapshot();
                            const extraLines = [
                                '请求总数: ' + snap.total,
                                '成功: ' + snap.success,
                                '失败: ' + snap.failed,
                                '超时: ' + snap.timeout,
                            ];
                            await bot.sendMessage(chatId, stateLines + extraLines.join('\n')).catch(() => {});
                        } catch (_) {
                            await bot.sendMessage(chatId, stateLines + '（metrics 不可用）').catch(() => {});
                        }
                    } else if (subCmd === 'runtime') {
                        const entries = runtime.getAllEntries();
                        const active = runtime.getActiveGenerations();
                        const rLines = [
                            '⚙️ Runtime Status',
                            '',
                            'Active Generations: ' + active.length,
                            'Total Entries: ' + entries.length,
                            '',
                        ];
                        if (entries.length > 0) {
                            for (const e of entries) {
                                const statusIcon = e.status === 'completed' ? '✅' : e.status === 'failed' ? '❌' : e.status === 'idle' ? '⏸' : '⏳';
                                rLines.push(statusIcon + ' chatId=' + e.chatId + ' status=' + e.status + ' dur=' + (e.duration / 1000).toFixed(0) + 's' + (e.traceId ? ' trace=' + e.traceId : ''));
                            }
                        }
                        await bot.sendMessage(chatId, rLines.join('\n')).catch(() => {});
                    } else if (subCmd === 'metrics') {
                        const s = metrics.getStats();
                        const mLines = [
                            '📊 Request Metrics',
                            '',
                            'Total: ' + s.total,
                            'Success: ' + s.success,
                            'Failed: ' + s.failed,
                            'Timeout: ' + s.timeout,
                            'Avg Latency: ' + s.avgLatency + 'ms',
                            '',
                            'By Action:',
                        ];
                        if (s.actions.length > 0) {
                            for (const a of s.actions) {
                                mLines.push('  ' + a.action + ': ' + a.total + 'req ' + a.avgLatency + 'ms avg');
                            }
                        } else {
                            mLines.push('  (no requests yet)');
                        }
                        await bot.sendMessage(chatId, mLines.join('\n')).catch(() => {});
                    } else if (subCmd === 'requests') {
                        const pendingCount = stService._pendingRequests ? stService._pendingRequests.size : 0;
                        const reqLines = [
                            '🔄 Pending Requests',
                            '',
                            'Count: ' + pendingCount,
                            'Connected: ' + (stService.isConnected() ? '✅' : '❌'),
                        ];
                        await bot.sendMessage(chatId, reqLines.join('\n')).catch(() => {});
                    } else {
                        const msg = await diagnose.buildDebugMessage(chatId);
                        await bot.sendMessage(chatId, msg).catch(() => {});
                    }
                } catch (err) {
                    const errorService = require('../services/error');
                    const errorId = await errorService.createReport(err, 'commands', 'debug', { chatId });
                    await bot.sendMessage(chatId, '⚠️ 诊断生成失败 #' + errorId + '\n' + err.message).catch(() => {});
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
                dt.log('commands', 'listchars_received', chatId, { command });
            case 'listchats':
                stService.executeCommand(command, null, chatId);
                break;

            case 'switchchar':
                dt.log('commands', 'switchchar_received', chatId, { args });
                if (args.length === 0) {
                    await bot.sendMessage(chatId, '请指定角色名称，用法: /switchchar <名称>').catch(() => {});
                } else {
                    const scName = args.join(' ');
                    dt.log('commands', 'switchchar_before_execute', chatId, { scName });
                    stService.executeCommand('switchchar', args, chatId);
                    sessionStore.setCurrentCharacter(chatId, scName);
                    dt.log('commands', 'switchchar_session_update', chatId, { scName });
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
                const charMatch = command.match(/^switchchar_(\d+)$/);
                    dt.log('commands', 'switchchar_N_received', chatId, { command });
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

