#!/usr/bin/env node

import { query } from '@anthropic-ai/claude-code';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../.env') });

async function testSDK() {
  console.log('Testing Claude SDK directly...');
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
  console.log('API Key length:', process.env.ANTHROPIC_API_KEY?.length);

  try {
    const options = {
      model: 'claude-3-5-sonnet-20241022',
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        PATH: process.env.PATH,
      },
      maxTurns: 1,
    };

    console.log('Calling SDK with options:', {
      model: options.model,
      hasApiKey: !!options.env.ANTHROPIC_API_KEY,
      keyPrefix: options.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...',
    });

    const response = query({
      prompt: 'Say "Hello, I am working!" in exactly 5 words.',
      options,
    });

    console.log('SDK query created, waiting for response...');

    for await (const message of response) {
      console.log('Message received:', {
        type: message.type,
        content: message.type === 'assistant' ? message.message?.content : undefined,
      });

      if (message.type === 'result') {
        console.log('Result:', message.result);
        break;
      }
    }
  } catch (error) {
    console.error('Error calling SDK:', error);
    console.error('Error stack:', error.stack);
  }
}

testSDK().catch(console.error);