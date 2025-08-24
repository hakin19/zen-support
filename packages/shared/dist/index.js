export { supabase, supabaseAdmin, createSupabaseClient, auth, db, realtime, storage, } from './lib/supabase';
export * from './types/database.types';
export var DiagnosticType;
(function (DiagnosticType) {
    DiagnosticType["PING"] = "ping";
    DiagnosticType["TRACEROUTE"] = "traceroute";
    DiagnosticType["DNS_LOOKUP"] = "dns_lookup";
    DiagnosticType["PORT_SCAN"] = "port_scan";
    DiagnosticType["BANDWIDTH_TEST"] = "bandwidth_test";
})(DiagnosticType || (DiagnosticType = {}));
export var DiagnosticStatus;
(function (DiagnosticStatus) {
    DiagnosticStatus["PENDING"] = "pending";
    DiagnosticStatus["IN_PROGRESS"] = "in_progress";
    DiagnosticStatus["COMPLETED"] = "completed";
    DiagnosticStatus["FAILED"] = "failed";
})(DiagnosticStatus || (DiagnosticStatus = {}));
export function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const segments = [8, 4, 4, 12];
    return segments
        .map(length => Array.from({ length }, () => chars.at(Math.floor(Math.random() * chars.length))).join(''))
        .join('-');
}
export function isDiagnosticType(value) {
    return (typeof value === 'string' &&
        Object.values(DiagnosticType).includes(value));
}
export const API_VERSION = 'v1';
export const DEFAULT_TIMEOUT = 30_000;
//# sourceMappingURL=index.js.map