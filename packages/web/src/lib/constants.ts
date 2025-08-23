/**
 * Aizen vNE Web Portal Constants
 * Configuration and constants for the web application
 */

export const APP_CONFIG = {
  name: 'Aizen vNE',
  description: 'AI-powered Virtual Network Engineer',
  version: '1.0.0',
  api: {
    baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000',
    timeout: 30_000,
  },
  websocket: {
    reconnectAttempts: 5,
    reconnectDelay: 3_000,
  },
} as const;

export const ROUTES = {
  home: '/',
  dashboard: '/dashboard',
  login: '/auth/login',
  diagnostics: '/diagnostics',
  settings: '/settings',
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];
