"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIMEOUT = exports.API_VERSION = exports.DiagnosticStatus = exports.DiagnosticType = void 0;
exports.generateId = generateId;
exports.isDiagnosticType = isDiagnosticType;
var DiagnosticType;
(function (DiagnosticType) {
    DiagnosticType["PING"] = "ping";
    DiagnosticType["TRACEROUTE"] = "traceroute";
    DiagnosticType["DNS_LOOKUP"] = "dns_lookup";
    DiagnosticType["PORT_SCAN"] = "port_scan";
    DiagnosticType["BANDWIDTH_TEST"] = "bandwidth_test";
})(DiagnosticType || (exports.DiagnosticType = DiagnosticType = {}));
var DiagnosticStatus;
(function (DiagnosticStatus) {
    DiagnosticStatus["PENDING"] = "pending";
    DiagnosticStatus["IN_PROGRESS"] = "in_progress";
    DiagnosticStatus["COMPLETED"] = "completed";
    DiagnosticStatus["FAILED"] = "failed";
})(DiagnosticStatus || (exports.DiagnosticStatus = DiagnosticStatus = {}));
function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const segments = [8, 4, 4, 12];
    return segments
        .map(length => Array.from({ length }, () => chars.at(Math.floor(Math.random() * chars.length))).join(''))
        .join('-');
}
function isDiagnosticType(value) {
    return typeof value === 'string' &&
        Object.values(DiagnosticType).includes(value);
}
exports.API_VERSION = 'v1';
exports.DEFAULT_TIMEOUT = 30_000;
//# sourceMappingURL=index.js.map