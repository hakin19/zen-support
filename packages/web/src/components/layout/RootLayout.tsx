'use client';

import React from 'react';

interface RootLayoutProps {
  children: React.ReactNode;
}

export function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang='en' suppressHydrationWarning>
      <head />
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
