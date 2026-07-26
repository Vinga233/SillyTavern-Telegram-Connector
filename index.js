// index.js
// 只解构 getContext() 返回的对象中确实存在的属性
const {
    extensionSettings,
    deleteLastMessage, // 导入删除最后一条消息的函数
    saveSettingsDebounced, // 导入保存设置的函数
} = SillyTavern.getContext();
// getContext 函数是全局 SillyTavern 对象的一部分，我们不需要从别处导入它
// 在需要时直接调用 SillyTavern.getContext() 即可
// 从 script.js 导入所有需要的公共API函数
import {
    eventSource,
    event_types,
    getPastCharacterChats,
    sendMessageAsUser,
    doNewChat,
    selectCharacterById,
    openCharacterChat,
    Generate,
    setExternalAbortController,
} from "../../../../script.js";
const MODULE_NAME = 'SillyTavern-Telegram-Connector';
const DEFAULT_SETTINGS = {
    bridgeUrl: 'ws://127.0.0.1:2333',
    autoConnect: true,
};
let ws = null; // WebSocket实例
let lastProcessedChatId = null; // 用于存储最后处理过的Telegram chatId
// 添加一个全局变量来跟踪当前是否处于流式模式
let isStreamingMode = false;
let _greetingLock = false;
let _finalSendLocks = {}; // handleFinalMessage 单次执行锁

// 角色切换后直接读取 chat[0] 发送 first_mes，消除事件竞争
function sendGreetingAfterSwitch(chatId) {
    if (_greetingLock) { console.log('[TG Bridge Trace] sendGreeting locked, skipping'); return; }
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) { console.log('[TG Bridge Trace] sendGreeting ws not ready'); return; }
    _greetingLock = true;
    console.log('[TG Bridge Trace] sendGreetingAfterSwitch scheduled for chatId=' + chatId);
    setTimeout(() => {
        try {
            _greetingLock = false;
            const context = SillyTavern.getContext();
            const char = context.characters[context.characterId];
            console.log('[TG Bridge Trace] sendGreeting: characterId=' + context.characterId + ' char=' + (char ? char.name : 'null') + ' chat.length=' + context.chat.length);
            const altGreetings = char?.data?.alternate_greetings;
            // 检查是否有 alternate greetings
            if (Array.isArray(altGreetings) && altGreetings.length > 0) {
                console.log('[TG Bridge Trace] alternate greetings count=' + altGreetings.length);
                let text = '已切换角色: ' + (char.name || '未知') + '\n\n请选择开场：\n\n1. 默认开场';
                for (var gi = 0; gi < altGreetings.length; gi++) {
                    var gText = typeof altGreetings[gi] === 'string' ? altGreetings[gi] : (altGreetings[gi].text || '');
                    var preview = gText.substring(0, 50).replace(/\n/g, ' ');
                    text += '\n' + (gi + 2) + '. ' + preview;
                }
                text += '\n\n使用 /greet 数字 选择开场';
                ws.send(JSON.stringify({ type: 'ai_reply', chatId: chatId, text: text }));
                console.log('[TG Bridge Trace] sendGreeting: greeting list sent');
            } else {
                // 没有 alternate greetings，发送默认 first_mes
                const msg = context.chat[0];
                console.log('[TG Bridge Trace] sendGreeting: chat[0] exists=' + (!!msg) + ' is_user=' + (msg ? msg.is_user : 'N/A') + ' text=' + (msg ? msg.mes?.substring(0, 80) : 'N/A'));
                if (msg && !msg.is_user && !msg.is_system && msg.mes) {
                    ws.send(JSON.stringify({ type: 'ai_reply', chatId: chatId, text: msg.mes }));
                    console.log('[TG Bridge Trace] sendGreeting: ai_reply sent');
                } else {
                    console.log('[TG Bridge Trace] sendGreeting: no valid greeting to send');
                }
            }
        } catch (e) {
            console.error('[TG Bridge Trace] sendGreeting error:', e);
            _greetingLock = false;
        }
    }, 300);
}
// --- 工具函数 ---
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }
    return extensionSettings[MODULE_NAME];
}
function updateStatus(message, color) {
    const statusEl = document.getElementById('telegram_connection_status');
    if (statusEl) {
        statusEl.textContent = `状态： ${message}`;
        statusEl.style.color = color;
    }
}
function reloadPage() {
    window.location.reload();
}

