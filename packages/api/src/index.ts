/**
 * Aizen vNE API Backend Service
 * Main entry point for the API service (Fastify)
 */

import { startApp } from './server.js';

async function main(): Promise<void> {
  try {
    await startApp();
  } catch (err) {
    console.error('Failed to start API service', err);
    process.exit(1);
  }
}

void main();
