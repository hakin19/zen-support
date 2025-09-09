'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      console.log('Signup response:', { data, error });

      if (error) {
        setError(error.message);
        console.error('Signup error:', error);
      } else if (!data.user) {
        setError('Signup failed - no user returned');
      } else {
        setSuccess(true);
        console.log('Signup successful:', data.user.email);
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err) {
      console.error('Signup exception:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted'>
        <div className='w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg text-center'>
          <h2 className='text-2xl font-bold text-green-600'>Success!</h2>
          <p className='text-muted-foreground'>
            Please check your email to confirm your account.
          </p>
          <p className='text-sm text-muted-foreground'>
            Redirecting to login page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted'>
      <div className='w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg'>
        <div className='text-center'>
          <h1 className='text-3xl font-bold'>Create Account</h1>
          <p className='text-muted-foreground mt-2'>Sign up for Aizen vNE</p>
        </div>

        <form onSubmit={handleSignup} className='space-y-4'>
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <Label htmlFor='email'>Email</Label>
            <Input
              id='email'
              type='email'
              placeholder='you@example.com'
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='password'>Password</Label>
            <Input
              id='password'
              type='password'
              placeholder='••••••••'
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='confirmPassword'>Confirm Password</Label>
            <Input
              id='confirmPassword'
              type='password'
              placeholder='••••••••'
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <Button type='submit' className='w-full' disabled={loading}>
            {loading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Creating account...
              </>
            ) : (
              'Sign Up'
            )}
          </Button>
        </form>

        <div className='text-center text-sm'>
          <span className='text-muted-foreground'>
            Already have an account?{' '}
          </span>
          <Link href='/login' className='text-primary hover:underline'>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
