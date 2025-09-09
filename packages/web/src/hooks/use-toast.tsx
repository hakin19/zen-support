'use client';

import * as React from 'react';
import { toast as sonnerToast } from 'sonner';

export interface ToastProps {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  action?: React.ReactNode;
}

export function useToast(): { toast: (props: ToastProps) => void } {
  const toast = React.useCallback((props: ToastProps): void => {
    const { title, description, variant = 'default' } = props;
    const message = title ?? description ?? '';

    if (variant === 'destructive') {
      sonnerToast.error(message, {
        description: title ? description : undefined,
      });
    } else {
      sonnerToast.success(message, {
        description: title ? description : undefined,
      });
    }
  }, []);

  return { toast };
}
