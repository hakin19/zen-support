import { Inter } from 'next/font/google';
import React from 'react';

import type { Metadata } from 'next';

import { ApiClientProvider } from '@/components/providers/ApiClientProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aizen vNE - AI-Powered Network Support',
  description:
    'Intelligent network diagnostics and remediation for your business',
  keywords:
    'network diagnostics, AI support, network troubleshooting, IT support',
  authors: [{ name: 'Zen & Zen Network Support' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#000000',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Aizen vNE - AI-Powered Network Support',
    description:
      'Intelligent network diagnostics and remediation for your business',
    type: 'website',
    locale: 'en_US',
    siteName: 'Aizen vNE',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={inter.className}>
        <AuthProvider>
          <ApiClientProvider>
            <div id='app-root' className='min-h-screen bg-background'>
              {children}
            </div>
          </ApiClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
