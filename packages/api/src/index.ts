/**
 * Aizen vNE API Backend Service
 * Main entry point for the API service
 */

console.log('🚀 Starting Aizen vNE API Service...');

// Example of ES2022 features
const config = {
  port: process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3000,
  environment: process.env['NODE_ENV'] ?? 'development',
} as const;

// Example function using strict TypeScript
function startServer(port: number): void {
  console.log(`API server would start on port ${port}`);
  console.log(`Environment: ${config.environment}`);
}

// Initialize the server
startServer(config.port);

export { config };
