// telegram/callbacks.js
// Callback Query 路由分发

const logger = require("../utils/logger");
const sessionStore = require("../state/session");
const runtime = require("../state/runtime");
const metrics = require("../services/metrics");
const menus = require("../menus");
const stService = require("../services/sillytavern");
const characterService = require("../services/character");
const chatService = require("../services/chat");
const memoryService = require("../services/memory");
const { handleError, buildErrorKeyboard } = require("../utils/errors");

module.exports = function setupCallbacks(bot) {
    bot.on("callback_query", async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const userId = query.from.id;
        const data = query.data;

        await bot.answerCallbackQuery(query.id).catch(() => {});

        const session = sessionStore.getOrCreate(chatId, userId);
        sessionStore.setMode(chatId, "control");
        sessionStore.setMenuMessageId(chatId, messageId);

        const parts = data.split(":");
        const module = parts[0];
        const action = parts[1];
        const param = parts.slice(2).join(":");

        logger.info("callback", "ChatID=" + chatId + " Data=" + data);

        try {
            await routeCallback(bot, chatId, messageId, module, action, param);
        } catch (error) {
            logger.error("callback", "处理 callback 失败:", error);
            const errorMsg = handleError(chatId, error, "callback");
            await bot.editMessageText(errorMsg || "\u26A0\uFE0F 操作失败，请重试", {
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
        case "menu":
            if (action === "main") {
                sessionStore.setMenu(chatId, null);
                await menus.showMain(bot, chatId, messageId);
            } else if (action === "back") {
                sessionStore.setMenu(chatId, null);
                await menus.showMain(bot, chatId, messageId);
            }
            break;

        // ===== 角色管理 =====
        case "char":
            if (action === "list") {
                await menus.showCharacterList(bot, chatId, messageId);
            } else if (action === "switch") {
                await menus.showCharacterSwitch(bot, chatId, messageId);
            } else if (action === "current") {
                await menus.showCharacterMenu(bot, chatId, messageId);
            } else if (action === "info") {
                await showCharacterInfo(bot, chatId, messageId, param || session?.currentCharacter);
            } else if (action === "greetings") {
                await showGreetingsList(bot, chatId, messageId, param || session?.currentCharacter);
            } else if (action === "greeting") {
                await selectGreeting(bot, chatId, messageId, param);
            } else if (action.startsWith("switch:")) {
                const targetName = action.substring(7);
                await doSwitchCharacter(bot, chatId, messageId, targetName);
            }
            break;

        // ===== 角色菜单导航（兼容） =====
        case "chars":
            if (action === "menu") {
                sessionStore.setMenu(chatId, "character");
                await menus.showCharacterMenu(bot, chatId, messageId);
            }
            break;

        // ===== 记忆管理 =====
        case "memory":
            if (action === "menu") {
                sessionStore.setMenu(chatId, "memory");
                await menus.showMemoryMenu(bot, chatId, messageId);
            } else if (action === "view" || action === "summary" || action === "clear" || action === "refresh") {
                await bot.editMessageText("\uD83E\uDDE0 记忆管理\n\n功能开发中，敬请期待...", {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "memory:menu" }]] },
                }).catch(() => {});
            }
            break;

        // ===== 世界书 =====
        case "worldbook":
            if (action === "menu") {
                sessionStore.setMenu(chatId, "worldbook");
                await menus.showWorldBookMenu(bot, chatId, messageId);
            } else {
                await bot.editMessageText("\uD83D\uDCDA 世界书\n\n功能开发中，敬请期待...", {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "worldbook:menu" }]] },
                }).catch(() => {});
            }
            break;

        // ===== 生成控制 =====
        case "generate":
            if (action === "menu") {
                sessionStore.setMenu(chatId, "generate");
                await menus.showGenerateMenu(bot, chatId, messageId);
            } else if (action === "retry") {
                if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); break; }
                stService.executeCommand("regenerate", [], chatId);
                await bot.editMessageText("\uD83D\uDD01 正在重新生成...", {
                    chat_id: chatId, message_id: messageId,
                }).catch(() => {});
            } else if (action === "undo") {
                if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); break; }
                stService.executeCommand("undo", [], chatId);
                await bot.editMessageText("\u21A9\uFE0F 正在撤销...", {
                    chat_id: chatId, message_id: messageId,
                }).catch(() => {});
            } else if (action === "stop") {
                if (stService.isConnected()) {
                    stService.send({ type: "system_command", command: "stop_generation", chatId });
                }
                await bot.editMessageText("\u23F9 已请求停止生成", {
                    chat_id: chatId, message_id: messageId,
                }).catch(() => {});
            }
            break;

        // ===== 聊天管理 =====
        case "chat":
            if (action === "new") {
                if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); break; }
                stService.executeCommand("new", null, chatId);
                await bot.editMessageText("\uD83D\uDCDD 正在创建新聊天...", {
                    chat_id: chatId, message_id: messageId,
                }).catch(() => {});
            } else if (action === "history") {
                await showChatHistory(bot, chatId, messageId);
            }
            break;

        // ===== 快捷回复 =====
        case "quick":
            if (action === "menu") {
                sessionStore.setMenu(chatId, "quick");
                await menus.showQuickMenu(bot, chatId, messageId);
            } else if (action === "action") {
                if (stService.isConnected() && param) {
                    stService.client.send(JSON.stringify({
                        type: "user_message",
                        chatId: chatId,
                        text: param,
                    }));
                    await bot.editMessageText("\u26A1 已发送快捷回复: " + param, {
                        chat_id: chatId, message_id: messageId,
                    }).catch(() => {});
                } else {
                    await showDisconnectedError(bot, chatId, messageId);
                }
            }
            break;

        // ===== 设置 =====
        case "settings":
            if (action === "menu") {
                sessionStore.setMenu(chatId, "settings");
                await menus.showSettingsMenu(bot, chatId, messageId);
            } else {
                await bot.editMessageText("\u2699\uFE0F 设置\n\n功能开发中，敬请期待...", {
                    chat_id: chatId, message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "settings:menu" }]] },
                }).catch(() => {});
            }
            break;

        // ===== 状态 =====
        case "status":
            if (action === "show") {
                await showStatus(bot, chatId, messageId, session);
            }
            break;

        // ===== 帮助 =====
        case "help":
            if (action === "show") {
                const helpText = [
                    "\u2753 帮助",
                    "",
                    "\uD83D\uDCDD 直接输入文字即可开始聊天",
                    "",
                    "\uD83D\uDCCB 可用命令:",
                    "/menu - 打开控制面板",
                    "/new - 新聊天",
                    "/regen - 重新生成",
                    "/undo - 撤销上一轮",
                    "/role - 当前角色",
                    "/switch - 切换角色",
                    "/status - 完整状态",
                    "/context - 聊天历史",
                    "/charinfo - 角色详情",
                    "",
                    "\uD83D\uDCA1 提示: 文字输入 = 聊天模式",
                    "按钮操作 = 控制面板",
                ].join("\n");
                await bot.editMessageText(helpText, {
                    chat_id: chatId, message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "menu:main" }]] },
                }).catch(() => {});
            }
            break;

        default:
            logger.warn("callback", "未知模块: " + module);
    }
}

