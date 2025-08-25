import { config } from 'dotenv';
import path from 'path';

// Load main environment variables first
config({ path: path.resolve(__dirname, '../../../.env') });

// Then override with test-specific variables
config({ path: path.resolve(__dirname, '../../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';
