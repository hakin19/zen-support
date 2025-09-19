import { NextResponse } from 'next/server';

import type { SignOutScope } from '@/lib/auth/types';
import type { NextRequest } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';

interface SignOutBody {
  scope?: SignOutScope;
}

export async function POST(request: NextRequest): Promise<Response> {
  let scope: SignOutScope = 'local';

  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = (await request.json()) as SignOutBody;
      if (body.scope) {
        scope = body.scope;
      }
    }
  } catch {
    // Ignore body parsing errors and fall back to default scope
  }

  try {
    const supabase = createServerClient();
    const { error } = await supabase.auth.signOut({ scope });

    if (error) {
      return NextResponse.json(
        { error: error.message ?? 'Failed to sign out.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected sign out error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