// ==================== 角色详情 ====================

async function showCharacterInfo(bot, chatId, messageId, charName) {
    if (!charName) {
        await bot.editMessageText("\u26A0\uFE0F 请先设置当前角色", {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "char:current" }]] },
        }).catch(() => {});
        return;
    }
    if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); return; }

    await bot.editMessageText("\uD83D\uDD0D 正在查询: " + charName + "...", {
        chat_id: chatId, message_id: messageId,
    }).catch(() => {});

    try {
        const charData = await characterService.getCharacterInfo(chatId, charName);
        const lines = [
            "\uD83C\uDFAD " + (charData.name || charName),
            "",
        ];
        if (charData.description) lines.push("\uD83D\uDCDD 描述\n" + truncateText(charData.description, 200));
        if (charData.personality) lines.push("\uD83C\uDFAD 性格\n" + truncateText(charData.personality, 200));
        if (charData.scenario) lines.push("\uD83C\uDF0D 场景\n" + truncateText(charData.scenario, 200));
        if (charData.first_mes) lines.push("\uD83D\uDCAC 开场白\n" + truncateText(charData.first_mes, 200));

        await bot.editMessageText(lines.join("\n\n"), {
            chat_id: chatId, message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "\uD83C\uDFAD 切换开场白", callback_data: "char:greetings:" + charName }],
                    [{ text: "\u2B1C 返回", callback_data: "char:current" }],
                ],
            },
        }).catch(() => {});
    } catch (err) {
        await bot.editMessageText("\u26A0\uFE0F 获取角色信息失败: " + err.message, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "char:current" }]] },
        }).catch(() => {});
    }
}

