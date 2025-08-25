import { config } from 'dotenv';
import path from 'path';

// Load test environment variables from project root
config({ path: path.resolve(__dirname, '../../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';
