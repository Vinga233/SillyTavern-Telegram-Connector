// utils/debugTrace.js
// 调试追踪工具 — 将诊断日志写入 logs/debug/ 供事后分析
//
// 与 trace.js 的区别：
//   trace.js → 请求链追踪（内存中的树结构）
//   debugTrace.js → 平面日志 + 文件持久化（logs/debug/）
//
// 用法：
//   const dt = require('./debugTrace');
//   dt.log('switchchar', 'command_received', chatId, { command, args });

'use strict';

const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '..', 'logs', 'debug');

function ensureDir() {
    if (!fs.existsSync(DEBUG_DIR)) {
        fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
}

function log(module, event, chatId, payload) {
    ensureDir();
    const timestamp = new Date().toISOString();
    const line = [
        timestamp,
        module,
        event,
        chatId ?? '-',
        payload ? JSON.stringify(payload) : '-',
    ].join(' | ');

    const dateStr = timestamp.slice(0, 10);
    const filePath = path.join(DEBUG_DIR, `debug-${dateStr}.log`);
    try {
        fs.appendFileSync(filePath, line + '\n', 'utf8');
    } catch (_) {}
}

function query(moduleFilter, dateStr) {
    const d = dateStr || new Date().toISOString().slice(0, 10);
    const filePath = path.join(DEBUG_DIR, `debug-${d}.log`);
    if (!fs.existsSync(filePath)) return [];
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        if (moduleFilter) {
            return lines.filter(l => l.includes(` | ${moduleFilter} | `));
        }
        return lines;
    } catch {
        return [];
    }
}

function queryByChat(chatId, dateStr) {
    const all = query(null, dateStr);
    return all.filter(l => l.includes(` | ${chatId} | `) || l.includes(` | ${String(chatId)} | `));
}

module.exports = { log, query, queryByChat };
