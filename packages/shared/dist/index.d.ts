export interface NetworkDiagnostic {
    id: string;
    timestamp: Date;
    deviceId: string;
    type: DiagnosticType;
    data: Record<string, unknown>;
    status: DiagnosticStatus;
}
export declare enum DiagnosticType {
    PING = "ping",
    TRACEROUTE = "traceroute",
    DNS_LOOKUP = "dns_lookup",
    PORT_SCAN = "port_scan",
    BANDWIDTH_TEST = "bandwidth_test"
}
export declare enum DiagnosticStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed"
}
export declare function generateId(): string;
export declare function isDiagnosticType(value: unknown): value is DiagnosticType;
export declare const API_VERSION: "v1";
export declare const DEFAULT_TIMEOUT = 30000;
//# sourceMappingURL=index.d.ts.map