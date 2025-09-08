import React from 'react';

export default function HomePage(): React.ReactElement {
  return (
    <div className='flex items-center justify-center min-h-screen'>
      <div className='text-center'>
        <h1 className='text-4xl font-bold mb-4'>Welcome to Aizen vNE</h1>
        <p className='text-lg text-muted-foreground'>
          AI-Powered Network Support Portal
        </p>
      </div>
    </div>
  );
}