// 切换到新角色/新聊天后，将角色的 first message 通过 WebSocket 发送给 Telegram
// ---
// 连接到WebSocket服务器
function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('[TG Bridge] handleFinalMessage: entering send phase chatId=' + chatId + ' isStreamingMode=' + isStreamingMode + ' finalText.length=' + finalText.length);
        return;
    }
    const settings = getSettings();
    if (!settings.bridgeUrl) {
        updateStatus('URL 未设置！', 'red');
        return;
    }
    updateStatus('连接中...', 'orange');
    console.log(`[Telegram Bridge] 正在连接 ${settings.bridgeUrl}...`);
    ws = new WebSocket(settings.bridgeUrl);
    ws.onopen = () => {
        console.log('[TG Bridge] entering send phase: 连接成功！');
        updateStatus('已连接', 'green');
    };
    ws.onmessage = async (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
            // --- 用户消息处理 ---
            if (data.type === 'user_message') {
                console.log('[TG Bridge] entering send phase: 收到用户消息。', data);
                // 存储当前处理的chatId
                lastProcessedChatId = data.chatId;
                // 默认情况下，假设不是流式模式
                isStreamingMode = false;
                // 1. 立即向Telegram发送“输入中”状态（无论是否流式）
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'typing_action', chatId: data.chatId }));
                }
                // 2. 将用户消息添加到SillyTavern
                await sendMessageAsUser(data.text);
                // 3. 设置流式传输的回调
                const streamCallback = (cumulativeText) => {
                    // 标记为流式模式
                    isStreamingMode = true;
                    // 将每个文本块通过WebSocket发送到服务端
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'stream_chunk',
                            chatId: data.chatId,
                            text: cumulativeText,
                        }));
                    }
                };
                eventSource.on(event_types.STREAM_TOKEN_RECEIVED, streamCallback);
                // 4. 定义一个清理函数
                const cleanup = () => {
                    eventSource.removeListener(event_types.STREAM_TOKEN_RECEIVED, streamCallback);
                    if (ws && ws.readyState === WebSocket.OPEN && isStreamingMode) {
                        // 仅在没有错误且确实处于流式模式时发送stream_end
                        if (!data.error) {
                            ws.send(JSON.stringify({ type: 'stream_end', chatId: data.chatId }));
                        }
                    }
                    // 注意：不在这里重置isStreamingMode，让handleFinalMessage函数来处理
                };
                // 5. 监听生成结束事件，确保无论成功与否都执行清理
                // 注意: 我们现在使用once来确保这个监听器只执行一次，避免干扰后续的全局监听器
                eventSource.once(event_types.GENERATION_ENDED, cleanup);
                eventSource.once(event_types.GENERATION_STOPPED, cleanup);

                // 6. 注册终态消息处理器（once），接收渲染后的最终文本
                const finalHandler = (lastMessageId) => handleFinalMessage(lastMessageId, data.chatId);
                eventSource.once(event_types.GENERATION_ENDED, finalHandler);


                // 7. 触发SillyTavern的生成流程，并用try...catch包裹
                try {
                    const abortController = new AbortController();
                    setExternalAbortController(abortController);
                    await Generate('normal', { signal: abortController.signal });
                } catch (error) {
                    console.error("[Telegram Bridge] Generate() 错误:", error);
                    // a. 从SillyTavern聊天记录中删除导致错误的用户消息
                    await deleteLastMessage();
                    console.log('[TG Bridge] entering send phase: 已删除导致错误的用户消息。');
                    // b. 准备并发送错误信息到服务端
                    const errorMessage = `抱歉，AI生成回复时遇到错误。\n您的上一条消息已被撤回，请重试或发送不同内容。\n\n错误详情: ${error.message || '未知错误'}`;
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'error_message',
                            chatId: data.chatId,
                            text: errorMessage,
                        }));
                    }
                    // c. 标记错误以便cleanup函数知道
                    data.error = true;
                    cleanup(); // 确保清理监听器
                }
                return;
            }
            // --- 统一 request 分发 ---
            if (data.type === 'request') {
                console.log('[TG Bridge] entering send phase: 收到请求', data.action, data);
                const context = SillyTavern.getContext();
                let responseData = {};

                switch (data.action) {
                    case 'character_info': {
                        var foundChar = context.characters[context.characterId];
                        if (!foundChar) {
                            var searchName = data.params && data.params.name;
                            console.log('[TG Bridge Trace] character_info: fallback to name search=' + searchName);
                            foundChar = searchName ? context.characters.find(c => c.name === searchName) : null;
                        }
                        console.log('[TG Bridge Trace] character_info: char=' + (foundChar ? foundChar.name : 'null') + ' characterId=' + context.characterId);
                        if (foundChar) {
                            responseData = {
                                name: foundChar.name,
                                description: foundChar.description || '',
                                personality: foundChar.personality || '',
                                scenario: foundChar.scenario || '',
                                first_mes: foundChar.first_mes || '',
                            };
                            console.log('[TG Bridge Trace] character_info: responseKeys=' + Object.keys(responseData).join(','));
                        } else {
                            console.log('[TG Bridge Trace] character_info: char NOT found, responseData={}');
                        }
                        break;
                    }
                    case 'chat_history': {
                        const limit = data.params.limit || 5;
                        const chat = context.chat || [];
                        const messages = chat.slice(-limit).map(m => ({
                            role: m.is_user ? 'user' : 'assistant',
                            text: m.mes || '',
                        }));
                        const currentChar = context.characters[context.characterId];
                        responseData = {
                            chatName: context.chat?.name || '当前聊天',
                            characterName: currentChar?.name || '未知',
                            messages: messages,
                        };
                        break;
                    }
                    case 'alternate_greetings': {
                        var char = context.characters[context.characterId];
                        if (!char && data.params && data.params.name) {
                            char = context.characters.find(c => c.name === data.params.name);
                        }
                        if (char && char.alternate_greetings) {
                            responseData = {
                                greetings: char.alternate_greetings.map((g, i) => ({
                                    id: i,
                                    text: g,
                                    preview: g.substring(0, 80),
                                    selected: i === (char.selected_greeting || 0),
                                })),
                            };
                        } else if (char) {
                            responseData = {
                                greetings: char.data?.alternate_greetings
                                    ? char.data.alternate_greetings.map((g, i) => ({
                                        id: i,
                                        text: typeof g === 'string' ? g : g.text || '',
                                        preview: (typeof g === 'string' ? g : g.text || '').substring(0, 80),
                                        selected: i === (char.data.selected_greeting || 0),
                                    }))
                                    : [{ id: 0, text: char.first_mes || '', preview: (char.first_mes || '').substring(0, 80), selected: true }],
                            };
                        }
                        break;
                    }
                    case 'character_card_raw': {
                        var char = context.characters[context.characterId];
                        if (!char && data.params && data.params.name) {
                            char = context.characters.find(c => c.name === data.params.name);
                        }
                        if (char) {
                            // 深拷贝字符对象，避免返回活引用
                            const raw = {};
                            for (const key in char) {
                                if (Object.prototype.hasOwnProperty.call(char, key) && typeof char[key] !== 'function') {
                                    try {
                                        raw[key] = JSON.parse(JSON.stringify(char[key]));
                                    } catch (e) {
                                        raw[key] = String(char[key]);
                                    }
                                }
                            }
                            responseData = { character: raw };
                        }
                        break;
                    }
                    default:
                        console.warn('[Telegram Bridge] 未知请求 action:', data.action);
                        break;
                }

                // 发送响应
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // 判断 success: responseData 有任何非空字段即成功
                    const hasData = Object.values(responseData).some(v => v !== undefined && v !== null && v !== '');
                    console.log('[TG Bridge Trace] sending response: action=' + data.action + ' requestId=' + data.requestId + ' hasData=' + hasData + ' wsOpen=' + ws.readyState);
                    ws.send(JSON.stringify({
                        type: 'response',
                        requestId: data.requestId,
                        request: data.action,
                        success: hasData,
                        chatId: data.chatId,
                        data: responseData,
                        error: !hasData ? '未找到数据' : undefined,
                    }));
                    console.log('[TG Bridge Trace] response sent successfully');
                } else {
                    console.log('[TG Bridge Trace] response NOT sent: ws=' + (!!ws) + ' readyState=' + (ws ? ws.readyState : 'N/A'));
                }
                return;
            }

            // --- 系统命令处理 ---
            if (data.type === 'system_command') {
                console.log('[TG Bridge] entering send phase: 收到系统命令', data);
                if (data.command === 'reload_ui_only') {
                    console.log('[TG Bridge] entering send phase: 正在刷新UI...');
                    setTimeout(reloadPage, 500);
                }
                return;
            }
            // --- 执行命令处理 ---
            if (data.type === 'execute_command') {
                console.log('[TG Bridge] entering send phase: 执行命令', data);
                console.log('[SWITCH DEBUG] command=' + data.command + ' args=' + JSON.stringify(data.args) + ' chatId=' + data.chatId);
                // 显示“输入中”状态
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'typing_action', chatId: data.chatId }));
                }
                let replyText = '命令执行失败，请稍后重试。';
                // 直接调用全局的 SillyTavern.getContext()
                const context = SillyTavern.getContext();
                let commandSuccess = false;
                try {
                    switch (data.command) {
                        case 'new':
                            await doNewChat({ deleteCurrentChat: false });
                            replyText = '新的聊天已经开始。';
                            commandSuccess = true;
                            sendGreetingAfterSwitch(data.chatId);
                                    console.log('[SWITCH DEBUG] sendGreetingAfterSwitch called chatId=' + data.chatId + ' replyText=' + replyText);
                            break;
                        case 'listchars': {
                            const characters = context.characters.slice(1);
                            if (characters.length > 0) {
                                replyText = '可用角色列表：\n\n';
                                characters.forEach((char, index) => {
                                    replyText += `${index + 1}. /switchchar_${index + 1} - ${char.name}\n`;
                                });
                                replyText += '\n使用 /switchchar_数字 或 /switchchar 角色名称 来切换角色';
                            } else {
                                replyText = '没有找到可用角色。';
                            }
                            commandSuccess = true;
                            break;
                        }
                        case 'switchchar': {
                            if (!data.args || data.args.length === 0) {
                                replyText = '请提供角色名称或序号。用法: /switchchar <角色名称> 或 /switchchar_数字';
                                break;
                            }
                            const switchInput = data.args.join(' ');
                            const characters = context.characters;
                            let targetChar = null;
                            let charIndex = -1;
                            // 检查是否为数字序号 /switch 3 => /switchchar_3
                            if (/^\d+$/.test(switchInput.trim())) {
                                const idx = parseInt(switchInput.trim(), 10);
                                const userChars = characters.slice(1); // 跳过系统角色
                                if (idx >= 1 && idx <= userChars.length) {
                                    targetChar = userChars[idx - 1];
                                    charIndex = characters.indexOf(targetChar);
                                }
                                console.log('[TG Bridge Trace] switch resolver: input=' + switchInput + ' mode=index resolved=' + (targetChar ? targetChar.name : 'null') + ' charIndex=' + charIndex);
                            } else {
                                // 按名称查找
                                targetChar = characters.find(c => c.name === switchInput);
                                if (targetChar) charIndex = characters.indexOf(targetChar);
                                console.log('[TG Bridge Trace] switch resolver: input=' + switchInput + ' mode=name resolved=' + (targetChar ? targetChar.name : 'null') + ' charIndex=' + charIndex);
                            }
                            if (targetChar) {
                                await selectCharacterById(charIndex);
                                await doNewChat({ deleteCurrentChat: false });
                                replyText = `已成功切换到角色 "${targetChar.name}"。`;
                                commandSuccess = true;
                                sendGreetingAfterSwitch(data.chatId);
                            } else {
                                replyText = `角色 "${switchInput}" 未找到。`;
                            }
                            break;
                        }
                        case 'listchats': {
                            if (context.characterId === undefined) {
                                replyText = '请先选择一个角色。';
                                break;
                            }
                            const chatFiles = await getPastCharacterChats(context.characterId);
                            if (chatFiles.length > 0) {
                                replyText = '当前角色的聊天记录：\n\n';
                                chatFiles.forEach((chat, index) => {
                                    const chatName = chat.file_name.replace('.jsonl', '');
                                    replyText += `${index + 1}. /switchchat_${index + 1} - ${chatName}\n`;
                                });
                                replyText += '\n使用 /switchchat_数字 或 /switchchat 聊天名称 来切换聊天';
                            } else {
                                replyText = '当前角色没有任何聊天记录。';
                            }
                            commandSuccess = true;
                            break;
                        }
                        case 'switchchat': {
                            if (!data.args || data.args.length === 0) {
                                replyText = '请提供聊天记录名称。用法： /switchchat <聊天记录名称>';
                                break;
                            }
                            const targetChatFile = `${data.args.join(' ')}`;
                            try {
                                await openCharacterChat(targetChatFile);
                                replyText = `已加载聊天记录： ${targetChatFile}`;
                                commandSuccess = true;
                            } catch (err) {
                                console.error(err);
                                replyText = `加载聊天记录 "${targetChatFile}" 失败。请确认名称完全正确。`;
                            }
                            break;
                        }

                        case 'greet': {
                            const context = SillyTavern.getContext();
                            const char = context.characters[context.characterId];
                            if (!char) {
                                replyText = '请先选择一个角色。';
                                break;
                            }
                            if (!data.args || data.args.length === 0) {
                                replyText = '用法: /greet <数字>。使用 /listchars 查看可用角色和开场白。';
                                break;
                            }
                            var greetIdx = parseInt(data.args[0], 10);
                            if (isNaN(greetIdx) || greetIdx < 1) {
                                replyText = '请提供有效的开场序号 (正整数)。';
                                break;
                            }
                            var altGreetings = char.data?.alternate_greetings;
                            var altCount = Array.isArray(altGreetings) ? altGreetings.length : 0;
                            // greetIdx 1 = first_mes, 2+ = alternate_greetings[greetIdx-2]
                            var maxAlt = 1 + altCount;
                            if (greetIdx > maxAlt) {
                                replyText = '无效的开场序号: ' + greetIdx + '。可选范围: 1-' + maxAlt + '。';
                                break;
                            }
                            console.log('[TG Bridge] selected greeting index=' + greetIdx);
                            // 获取选中的开场文本
                            var selectedText = '';
                            if (greetIdx === 1) {
                                selectedText = char.first_mes || '';
                            } else {
                                var altG = altGreetings[greetIdx - 2];
                                selectedText = typeof altG === 'string' ? altG : (altG.text || '');
                            }
                            if (!selectedText) {
                                replyText = '开场文本为空。';
                                break;
                            }
                            // 创建新聊天并发送选中的开场
                            await doNewChat({ deleteCurrentChat: false });
                            replyText = '已选择开场 #' + greetIdx + '。';
                            commandSuccess = true;
                            // 直接发送选中的开场文本（不依赖 chat[0]）
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'ai_reply', chatId: data.chatId, text: selectedText }));
                                console.log('[TG Bridge] selected greeting sent: ' + selectedText.substring(0, 50));
                            }
                            break;
                        }
                        default: {
                            // 处理特殊格式的命令，如 switchchar_1, switchchat_2 等
                            const charMatch = data.command.match(/^switchchar_(\d+)$/);
                            if (charMatch) {
                                const index = parseInt(charMatch[1]) - 1;
                                const characters = context.characters.slice(1);
                                if (index >= 0 && index < characters.length) {
                                    const targetChar = characters[index];
                                    const charIndex = context.characters.indexOf(targetChar);
                                    await selectCharacterById(charIndex);
                                    await doNewChat({ deleteCurrentChat: false });
                                    replyText = `已切换到角色 "${targetChar.name}"。`;
                                    commandSuccess = true;
                                    sendGreetingAfterSwitch(data.chatId);
                                } else {
                                    replyText = `无效的角色序号: ${index + 1}。请使用 /listchars 查看可用角色。`;
                                }
                                break;
                            }
                            const chatMatch = data.command.match(/^switchchat_(\d+)$/);
                            if (chatMatch) {
                                if (context.characterId === undefined) {
                                    replyText = '请先选择一个角色。';
                                    break;
                                }
                                const index = parseInt(chatMatch[1]) - 1;
                                const chatFiles = await getPastCharacterChats(context.characterId);
                                if (index >= 0 && index < chatFiles.length) {
                                    const targetChat = chatFiles[index];
                                    const chatName = targetChat.file_name.replace('.jsonl', '');
                                    try {
                                        await openCharacterChat(chatName);
                                        replyText = `已加载聊天记录： ${chatName}`;
                                        commandSuccess = true;
                                    } catch (err) {
                                        console.error(err);
                                        replyText = `加载聊天记录失败。`;
                                    }
                                } else {
                                    replyText = `无效的聊天记录序号: ${index + 1}。请使用 /listchats 查看可用聊天记录。`;
                                }
                                break;
                            }
                            replyText = `未知命令: /${data.command}。使用 /help 查看所有命令。`;
                        }
                    }
                } catch (error) {
                    console.error('[Telegram Bridge] 执行命令时出错:', error);
                    replyText = `执行命令时出错: ${error.message || '未知错误'}`;
                }
                // 发送命令执行结果
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // 发送命令执行结果到Telegram
                    console.log('[SWITCH DEBUG] sending ai_reply replyText length=' + (replyText ? replyText.length : 0) + ' first80=' + (replyText ? replyText.substring(0, 80) : 'N/A'));
                    ws.send(JSON.stringify({ type: 'ai_reply', chatId: data.chatId, text: replyText }));
                    // 发送命令执行状态反馈到服务器
                    ws.send(JSON.stringify({
                        type: 'command_executed',
                        command: data.command,
                        success: commandSuccess,
                        message: replyText
                    }));
                }
                return;
            }
        } catch (error) {
            console.error('[Telegram Bridge] 处理请求时发生错误：', error);
            if (data && data.chatId && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error_message', chatId: data.chatId, text: '处理您的请求时发生了一个内部错误。' }));
            }
        }
    };
    ws.onclose = () => {
        console.log('[TG Bridge] entering send phase: 连接已关闭。');
        updateStatus('连接已断开', 'red');
        ws = null;
    };
    ws.onerror = (error) => {
        console.error('[Telegram Bridge] WebSocket 错误：', error);
        updateStatus('连接错误', 'red');
        ws = null;
    };
}
function disconnect() {
    if (ws) {
        ws.close();
    }
}
// 扩展加载时执行的函数
jQuery(async () => {
    console.log('[TG Bridge] entering send phase: 正在尝试加载设置 UI...');
    try {
        const settingsHtml = await $.get(`/scripts/extensions/third-party/${MODULE_NAME}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        console.log('[TG Bridge] entering send phase: 设置 UI 应该已经被添加。');
        const settings = getSettings();
        $('#telegram_bridge_url').val(settings.bridgeUrl);
        $('#telegram_auto_connect').prop('checked', settings.autoConnect);
        $('#telegram_bridge_url').on('input', () => {
            const settings = getSettings();
            settings.bridgeUrl = $('#telegram_bridge_url').val();
            // 确保调用saveSettingsDebounced保存设置
            saveSettingsDebounced();
        });
        $('#telegram_auto_connect').on('change', function () {
            const settings = getSettings();
            settings.autoConnect = $(this).prop('checked');
            // 确保调用saveSettingsDebounced保存设置
            console.log(`[Telegram Bridge] 自动连接设置已更改为: ${settings.autoConnect}`);
            saveSettingsDebounced();
        });
        $('#telegram_connect_button').on('click', connect);
        $('#telegram_disconnect_button').on('click', disconnect);
        if (settings.autoConnect) {
            console.log('[TG Bridge] entering send phase: 自动连接已启用，正在连接...');
            connect();
        }
    } catch (error) {
        console.error('[Telegram Bridge] 加载设置 HTML 失败。', error);
    }
    console.log('[TG Bridge] entering send phase: 扩展已加载。');
});
// ===== 全局聊天状态同步 =====
eventSource.on(event_types.CHAT_CHANGED, function(args) {
    console.log("[TG CHAT EVENT] CHAT_CHANGED args:", args);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
        const context = SillyTavern.getContext();
        var charName = context.characters && context.characters[context.characterId] ? context.characters[context.characterId].name : (context.name2 || "未知");
        var chatFileName = typeof args === 'string' ? args : (context.chat && context.chat.file_name ? context.chat.file_name : "");
        ws.send(JSON.stringify({
            type: "chat_info",
            data: {
                characterName: charName,
                characterId: context.characterId,
                chatName: typeof args === 'string' ? args : (context.chat && context.chat.name ? context.chat.name : ""),
                fileName: chatFileName,
            }
        }));
    } catch(e) {
        console.error("[TG CHAT EVENT] CHAT_CHANGED error:", e);
    }
});

eventSource.on(event_types.CHAT_LOADED, function(args) {
    console.log("[TG CHAT EVENT] CHAT_LOADED args:", args);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
        const context = SillyTavern.getContext();
        var charName = context.characters && context.characters[context.characterId] ? context.characters[context.characterId].name : (context.name2 || "未知");
        ws.send(JSON.stringify({
            type: "chat_info",
            data: {
                characterName: charName,
                characterId: context.characterId,
                chatName: context.chat && context.chat.name ? context.chat.name : (context.chat && context.chat.file_name ? context.chat.file_name : ""),
                fileName: context.chat && context.chat.file_name ? context.chat.file_name : "",
            }
        }));
    } catch(e) {
        console.error("[TG CHAT EVENT] CHAT_LOADED error:", e);
    }
});
// 终态消息处理器，由 user_message handler 中 once 注册
function handleFinalMessage(lastMessageIdInChatArray, chatId) {
    console.log('[TG Bridge Trace] handleFinalMessage entered, lastMessageIdInChatArray=' + lastMessageIdInChatArray + ', chatId=' + chatId);
    // single-execution lock: 防止同一次生成重复发送
    const _lockKey = chatId + '_' + lastMessageIdInChatArray;
    if (_finalSendLocks[_lockKey]) {
        console.log('[TG Bridge Trace] handleFinalMessage locked (already processing), lockKey=' + _lockKey);
        return;
    }
    _finalSendLocks[_lockKey] = true;
    // 确保WebSocket已连接，并且我们有一个有效的chatId来发送更新
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) {
        console.log('[TG Bridge Trace] handleFinalMessage return: ws=' + (!!ws) + ' readyState=' + (ws ? ws.readyState : 'N/A') + ' chatId=' + chatId);
        return;
    }
    const lastMessageIndex = lastMessageIdInChatArray - 1;
    if (lastMessageIndex < 0) { console.log('[TG Bridge Trace] handleFinalMessage return: lastMessageIndex < 0'); return; }
    // 延迟以确保DOM更新完成
    setTimeout(() => {
        console.log('[TG Bridge Trace] handleFinalMessage setTimeout fired, lastMessageIndex=' + lastMessageIndex);
        // 直接调用全局的 SillyTavern.getContext()
        const context = SillyTavern.getContext();
        const lastMessage = context.chat[lastMessageIndex];
        console.log('[TG Bridge Trace] chat[' + lastMessageIndex + '] exists=' + (!!lastMessage) + ' is_user=' + (lastMessage ? lastMessage.is_user : 'N/A') + ' is_system=' + (lastMessage ? lastMessage.is_system : 'N/A') + ' mes=' + (lastMessage ? lastMessage.mes?.substring(0, 50) : 'N/A'));
        // 确认这是我们刚刚通过Telegram触发的AI回复
                if (lastMessage && !lastMessage.is_user && !lastMessage.is_system) {
            // Primary: read from ST chat array (most reliable)
            let finalText = lastMessage.mes || '';
            console.log('[TG Bridge] FINAL AI TEXT from chat[' + lastMessageIndex + ']: "' + finalText.substring(0, 80) + '"');

            // Fallback: if chat data is empty, try DOM
            if (!finalText.trim()) {
                console.log('[TG Bridge Trace] handleFinalMessage: chat.mes empty, trying DOM fallback');
                var messageElement = document.querySelector('#chat .mes[mesid="' + lastMessageIndex + '"]');
                console.log('[TG Bridge Trace] mes element exists=' + (!!messageElement));
                if (messageElement) {
                    var messageTextElement = messageElement.querySelector('.mes_text');
                    if (messageTextElement) {
                        var renderedText = messageTextElement.innerHTML || '';
                        renderedText = renderedText
                            .replace(/<br\s*\/?>/gi, '\n')
                            .replace(/<\/p>\s*<p>/gi, '\n\n');
                        var tempDiv = document.createElement('div');
                        tempDiv.innerHTML = renderedText;
                        finalText = tempDiv.textContent || '';
                        console.log('[TG Bridge Trace] DOM fallback text="' + finalText.substring(0, 80) + '"');
                    }
                }
            }

            if (!finalText.trim()) {
                console.log('[TG Bridge Trace] handleFinalMessage: final text is empty, aborting');
                return;
            }

            console.log('[TG Bridge] FINAL AI TEXT:', finalText);
            console.log('[TG Bridge] entering send phase: \u6700\u7ec8\u6e32\u67d3\u6587\u672c\uff0c\u53d1\u9001\u5230 chatId=' + chatId);

            if (isStreamingMode) {
                console.log('[TG SEND DEBUG] final_message_update sending, chatId=' + chatId + ' text.length=' + finalText.length);
                try {
                    ws.send(JSON.stringify({
                        type: 'final_message_update',
                        chatId: chatId,
                        text: finalText,
                    }));
                    console.log('[TG SEND DEBUG] final_message_update sent successfully');
                } catch (e) {
                    console.log('[TG SEND ERROR] final_message_update ws.send exception: ' + e.message);
                }
                isStreamingMode = false;
            } else {
                console.log('[TG SEND DEBUG] ai_reply sending, chatId=' + chatId + ' text.length=' + finalText.length);
                try {
                    ws.send(JSON.stringify({
                        type: 'ai_reply',
                        chatId: chatId,
                        text: finalText,
                    }));
                    console.log('[TG SEND SUCCESS] ai_reply sent, chatId=' + chatId);
                } catch (e) {
                    console.log('[TG SEND ERROR] ai_reply ws.send exception: ' + e.message);
                }
            }
        }
    }, 100);
}
// 全局事件监听器，用于最终消息更新





