// menus/index.js
// 菜单入口和工具函数

const dt = require('../utils/debugTrace');
const sessionStore = require("../state/session");

function buildMainKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "\uD83C\uDFAD 角色管理", callback_data: "chars:menu" },
             { text: "\uD83E\uDDE0 记忆管理", callback_data: "memory:menu" }],
            [{ text: "\uD83D\uDCDA 世界书", callback_data: "worldbook:menu" },
             { text: "\u26A1 快捷回复", callback_data: "quick:menu" }],
            [{ text: "\uD83D\uDD04 生成控制", callback_data: "generate:menu" },
             { text: "\uD83D\uDCD6 上下文", callback_data: "chat:history" }],
            [{ text: "\uD83D\uDCDD 新聊天", callback_data: "chat:new" },
             { text: "\u2699\uFE0F 设置", callback_data: "settings:menu" }],
            [{ text: "\uD83D\uDCCA 状态", callback_data: "status:show" },
             { text: "\u2753 帮助", callback_data: "help:show" }],
        ],
    };
}

function buildBackButton(backTarget) {
    return [{ text: "\u2B1C 返回", callback_data: backTarget || "menu:main" }];
}

// ===== 主菜单 =====

async function showMain(bot, chatId, messageId) {
    const text = [
        "\uD83C\uDF19 Snow AI",
        "欢迎回来，请选择操作：",
        "",
        "\uD83D\uDCA1 直接输入文字即可开始聊天",
    ].join("\n");

    if (messageId) {
        await bot.editMessageText(text, {
            chat_id: chatId, message_id: messageId,
            reply_markup: buildMainKeyboard(),
        }).catch(() => {});
    } else {
        const sent = await bot.sendMessage(chatId, text, { reply_markup: buildMainKeyboard() }).catch(() => {});
        if (sent) {
            sessionStore.setMenuMessageId(chatId, sent.message_id);
        }
    }
}

// ===== 角色管理 =====

async function showCharacterMenu(bot, chatId, messageId) {
    const session = sessionStore.get(chatId);
    const currentChar = session?.currentCharacter || '未知';
    console.log("[SESSION MENU DEBUG] chatId=" + chatId + " session.currentCharacter=" + (session?.currentCharacter || "null"));
    dt.log('menu', 'showCharacterMenu', chatId, { sessionChar: session?.currentCharacter, displayChar: currentChar });

    const text = [
        "\uD83C\uDFAD 角色管理",
        "",
        "\u2B50 当前角色: " + currentChar,
        "",
        "\uD83D\uDC49 选择操作:",
    ].join("\n");

    const keyboard = {
        inline_keyboard: [
            [{ text: "\uD83D\uDCD6 角色详情", callback_data: "char:info:" + currentChar }],
            [{ text: "\uD83C\uDFAD 切换开场白", callback_data: "char:greetings:" + currentChar },
             { text: "\uD83D\uDD04 切换角色", callback_data: "char:switch" }],
            [{ text: "\uD83D\uDCDA 角色列表", callback_data: "char:list" }],
            [{ text: "\uD83D\uDCC1 \u5386\u53F2\u804A\u5929", callback_data: "chats:list" }],
            buildBackButton("menu:main"),
        ],
    };

    await bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

async function showCharacterList(bot, chatId, messageId) {
    const text = "\uD83D\uDCDA 角色列表\n\n正在获取角色列表...";

    await bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        reply_markup: { inline_keyboard: [buildBackButton("chars:menu")] },
    }).catch(() => {});

    const stService = require("../services/sillytavern");
    if (stService.isConnected()) {
        stService.executeCommand("listchars", null, chatId);
    }
}

async function showCharacterSwitch(bot, chatId, messageId) {
    const text = "\uD83D\uDD04 切换角色\n\n正在获取角色列表...";

    await bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        reply_markup: { inline_keyboard: [buildBackButton("chars:menu")] },
    }).catch(() => {});

    const stService = require("../services/sillytavern");
    if (stService.isConnected()) {
        stService.executeCommand("listchars", null, chatId);
    }
}

// ===== 记忆管理 =====

async function showMemoryMenu(bot, chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "\uD83D\uDCCC 查看记忆", callback_data: "memory:view" },
             { text: "\uD83D\uDCDD 生成摘要", callback_data: "memory:summary" }],
            [{ text: "\uD83E\uDDF9 清理上下文", callback_data: "memory:clear" },
             { text: "\uD83D\uDD04 刷新记忆", callback_data: "memory:refresh" }],
            buildBackButton("menu:main"),
        ],
    };

    await bot.editMessageText("\uD83E\uDDE0 记忆管理\n\n请选择操作:", {
        chat_id: chatId, message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

// ===== 世界书 =====

async function showWorldBookMenu(bot, chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "\uD83D\uDCD6 查看", callback_data: "worldbook:view" },
             { text: "\u2705 启用", callback_data: "worldbook:enable" },
             { text: "\u274C 关闭", callback_data: "worldbook:disable" }],
            buildBackButton("menu:main"),
        ],
    };

    await bot.editMessageText("\uD83D\uDCDA 世界书\n\n请选择操作:", {
        chat_id: chatId, message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

// ===== 生成控制 =====

async function showGenerateMenu(bot, chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "\uD83D\uDD01 重新生成", callback_data: "generate:retry" },
             { text: "\u21A9\uFE0F 撤销回复", callback_data: "generate:undo" }],
            [{ text: "\u23F9 停止生成", callback_data: "generate:stop" }],
            buildBackButton("menu:main"),
        ],
    };

    await bot.editMessageText("\uD83D\uDD04 生成控制\n\n请选择操作:", {
        chat_id: chatId, message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

// ===== 快捷回复 =====

async function showQuickMenu(bot, chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "\u25B6 继续剧情", callback_data: "quick:action:继续剧情" }],
            [{ text: "\uD83D\uDCDD 总结一下", callback_data: "quick:action:请总结一下当前的剧情" }],
            [{ text: "\uD83C\uDFAD 改变语气", callback_data: "quick:action:请换一种语气说话" }],
            [{ text: "\uD83D\uDCD6 更详细描述", callback_data: "quick:action:请更详细地描述" }],
            [{ text: "\u23ED 跳过当前情节", callback_data: "quick:action:跳过当前情节，进入下一段" }],
            buildBackButton("menu:main"),
        ],
    };

    await bot.editMessageText("\u26A1 快捷回复\n\n选择要发送的快捷回复:", {
        chat_id: chatId, message_id: messageId,
        reply_markup: keyboard,
    }).catch(() => {});
}

// ===== 设置 =====

async function showSettingsMenu(bot, chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "\uD83E\uDD16 当前模型", callback_data: "settings:model" }],
            [{ text: "\uD83D\uDCCF 上下文状态", callback_data: "settings:context" }],
            [{ text: "\uD83D\uDD14 通知设置", callback_data: "settings:notify" }],
            buildBackButton("menu:main"),
        ],
    };

    await bot.editMessageText("\u2699\uFE0F 设置\n\n请选择操作:", {
        chat_id: chatId, message_id: messageId,
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
