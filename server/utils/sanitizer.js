// utils/sanitizer.js
// 敏感信息过滤器
// 自动脱敏：Token、API Key、密码、用户路径、env 变量

const SENSITIVE_KEY_PATTERNS = [
    /token/i,
    /secret/i,
    /password/i,
    /api.?key/i,
    /apikey/i,
    /credential/i,
    /auth/i,
    /private/i,
];

const SENSITIVE_VALUE_PATTERNS = [
    // Telegram Bot Token: 123456:ABCdefGHIjklmNOPqrstUVwxyz
    { pattern: /\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, replacement: '***BOT_TOKEN***' },
    // API Key: sk-xxx...
    { pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, replacement: '***API_KEY***' },
    // Base64-like long strings
    { pattern: /\b[A-Za-z0-9+/=]{40,}\b/g, replacement: '***BASE64***' },
];

const PATH_PATTERNS = [
    // Windows: \Users\Username
    { pattern: /\\(Users|Documents|Desktop|AppData)\\[^\\":*?"<>|]+/gi, replacement: '\\$1\\***USER***' },
    // Linux: /home/username
    { pattern: /\/home\/[^/":*?"<>|]+/gi, replacement: '/home/***USER***' },
];

// 配置项路径 — 报告生成时代替实际路径
function sanitizePath(filepath) {
    let result = filepath.replace(/\\/g, '/');
    for (const { pattern, replacement } of PATH_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

// 栈追踪 — 脱敏路径
function sanitizeStack(stack) {
    if (!stack) return '';
    let result = stack;
    for (const { pattern, replacement } of PATH_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    // 缩短 node_modules 路径
    result = result.replace(/[^\s]*\/node_modules\//g, '***/node_modules/');
    return result;
}

// 值级脱敏
function sanitizeValue(value) {
    if (typeof value !== 'string') return value;
    let result = value;
    for (const { pattern, replacement } of SENSITIVE_VALUE_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

// 递归脱敏对象
function sanitize(obj, depth = 0) {
    if (depth > 10) return '[MAX_DEPTH]';
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') return sanitizeValue(obj);
    if (typeof obj !== 'object') return obj;

    if (obj instanceof Error) {
        return {
            message: sanitizeValue(obj.message),
            stack: sanitizeStack(obj.stack),
            name: obj.name,
        };
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item, depth + 1));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        // Key 匹配敏感词 → 值标记为已脱敏
        if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
            result[key] = typeof value === 'string' && value.length > 0 ? '***REDACTED***' : value;
            continue;
        }
        result[key] = sanitize(value, depth + 1);
    }
    return result;
}

module.exports = { sanitize, sanitizeStack, sanitizePath, sanitizeValue };
