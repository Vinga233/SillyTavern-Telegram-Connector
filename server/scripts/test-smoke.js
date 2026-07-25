// scripts/test-smoke.js
// V1.7.1 Smoke Test
// 运行方式: node server/scripts/test-smoke.js

const path = require("path");
var serverRoot = path.resolve(__dirname, "..");

function req(relPath) {
    return require(path.join(serverRoot, relPath));
}

var passed = 0;
var failed = 0;

function assert(cond, msg) {
    if (cond) {
        console.log("  \u2705 " + msg);
        passed++;
    } else {
        console.log("  \u274C " + msg);
        failed++;
    }
}

console.log("");
console.log("=== V1.7.1 Smoke Test ===");
console.log("");

// ========================
// 1. Runtime State Machine
// ========================
console.log("[Runtime]");

var runtime = req("./state/runtime");

assert(runtime.getStatus(999) === runtime.STATUS.IDLE, "initial status is idle");
assert(runtime.isGenerating(999) === false, "not generating when idle");
assert(runtime.isFinalized(999) === false, "not finalized when idle");

runtime.startGeneration(999, 1);
assert(runtime.getStatus(999) === runtime.STATUS.GENERATING, "startGeneration -> generating");
assert(runtime.isGenerating(999) === true, "isGenerating true after start");

runtime.startStreaming(999, 12345);
assert(runtime.getStatus(999) === runtime.STATUS.STREAMING, "startStreaming -> streaming");
runtime.updateStream(999, "test message");
assert(runtime.get(999).generation.lastText === "test message", "updateStream updates text");

runtime.startFinalizing(999);
assert(runtime.getStatus(999) === runtime.STATUS.FINALIZING, "startFinalizing -> finalizing");
assert(runtime.isGenerating(999) === true, "still generating during finalizing");

runtime.completeGeneration(999);
assert(runtime.getStatus(999) === runtime.STATUS.COMPLETED, "completeGeneration -> completed");
assert(runtime.isGenerating(999) === false, "not generating after complete");
assert(runtime.isFinalized(999) === true, "finalized flag set");

runtime.completeGeneration(999);
assert(runtime.getStatus(999) === runtime.STATUS.COMPLETED, "double completeGeneration safe");

runtime.reset(999);
assert(runtime.getStatus(999) === runtime.STATUS.IDLE, "reset -> idle");
assert(runtime.isFinalized(999) === false, "finalized cleared after reset");

runtime.startGeneration(998, 2);
runtime.failGeneration(998);
assert(runtime.getStatus(998) === runtime.STATUS.FAILED, "failGeneration -> failed");

runtime.startGeneration(997, 3);
var entries = runtime.getAllEntries();
assert(entries.length >= 2, "getAllEntries returns entries");

runtime.setTraceId(997, "TG-TEST-0001");
assert(runtime.get(997).traceId === "TG-TEST-0001", "setTraceId stores traceId");

var active = runtime.getActiveGenerations();
assert(typeof active.length === "number", "getActiveGenerations works");

runtime.startGeneration(996, 4);
var stuck = runtime._entries.get(996);
stuck.generation.startTime = Date.now() - 310000;
var result = runtime.cleanupExpired();
assert(runtime.getStatus(996) === runtime.STATUS.FAILED, "stuck generating -> failed after timeout");
assert(result.timeouts.length >= 1, "cleanupExpired reports timeouts");

console.log("");

// ========================
// 2. Metrics
// ========================
console.log("[Metrics]");

var metrics = req("./services/metrics");

metrics.recordRequest("char_info");
metrics.recordRequest("chat_hist");
metrics.recordSuccess("char_info", 250);
metrics.recordSuccess("chat_hist", 150);
metrics.recordTimeout("char_info");
metrics.recordRequest("alt_greet");
metrics.recordError("alt_greet");

var stats = metrics.getStats();
assert(stats.total >= 3, "total requests tracked: " + stats.total);
assert(stats.success === 2, "success count: " + stats.success);
assert(stats.failed === 1, "failed count: " + stats.failed);
assert(stats.timeout === 1, "timeout count: " + stats.timeout);
assert(stats.actions.length >= 3, "per-action breakdown: " + stats.actions.length);

var snap = metrics.snapshot();
assert(snap.total === stats.total, "snapshot matches stats");
snap.total = 999;
assert(metrics.total !== 999, "snapshot mutation does not affect internal state");

var mockST = {
    isConnected: function() { return true; },
    _pendingRequests: { size: 0 },
};
var health = metrics.getHealth(mockST);
assert(health.status === "normal", "health status normal when connected");
assert(health.checks.stConnected === true, "health reports ST connected");

var mockST2 = {
    isConnected: function() { return false; },
    _pendingRequests: { size: 3 },
};
var health2 = metrics.getHealth(mockST2);
assert(health2.status === "degraded", "health status degraded when ST disconnected");

metrics.reset();
assert(metrics.total === 0, "reset clears metrics");

console.log("");

// ========================
// 3. Service Wrapper
// ========================
console.log("[ServiceWrapper]");

var wrapper = req("./utils/serviceWrapper");

var mockService = {
    testMethod: function(chatId, msg) {
        return "hello " + msg;
    },
};
var wrapped = wrapper.wrapService(mockService, "mock");
assert(typeof wrapped.testMethod === "function", "wrapper creates wrapped methods");

console.log("");

// ========================
// Summary
// ========================
console.log("=== Results: " + passed + " passed, " + failed + " failed ===");
if (failed > 0) {
    console.log("SOME TESTS FAILED");
    process.exit(1);
} else {
    console.log("ALL TESTS PASSED");
    process.exit(0);
}
