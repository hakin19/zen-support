import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (ClassValue | undefined)[]): string {
  return twMerge(
    clsx(inputs.filter((input): input is ClassValue => input !== undefined))
  );
}
