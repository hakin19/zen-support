import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { User } from '@supabase/supabase-js';

import { createServerClient } from '@/lib/supabase/server';

export async function requireServerUser(): Promise<User> {
  const cookieStore = cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.endsWith('-auth-token'));

  if (!hasAuthCookie) {
    redirect('/login');
  }

  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      redirect('/login');
    }

    return user;
  } catch {
    redirect('/login');
  }
}
