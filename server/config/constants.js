// config/constants.js
// 全局常量定义

module.exports = {
    // 模块名
    MODULES: {
        MENU: 'menu',
        CHAR: 'char',
        MEMORY: 'memory',
        WORLDBOOK: 'worldbook',
        CHAT: 'chat',
        GENERATE: 'generate',
        QUICK: 'quick',
        SETTINGS: 'settings',
        STATUS: 'status',
        HELP: 'help',
    },

    // 动作名
    ACTIONS: {
        MAIN: 'main',
        BACK: 'back',
        LIST: 'list',
        SWITCH: 'switch',
        CURRENT: 'current',
        VIEW: 'view',
        SUMMARY: 'summary',
        CLEAR: 'clear',
        REFRESH: 'refresh',
        ENABLE: 'enable',
        DISABLE: 'disable',
        NEW: 'new',
        RETRY: 'retry',
        UNDO: 'undo',
        STOP: 'stop',
        MODEL: 'model',
        CONTEXT: 'context',
        NOTIFY: 'notify',
        SHOW: 'show',
    },

    // 模式
    MODE: {
        CHAT: 'chat',
        CONTROL: 'control',
    },

    // 菜单名
    MENUS: {
        MAIN: 'main',
        CHARACTER: 'character',
        MEMORY: 'memory',
        WORLDBOOK: 'worldbook',
        GENERATE: 'generate',
        QUICK: 'quick',
        SETTINGS: 'settings',
    },

    // Bot Token 占位符（用于检查是否被修改）
    TOKEN_PLACEHOLDER: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',

    // 日志目录
    LOG_DIR: 'logs',

    // 默认设置
    DEFAULTS: {
        WSS_PORT: 2333,
        MAX_RESTARTS: 3,
        RESTART_WINDOW_MS: 60000,
    },
};