// ==================== 开场白列表 ====================

async function showGreetingsList(bot, chatId, messageId, charName) {
    if (!charName) {
        await bot.editMessageText("\u26A0\uFE0F 未指定角色", {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "char:current" }]] },
        }).catch(() => {});
        return;
    }
    if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); return; }

    await bot.editMessageText("\uD83D\uDD0D 正在获取开场白: " + charName + "...", {
        chat_id: chatId, message_id: messageId,
    }).catch(() => {});

    try {
        const greetData = await characterService.getAlternateGreetings(chatId, charName);
        const rows = greetData.greetings.map((g, i) => [
            { text: (g.selected ? "\u2705 " : "") + "\uD83D\uDCAC " + (i + 1), callback_data: "char:greeting:" + charName + ":" + i },
        ]);
        rows.push([{ text: "\u2B1C 返回", callback_data: "char:current" }]);

        const lines = [
            "\uD83C\uDFAD 切换开场白 - " + charName,
            "",
            ...greetData.greetings.map((g, i) =>
                (g.selected ? "\u2705 " : "  ") + (i + 1) + ". " + (g.preview || "").substring(0, 80)
            ),
        ];

        await bot.editMessageText(lines.join("\n"), {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: rows },
        }).catch(() => {});
    } catch (err) {
        await bot.editMessageText("\u26A0\uFE0F 获取开场白失败: " + err.message, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "char:current" }]] },
        }).catch(() => {});
    }
}

// ==================== 选择开场白 ====================

async function selectGreeting(bot, chatId, messageId, param) {
    // param 格式: charName:index
    const lastColon = param.lastIndexOf(":");
    if (lastColon === -1) return;
    const charName = param.substring(0, lastColon);
    const greetingIndex = parseInt(param.substring(lastColon + 1));
    if (isNaN(greetingIndex)) return;

    sessionStore.setPendingAction(chatId, "switch_greeting");
    await bot.editMessageText("\uD83C\uDFAD 选择开场白 " + (greetingIndex + 1) + " (" + charName + ")\n\n正在新建聊天并应用开场白...", {
        chat_id: chatId, message_id: messageId,
    }).catch(() => {});

    // 新建聊天 → 自动触发 ST 的 alternate greeting 机制
    if (stService.isConnected()) {
        stService.executeCommand("new", null, chatId);
        sessionStore.setPendingAction(chatId, null);
        logger.info("callback", "选中开场白: " + charName + " #" + greetingIndex);
    }
}

// ==================== 切换角色 ====================

async function doSwitchCharacter(bot, chatId, messageId, targetName) {
    if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); return; }
    try {
        await characterService.switchCharacter(chatId, targetName);
        sessionStore.setCurrentCharacter(chatId, targetName);
        await bot.editMessageText("\u2705 已切换到角色: " + targetName, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\uD83C\uDFAD 角色详情", callback_data: "char:info:" + targetName }]] },
        }).catch(() => {});
    } catch (err) {
        await bot.editMessageText("\u26A0\uFE0F 切换失败: " + err.message, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "char:switch" }]] },
        }).catch(() => {});
    }
}

// ==================== 聊天历史 ====================

