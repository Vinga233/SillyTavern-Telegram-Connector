// services/sillytavern.js
// WebSocket 服务器 — 管理与 SillyTavern 扩展的连接

const WebSocket = require("ws");
const path = require("path");
const dt = require('../utils/debugTrace');
const fs = require("fs");
const logger = require("../utils/logger");
const config = require("../config/config");
const metrics = require("./metrics");

const RESTART_PROTECTION_FILE = path.join(__dirname, "..", ".restart_protection");
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 60000;

class SillyTavernService {
    constructor() {
        this.wss = null;
        this.client = null;
        this.port = config.wssPort || 2333;
        this._onMessageCallback = null;
        this._onConnectionChange = null;
        this.ongoingStreams = new Map();
        this._pendingRequests = new Map();
        this._requestIdCounter = 0;
    }

    checkRestartProtection() {
        try {
            if (fs.existsSync(RESTART_PROTECTION_FILE)) {
                const data = JSON.parse(fs.readFileSync(RESTART_PROTECTION_FILE, "utf8"));
                const now = Date.now();
                data.restarts = data.restarts.filter(time => now - time < RESTART_WINDOW_MS);
                data.restarts.push(now);
                if (data.restarts.length > MAX_RESTARTS) {
                    logger.error("st", "检测到循环重启！" + (RESTART_WINDOW_MS / 1000) + "秒内重启" + data.restarts.length + "次，退出防止资源耗尽");
                    process.exit(1);
                }
                fs.writeFileSync(RESTART_PROTECTION_FILE, JSON.stringify(data));
            } else {
                fs.writeFileSync(RESTART_PROTECTION_FILE, JSON.stringify({ restarts: [Date.now()] }));
            }
        } catch (error) {
            logger.error("st", "重启保护检查失败:", error);
        }
    }

    onMessage(callback) {
        this._onMessageCallback = callback;
    }

    onConnectionChange(callback) {
        this._onConnectionChange = callback;
    }

    isConnected() {
        return this.client && this.client.readyState === WebSocket.OPEN;
    }

    send(data) {
        if (this.isConnected()) {
            this.client.send(typeof data === "string" ? data : JSON.stringify(data));
            return true;
        }
        return false;
    }

    start() {
        this.checkRestartProtection();

        this.wss = new WebSocket.Server({ port: this.port });
        logger.info("st", "WebSocket 服务器正在监听端口 " + this.port + "...");

        this.wss.on("connection", (ws) => {
            this.client = ws;
            logger.info("st", "SillyTavern 扩展已连接！");
            if (this._onConnectionChange) this._onConnectionChange(true);

            ws.on("message", async (message) => {
                let data;
                try {
                    data = JSON.parse(message);
                    if (data && data.type === "response") {
                        this._handleResponse(data);
                        return;
                    }
                    if (this._onMessageCallback) {
        dt.log('ws', 'response', data.chatId || null, { type: data.type, requestId: data.requestId, success: data.success, action: data.action });
                        await this._onMessageCallback(data);
                    }
                } catch (error) {
                    logger.error("st", "处理消息出错:", error);
                    if (data && data.chatId) {
                        this.ongoingStreams.delete(data.chatId);
                    }
                }
            });

            ws.on("close", () => {
                logger.info("st", "SillyTavern 扩展已断开连接");
                if (ws.commandToExecuteOnClose) {
                    const { command, chatId } = ws.commandToExecuteOnClose;
                    logger.info("st", "客户端断开，执行预定命令: " + command);
                    if (command === "reload") this.reloadServer(chatId);
                    if (command === "restart") this.restartServer(chatId);
                    if (command === "exit") this.exitServer(chatId);
                }
                this.client = null;
                this.ongoingStreams.clear();
                if (this._onConnectionChange) this._onConnectionChange(false);
            });

            ws.on("error", (error) => {
                logger.error("st", "WebSocket 发生错误:", error);
                if (this.client) this.client.commandToExecuteOnClose = null;
                this.client = null;
                this.ongoingStreams.clear();
                if (this._onConnectionChange) this._onConnectionChange(false);
            });
        });
    }

    executeCommand(command, args, chatId) {
        return this.send({
            type: "execute_command",
            command: command,
            args: args,
            chatId: chatId,
        });
    }

    async request(action, params, chatId, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const requestId = ++this._requestIdCounter;
            const payload = {
                type: "request",
                action,
                requestId,
                chatId,
                params,
            };
            const entry = {
                resolve,
                reject,
                action,
                startTime: Date.now(),
            };
            this._pendingRequests.set(requestId, entry);
            metrics.recordRequest(action);
            setTimeout(() => {
                if (this._pendingRequests.has(requestId)) {
                    this._pendingRequests.delete(requestId);
                    metrics.recordTimeout(action);
                    reject(new Error("请求超时: " + action));
                }
            }, timeoutMs);
            this.send(payload);
        });
    }

    _handleResponse(data) {
        dt.log('ws', 'response', data.chatId || null, { type: data.type, requestId: data.requestId, success: data.success, action: data.action });
        if (data.type === "response") {
            const pending = this._pendingRequests.get(data.requestId);
            if (pending) {
                this._pendingRequests.delete(data.requestId);
                const latency = Date.now() - (pending.startTime || Date.now());
                if (data.success) {
                    metrics.recordSuccess(pending.action, latency);
                    pending.resolve(data);
                } else {
                    metrics.recordError(pending.action);
                    pending.reject(new Error(data.error || "请求失败"));
                }
            }
        }
    }

    reloadServer(chatId) {
        logger.info("st", "重载服务器端组件...");
        Object.keys(require.cache).forEach((key) => {
            if (key.indexOf("node_modules") === -1) delete require.cache[key];
        });
        try {
            delete require.cache[require.resolve("../config/config.js")];
            const newConfig = require("../config/config.js");
            Object.assign(config, newConfig);
            logger.info("st", "配置文件已重新加载");
        } catch (error) {
            logger.error("st", "重载配置文件出错:", error);
            throw error;
        }
        logger.info("st", "服务器端组件已重载");
    }

    restartServer(chatId) {
        logger.info("st", "重启服务器端组件...");
        const { spawn } = require("child_process");
        const serverPath = path.join(__dirname, "..", "server.js");
        const cleanEnv = {
            PATH: process.env.PATH,
            NODE_PATH: process.env.NODE_PATH,
            TELEGRAM_CLEAR_UPDATES: "1",
        };
        if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
        const child = spawn(process.execPath, [serverPath], {
            detached: true,
            stdio: "inherit",
            env: cleanEnv,
        });
        child.unref();
        process.exit(0);
    }

    exitServer() {
        logger.info("st", "正在关闭服务器...");
        try {
            if (fs.existsSync(RESTART_PROTECTION_FILE)) {
                fs.unlinkSync(RESTART_PROTECTION_FILE);
            }
        } catch (error) {
            logger.error("st", "清理重启保护文件失败:", error);
        }
        process.exit(0);
    }

    stop() {
        if (this.wss) {
            this.wss.close();
        }
    }
}

const stService = new SillyTavernService();
module.exports = stService;

