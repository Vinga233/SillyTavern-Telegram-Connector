// utils/logger.js
// 文件日志系统，按模块分类输出到不同文件

const fs = require('fs');
const path = require('path');
const constants = require('../config/constants');

const LOG_DIR = path.join(__dirname, '..', constants.LOG_DIR);

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getDateStr() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
}

function writeLog(filename, level, message) {
    const timestamp = getTimestamp();
    const line = `[${timestamp}] [${level}] ${message}\n`;
    const filepath = path.join(LOG_DIR, filename);
    fs.appendFileSync(filepath, line, 'utf8');
}

const logger = {
    info(category, ...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        writeLog(`${category}.${getDateStr()}.log`, 'INFO', msg);
        console.log(`[${getTimestamp()}] ${msg}`);
    },
    warn(category, ...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        writeLog(`${category}.${getDateStr()}.log`, 'WARN', msg);
        console.warn(`[${getTimestamp()}] [WARN] ${msg}`);
    },
    error(category, ...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        writeLog(`error.${getDateStr()}.log`, 'ERROR', msg);
        writeLog(`${category}.${getDateStr()}.log`, 'ERROR', msg);
        console.error(`[${getTimestamp()}] [ERROR] ${msg}`);
    },
    debug(category, ...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        writeLog(`debug.${getDateStr()}.log`, 'DEBUG', msg);
    },
};

module.exports = logger;
