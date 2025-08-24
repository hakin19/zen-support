interface DeviceConfig {
    readonly deviceId: string;
    readonly apiEndpoint: string;
    readonly heartbeatInterval: number;
}
declare class DeviceAgent {
    #private;
    constructor(config: DeviceConfig);
    connect(): Promise<void>;
    get isConnected(): boolean;
}
export { DeviceAgent, type DeviceConfig };
//# sourceMappingURL=index.d.ts.map