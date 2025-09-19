'use client';

import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';

import type { ComponentProps } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export type LogoutScope = 'local' | 'others' | 'global';

interface LogoutButtonProps
  extends Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> {
  scope?: LogoutScope;
  label?: React.ReactNode;
}

export function LogoutButton({
  scope = 'local',
  label = 'Sign out',
  variant = 'outline',
  size = 'sm',
  className,
  ...buttonProps
}: LogoutButtonProps): React.ReactElement {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await signOut(scope);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to sign out';
      toast({
        variant: 'destructive',
        title: 'Sign out failed',
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type='button'
      variant={variant}
      size={size}
      className={className}
      disabled={loading}
      onClick={() => void handleSignOut()}
      {...buttonProps}
    >
      {loading ? (
        <>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          Signing out...
        </>
      ) : (
        label
      )}
    </Button>
  );
}
