console.log('🚀 Starting Aizen vNE API Service...');
const config = {
    port: process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3000,
    environment: process.env['NODE_ENV'] ?? 'development',
};
function startServer(port) {
    console.log(`API server would start on port ${port}`);
    console.log(`Environment: ${config.environment}`);
}
startServer(config.port);
export { config };
//# sourceMappingURL=index.js.map