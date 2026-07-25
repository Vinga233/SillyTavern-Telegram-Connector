// services/metrics.js
// 请求指标收集
//
// 记录 WebSocket request/response 统计数据。
// 纯观测，不改变任何业务逻辑。

class MetricsService {
    constructor() {
        this._reset();
    }

    _reset() {
        this.total = 0;
        this.success = 0;
        this.failed = 0;
        this.timeout = 0;
        this.totalLatency = 0;
        this._actionStats = {};
        this._errorCount = 0;
    }

    recordRequest(action) {
        this.total++;
        if (!this._actionStats[action]) {
            this._actionStats[action] = { total: 0, success: 0, failed: 0, timeout: 0, totalLatency: 0 };
        }
        this._actionStats[action].total++;
    }

    recordSuccess(action, latencyMs) {
        this.success++;
        this.totalLatency += latencyMs;
        if (this._actionStats[action]) {
            this._actionStats[action].success++;
            this._actionStats[action].totalLatency += latencyMs;
        }
    }

    recordError(action) {
        this.failed++;
        if (this._actionStats[action]) {
            this._actionStats[action].failed++;
        }
    }

    recordTimeout(action) {
        this.timeout++;
        if (this._actionStats[action]) {
            this._actionStats[action].timeout++;
        }
    }

    /**
     * 获取统计数据（实时引用，用于内部读取）
     */
    getStats() {
        const avgLatency = this.success > 0 ? Math.round(this.totalLatency / this.success) : 0;
        const actions = Object.entries(this._actionStats).map(function(entry) {
            var action = entry[0];
            var s = entry[1];
            return {
                action: action,
                total: s.total,
                success: s.success,
                failed: s.failed,
                timeout: s.timeout,
                avgLatency: s.success > 0 ? Math.round(s.totalLatency / s.success) : 0,
            };
        });

        return {
            total: this.total,
            success: this.success,
            failed: this.failed,
            timeout: this.timeout,
            avgLatency: avgLatency,
            actions: actions,
        };
    }

    /**
     * 获取快照（深拷贝，外部修改不影响内部计数）
     */
    snapshot() {
        var s = this.getStats();
        return JSON.parse(JSON.stringify(s));
    }

    /**
     * 获取系统健康状态摘要
     * @param {object} stService - SillyTavernService 实例（用于检查连接和 pending 请求）
     */
    getHealth(stService) {
        var stConnected = stService && typeof stService.isConnected === "function" ? stService.isConnected() : false;
        var pendingCount = stService && stService._pendingRequests ? stService._pendingRequests.size : 0;
        var status = "normal";

        if (!stConnected) status = "degraded";
        if (this.timeout > 10) status = "degraded";
        if (pendingCount > 5) status = "busy";

        return {
            status: status,
            checks: {
                stConnected: stConnected,
                pendingRequests: pendingCount,
                totalRequests: this.total,
                timeoutRate: this.total > 0 ? (this.timeout / this.total * 100).toFixed(1) + "%" : "0%",
            },
        };
    }

    reset() {
        this._reset();
    }

    getErrorCount() {
        return this._errorCount;
    }
}

module.exports = new MetricsService();
