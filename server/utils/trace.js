// utils/trace.js
// 请求链追踪系统
//
// 每次 Telegram 操作生成一条追踪链：
//   TG-20260725-0001 → messages.js (user_message)
//     ├─ commands.js (/switchchar Seraphina)
//     └─ services/character.js
//
// 错误发生时将 traceId 绑定到错误报告

const logger = require('./logger');

let _counter = 0;

/**
 * 生成唯一 traceId
 * 格式: TG-YYYYMMDD-xxxx
 */
function generateId() {
    _counter++;
    const now = new Date();
    const dateStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('');
    const seq = String(_counter).padStart(4, '0');
    return `TG-${dateStr}-${seq}`;
}

// 当前活跃的追踪链 Trace<traceId, ChainNode>
const _activeTraces = new Map();

/**
 * 创建追踪节点
 */
function createNode(type, detail, metadata = {}) {
    return {
        traceId: null,
        type,              // 'message' | 'command' | 'callback' | 'service' | 'st_event'
        detail,            // 操作描述
        metadata,          // { userId, chatId, character, ... }
        timestamp: Date.now(),
        children: [],
        parent: null,
        error: null,
    };
}

/**
 * 开始一条新的追踪链
 * @param {string} type - 节点类型
 * @param {string} detail - 操作描述
 * @param {object} metadata - { userId, chatId, ... }
 * @returns {string} traceId
 */
function startTrace(type, detail, metadata = {}) {
    const traceId = generateId();
    const root = createNode(type, detail, metadata);
    root.traceId = traceId;
    _activeTraces.set(traceId, root);
    logger.debug('trace', `[START] ${traceId} ${type}:${detail}`);
    return traceId;
}

/**
 * 在已有追踪链上追加子节点
 * @param {string} traceId
 * @param {string} type
 * @param {string} detail
 * @param {object} metadata
 * @returns {string} traceId
 */
function addChild(traceId, type, detail, metadata = {}) {
    const parent = _activeTraces.get(traceId);
    if (!parent) return null;

    const child = createNode(type, detail, metadata);
    child.traceId = traceId;
    child.parent = parent;
    parent.children.push(child);
    logger.debug('trace', `[CHILD] ${traceId} → ${type}:${detail}`);
    return traceId;
}

/**
 * 在追踪链上标记错误
 */
function markError(traceId, error) {
    const root = _activeTraces.get(traceId);
    if (root) {
        root.error = {
            message: error?.message || String(error),
            timestamp: Date.now(),
        };
    }
}

/**
 * 获取完整追踪链
 * @returns {object|null} { traceId, root, chain: [...] }
 */
function getTrace(traceId) {
    const root = _activeTraces.get(traceId);
    if (!root) return null;

    // 展平为链
    const chain = [];
    function flatten(node, depth = 0) {
        chain.push({
            depth,
            type: node.type,
            detail: node.detail,
            metadata: node.metadata,
            timestamp: node.timestamp,
            error: node.error,
        });
        for (const child of node.children) {
            flatten(child, depth + 1);
        }
    }
    flatten(root);

    return {
        traceId,
        root: {
            type: root.type,
            detail: root.detail,
            metadata: root.metadata,
            timestamp: root.timestamp,
        },
        chain,
        hasError: root.error !== null,
        duration: Date.now() - root.timestamp,
    };
}

/**
 * 结束追踪链并返回完整信息（自动清理）
 */
function endTrace(traceId) {
    const trace = getTrace(traceId);
    if (trace) {
        _activeTraces.delete(traceId);
        logger.debug('trace', `[END] ${traceId} duration=${trace.duration}ms`);
    }
    return trace;
}

/**
 * 清理过期追踪（超过 30 分钟）
 */
function cleanExpired() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [id, root] of _activeTraces) {
        if (now - root.timestamp > maxAge) {
            _activeTraces.delete(id);
            logger.debug('trace', `[CLEAN] ${id} 已过期`);
        }
    }
}

// 每分钟清理一次
setInterval(cleanExpired, 60 * 1000);

module.exports = {
    startTrace,
    addChild,
    markError,
    getTrace,
    endTrace,
    generateId,
};