async function showChatHistory(bot, chatId, messageId) {
    if (!stService.isConnected()) { await showDisconnectedError(bot, chatId, messageId); return; }

    await bot.editMessageText("\uD83D\uDCD6 正在获取聊天上下文...", {
        chat_id: chatId, message_id: messageId,
    }).catch(() => {});

    try {
        const historyData = await chatService.requestChatHistory(chatId, 8);
        const session = sessionStore.get(chatId);
        const charName = historyData.characterName || session?.currentCharacter || "未知";
        const chatName = historyData.chatName || session?.currentChatName || "当前聊天";

        const lines = [
            "\uD83D\uDCD6 聊天上下文",
            "",
            "\uD83C\uDFAD 角色: " + charName,
            "\uD83D\uDCDD 聊天: " + chatName,
            "",
        ];

        if (historyData.messages && historyData.messages.length > 0) {
            for (const msg of historyData.messages) {
                const role = msg.is_user ? "\uD83D\uDC64" : "\uD83E\uDD16";
                const text = (msg.text || msg.mes || "").substring(0, 100).replace(/\n/g, " ");
                lines.push(role + " " + text);
            }
        } else {
            lines.push("（暂无消息记录）");
        }

        await bot.editMessageText(lines.join("\n"), {
            chat_id: chatId, message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "\uD83D\uDD04 刷新", callback_data: "chat:history" }],
                    [{ text: "\u2B1C 返回", callback_data: "menu:main" }],
                ],
            },
        }).catch(() => {});
    } catch (err) {
        await bot.editMessageText("\u26A0\uFE0F 获取上下文失败: " + err.message, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "\u2B1C 返回", callback_data: "menu:main" }]] },
        }).catch(() => {});
    }
}

// ==================== 状态面板 ====================

async function showStatus(bot, chatId, messageId, session) {
    const stConnected = stService.isConnected();
    const rt = runtime.get(chatId);
    const genStats = rt ? runtime.getGenerationStats(chatId) : null;
    const metricsStats = metrics.getStats();

    const lines = [
        "\uD83D\uDCCA Snow AI 状态",
        "",
        "\uD83E\uDD16 SillyTavern: " + (stConnected ? "\u2705 已连接" : "\u274C 未连接"),
        "\uD83C\uDFAD 角色: " + (session?.currentCharacter || "未知"),
        "\uD83D\uDCDD 聊天: " + (session?.currentChatName || "未知"),
        "\uD83D\uDCAC 模式: " + (session?.mode === "chat" ? "聊天" : "控制面板"),
        "",
        "\u2697\uFE0F 生成状态: " + formatGenStatus(genStats),
        "\uD83D\uDCC8 请求统计: " + metricsStats.total + "总 / " + metricsStats.success + "成功 / " + metricsStats.failed + "失败 / " + metricsStats.timeout + "超时",
        metricsStats.avgLatency > 0 ? "\u23F1 平均延迟: " + metricsStats.avgLatency + "ms" : "",
    ].filter(Boolean).join("\n");

    await bot.editMessageText(lines, {
        chat_id: chatId, message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: "\uD83D\uDD04 刷新", callback_data: "status:show" }],
                [{ text: "\u2B1C 返回", callback_data: "menu:main" }],
            ],
        },
    }).catch(() => {});
}

function formatGenStatus(genStats) {
    if (!genStats) return "\u23F8\uFE0F 空闲";
    switch (genStats.status) {
        case "generating": return "\u23F3 生成中...";
        case "streaming": return "\uD83D\uDCA8 输出中 (" + genStats.textLength + "字)";
        case "finalizing": return "\u270F\uFE0F 最终处理中";
        case "completed": return "\u2705 已完成 (" + (genStats.duration / 1000).toFixed(1) + "s)";
        case "failed": return "\u274C 失败";
        default: return genStats.status;
    }
}

// ==================== 工具函数 ====================

function truncateText(text, maxLen) {
    if (!text) return "";
    return text.length > maxLen ? text.substring(0, maxLen) + "..." : text;
}

async function showDisconnectedError(bot, chatId, messageId) {
    await bot.editMessageText("\u26A0\uFE0F SillyTavern 连接已断开\n\n请确保 SillyTavern 已启动并连接扩展。", {
        chat_id: chatId, message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: "\uD83D\uDD04 重试", callback_data: "menu:main" }]] },
    }).catch(() => {});
}
