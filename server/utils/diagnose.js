// utils/diagnose.js
// 诊断包生成器
// 生成系统诊断信息（不含敏感信息），供 /debug 命令和诊断文件使用

const os = require('os');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getReportStats, listReports } = require('./reporter');
const stService = require('../services/sillytavern');
const sessionStore = require('../state/session');

/**
 * 获取项目版本
 */
function _getVersion() {
    try {
        const gitPath = path.join(__dirname, '..', '..', '.git', 'HEAD');
        if (fs.existsSync(gitPath)) {
            const ref = fs.readFileSync(gitPath, 'utf8').trim();
            if (ref.startsWith('ref: ')) {
                const refPath = path.join(__dirname, '..', '..', '.git', ref.slice(5));
                if (fs.existsSync(refPath)) {
                    return fs.readFileSync(refPath, 'utf8').trim().substring(0, 8);
                }
            } else {
                return ref.substring(0, 8);
            }
        }
    } catch (_) {}
    return 'unknown';
}

/**
 * 检查本地端口是否被占用（间接判断服务是否运行）
 */
function _checkPort(port) {
    try {
        const net = require('net');
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(true));  // 端口被占用 = 服务在运行
            server.listen(port, '127.0.0.1', () => {
                server.close();
                resolve(false);  // 端口空闲 = 服务未运行
            });
            setTimeout(() => { server.close(); resolve(false); }, 500);
        });
    } catch {
        return false;
    }
}

/**
 * 生成完整诊断信息
 */
async function generateDiagnose() {
    const stConnected = stService.isConnected();
    const [stPortOpen, tgPortOpen] = await Promise.all([
        _checkPort(stService.port),
        _checkPort(8000),  // SillyTavern
    ]);

    return {
        timestamp: new Date().toISOString(),
        version: _getVersion(),

        system: {
            platform: os.platform(),
            release: os.release(),
            hostname: os.hostname(),
            uptime: Math.floor(os.uptime()),
            totalMemory: `${Math.floor(os.totalmem() / 1024 / 1024)} MB`,
            freeMemory: `${Math.floor(os.freemem() / 1024 / 1024)} MB`,
            cpuCores: os.cpus().length,
        },

        process: {
            node: process.version,
            pid: process.pid,
            uptime: Math.floor(process.uptime()),
            heapUsed: `${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
            heapTotal: `${Math.floor(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        },

        services: {
            connector: {
                status: stConnected ? 'connected' : 'disconnected',
                wsPort: stService.port,
                wsListening: stConnected,
                ongoingStreams: stService.ongoingStreams.size,
            },
            sillytavern: {
                port: 8000,
                portOpen: stPortOpen,
            },
        },

        session: {
            activeUsers: sessionStore.getAll().length,
        },

        errors: {
            stats: getReportStats(),
            recent: listReports(5).map(r => ({
                errorId: r.errorId,
                module: r.module,
                action: r.action,
                message: (r.message || '').substring(0, 80),
                timestamp: r.timestamp,
            })),
        },
    };
}

/**
 * 构建 Telegram 格式的诊断消息
 */
async function buildDebugMessage(chatId) {
    const d = await generateDiagnose();

    const lines = [
        '🔍 Snow AI 诊断报告',
        '',
        `📦 v${d.version}`,
        `⏱ 运行: ${d.process.uptime}秒`,
        `🧠 内存: ${d.process.heapUsed} / ${d.process.heapTotal}`,
        '',
        `🔌 Connector: ${d.services.connector.status === 'connected' ? '✅' : '❌'} 端口 ${d.services.connector.wsPort}`,
        `📡 ST 端口 8000: ${d.services.sillytavern.portOpen ? '✅ 已监听' : '❌ 未监听'}`,
        `🔄 活跃流: ${d.services.connector.ongoingStreams}`,
        '',
        `👤 活跃用户: ${d.session.activeUsers}`,
        `📋 错误报告: ${d.errors.stats.total} 条`,
    ];

    // 追加最近错误
    if (d.errors.recent.length > 0) {
        lines.push('', '📋 最近错误:');
        for (const e of d.errors.recent) {
            lines.push(`  #${e.errorId} [${e.module}] ${e.message}`);
        }
    }

    lines.push('', '💡 /debug save — 保存完整诊断包');
    lines.push('💡 /debug report ID — 查看错误详情');

    return lines.join('\n');
}

/**
 * 保存诊断包到文件
 */
async function saveDiagnoseFile() {
    const diagnose = await generateDiagnose();
    const filename = `diagnose-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const reportsDir = path.join(__dirname, '..', 'logs', 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filepath = path.join(reportsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(diagnose, null, 2) + '\n', 'utf8');
    logger.info('diagnose', `诊断包已保存: ${filename}`);
    return filepath;
}

module.exports = { generateDiagnose, buildDebugMessage, saveDiagnoseFile };
