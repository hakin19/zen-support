console.log('🔧 Starting Aizen vNE Device Agent...');
class DeviceAgent {
    #config;
    #isConnected = false;
    constructor(config) {
        this.#config = config;
    }
    async connect() {
        console.log(`Connecting to ${this.#config.apiEndpoint}...`);
        await new Promise(resolve => setTimeout(resolve, 100));
        this.#isConnected = true;
        console.log(`Device ${this.#config.deviceId} connected`);
    }
    get isConnected() {
        return this.#isConnected;
    }
}
const agent = new DeviceAgent({
    deviceId: 'dev-agent-001',
    apiEndpoint: 'http://localhost:3000',
    heartbeatInterval: 30000,
});
agent.connect().catch(console.error);
export { DeviceAgent };
//# sourceMappingURL=index.js.map