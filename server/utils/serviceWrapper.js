// utils/serviceWrapper.js
// Service 中间件包装器
//
// 自动为每个 service 方法注入：
//   - logger（方法入口/出口/异常日志）
//   - trace（自动追加子节点到追踪链）
//   - error capture（自动创建错误报告）
//
// 使用方法：
//   module.exports = wrapService(new CharacterService(), "character");
//
// 不改变任何业务逻辑。

const logger = require("./logger");
const trace = require("./trace");
const errorService = require("../services/error");
const runtime = require("../state/runtime");

/**
 * 包装一个 service 实例的所有 async 方法
 * @param {object} instance - service 实例
 * @param {string} serviceName - 模块名（用于日志和错误报告）
 * @returns {object} 包装后的 service
 */
function wrapService(instance, serviceName) {
    const wrapped = {};
    const proto = Object.getPrototypeOf(instance);

    for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === "constructor") continue;

        const originalFn = proto[key];
        if (typeof originalFn !== "function") continue;

        wrapped[key] = async function (...args) {
            // 解析 chatId（通常第一个参数，回退查找）
            const chatId = typeof args[0] === "number" ? args[0] : null;

            // 从 runtime 获取 traceId
            let traceId = null;
            if (chatId) {
                const rt = runtime.get(chatId);
                if (rt && rt.traceId) {
                    traceId = rt.traceId;
                }
            }

            // trace 自动注入子节点
            if (traceId) {
                trace.addChild(traceId, "service", serviceName + "." + key, { args });
            }

            logger.debug(serviceName, "[" + (traceId || "no-trace") + "] " + key + "()");

            let result;
            try {
                result = await originalFn.apply(instance, args);
            } catch (error) {
                // 自动错误报告
                const reportContext = { service: serviceName, method: key, args };
                errorService.createReportSync(error, serviceName, key, reportContext);
                if (traceId) {
                    trace.markError(traceId, error);
                }
                logger.error(serviceName, key + "() 失败: " + error.message);

                // 清除 runtime 中的 traceId 关联（失败后不再追踪）
                if (chatId) {
                    const rt = runtime.get(chatId);
                    if (rt && rt.traceId === traceId) {
                        rt.traceId = null;
                    }
                }

                throw error;
            }

            logger.debug(serviceName, "[" + (traceId || "no-trace") + "] " + key + "() 完成");
            return result;
        };
    }

    // 复制非函数属性（如 STATUS 常量）
    for (const key of Object.keys(instance)) {
        if (!(key in wrapped)) {
            wrapped[key] = instance[key];
        }
    }

    return wrapped;
}

module.exports = { wrapService };
