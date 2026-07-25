// utils/reporter.js
// 错误报告文件管理
// 保存 JSON 报告到 logs/reports/，支持读取和列表

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { sanitize, sanitizeStack } = require('./sanitizer');

const REPORTS_DIR = path.join(__dirname, '..', 'logs', 'reports');

// 确保目录存在
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// 项目版本（从 git 获取，取不到则用 unknown）
let _projectVersion = 'unknown';
try {
    const gitHead = path.join(__dirname, '..', '..', '.git', 'HEAD');
    if (fs.existsSync(gitHead)) {
        const ref = fs.readFileSync(gitHead, 'utf8').trim();
        if (ref.startsWith('ref: ')) {
            const refPath = path.join(__dirname, '..', '..', '.git', ref.slice(5));
            if (fs.existsSync(refPath)) {
                _projectVersion = fs.readFileSync(refPath, 'utf8').trim().substring(0, 8);
            }
        } else {
            _projectVersion = ref.substring(0, 8);
        }
    }
} catch (_) { /* ignore */ }

/**
 * 保存错误报告
 * @param {object} report - 完整错误报告
 * @returns {string} 文件名
 */
function saveReport(report) {
    const safeReport = {
        errorId: report.errorId,
        traceId: report.traceId || null,
        timestamp: report.timestamp,
        version: _projectVersion,
        module: report.module,
        action: report.action,
        message: report.message,
        stack: sanitizeStack(report.stack || ''),
        context: sanitize(report.context || {}),
        stStatus: report.stStatus || null,
        suggestion: report.suggestion || null,
        resolved: false,
        resolvedAt: null,
    };

    const filename = `${report.errorId}.json`;
    const filepath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(safeReport, null, 2) + '\n', 'utf8');
    logger.info('reporter', `错误报告已保存: ${filename}`);
    return filename;
}

/**
 * 列出最近 N 条报告
 */
function listReports(limit = 10) {
    try {
        if (!fs.existsSync(REPORTS_DIR)) return [];
        return fs.readdirSync(REPORTS_DIR)
            .filter(f => f.endsWith('.json') && f.startsWith('ST-'))
            .sort()
            .reverse()
            .slice(0, limit)
            .map(f => {
                try {
                    const filepath = path.join(REPORTS_DIR, f);
                    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * 按 errorId 读取单个报告
 */
function getReport(errorId) {
    try {
        const filepath = path.join(REPORTS_DIR, `${errorId}.json`);
        if (!fs.existsSync(filepath)) return null;
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * 获取报告数量统计
 */
function getReportStats() {
    try {
        const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.json'));
        return {
            total: files.length,
            recent: listReports(5).length,
        };
    } catch {
        return { total: 0, recent: 0 };
    }
}

module.exports = { saveReport, listReports, getReport, getReportStats };
