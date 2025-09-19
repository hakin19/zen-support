# Supabase Authentication Guide (Login/Logout)

## Overview

This guide provides comprehensive documentation for implementing authentication (login/logout) using Supabase in the Zen & Zen Network Support (Aizen vNE) project. The project uses Supabase JS v2.57.x and Supabase SSR v0.7.0 for authentication across the monorepo.

## Supabase Version Information

### Client Libraries Used

- **@supabase/supabase-js**: v2.57.0 - v2.57.2
- **@supabase/ssr**: v0.7.0 (for Next.js SSR support)

### Hosted Supabase Platform (2025)

The hosted Supabase platform receives continuous updates with new features throughout 2025. Recent updates include:

- Enhanced routing behavior for Data API requests (April 2025)
- New Edge Functions dashboard capabilities
- Native API for running AI models within functions
- S3 protocol support for Storage

## Authentication Methods

### 1. Email and Password Authentication

#### Sign In with Email/Password

```javascript
// JavaScript/TypeScript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://your-project.supabase.co', 'your-anon-key');

async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error('Login failed:', error.message);
    return null;
  }

  return data.user;
}
```

#### Sign Up with Email/Password

```javascript
async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    console.error('Sign up failed:', error.message);
    return null;
  }

  // Check if email confirmation is required
  if (data.user && !data.session) {
    console.log('Please check your email for confirmation');
  }

  return data.user;
}
```

### 2. Magic Link (Passwordless) Authentication

#### Send Magic Link

```javascript
async function signInWithMagicLink(email) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email: email,
    options: {
      // Prevent automatic user creation if email doesn't exist
      shouldCreateUser: false,
      // Redirect URL after clicking the magic link
      emailRedirectTo: 'https://example.com/dashboard',
    },
  });

  if (error) {
    console.error('Magic link failed:', error.message);
    return false;
  }

  console.log('Check your email for the login link!');
  return true;
}
```

### 3. OAuth/Social Login

#### Sign In with OAuth Provider

```javascript
// Example with Google OAuth
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'http://localhost:3000/auth/callback',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (data.url) {
    window.location.href = data.url; // Redirect to OAuth provider
  }
}

// Other supported providers: github, gitlab, azure, facebook, discord, etc.
```

### 4. Anonymous Sign In

```javascript
async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error('Anonymous sign in failed:', error.message);
    return null;
  }

  return data.user; // Temporary anonymous user
}
```

## Sign Out Implementation

### Basic Sign Out

```javascript
async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out failed:', error.message);
    return false;
  }

  console.log('Successfully signed out');
  return true;
}
```

### Sign Out with Scope Options

```javascript
// Sign out from all sessions across all devices
async function signOutGlobally() {
  await supabase.auth.signOut({ scope: 'global' });
}

// Sign out only from current session
async function signOutLocal() {
  await supabase.auth.signOut({ scope: 'local' });
}

// Sign out from all other sessions except current
async function signOutOthers() {
  await supabase.auth.signOut({ scope: 'others' });
}
```

## Next.js SSR Implementation

### Server-Side Client Setup

```typescript
// app/utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Handle cookie setting errors in Server Components
          }
        },
      },
    }
  );
}
```

### Client-Side Setup

```typescript
// app/utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Authentication in Server Components

```typescript
// app/dashboard/page.tsx
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div>
      <h1>Welcome, {user.email}</h1>
      {/* Dashboard content */}
    </div>
  )
}
```

### Authentication in Client Components

```typescript
// app/components/LoginForm.tsx
'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      alert(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Loading...' : 'Sign In'}
      </button>
    </form>
  )
}
```

## Session Management

### Get Current User

```javascript
// Client-side
async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    console.log('No authenticated user');
    return null;
  }

  return user;
}
```

### Get Current Session

```javascript
async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    console.log('No active session');
    return null;
  }

  return session;
}
```

### Listen to Auth State Changes

```javascript
// Set up auth state listener
const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event);

  switch (event) {
    case 'INITIAL_SESSION':
      // Handle initial session
      break;
    case 'SIGNED_IN':
      // Handle sign in
      console.log('User signed in:', session?.user.email);
      break;
    case 'SIGNED_OUT':
      // Handle sign out
      console.log('User signed out');
      break;
    case 'TOKEN_REFRESHED':
      // Handle token refresh
      console.log('Session refreshed');
      break;
    case 'USER_UPDATED':
      // Handle user metadata update
      break;
  }
});

// Clean up subscription when done
subscription.unsubscribe();
```

## Error Handling

### Common Authentication Errors

```javascript
async function handleAuthWithErrorHandling(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      switch (error.status) {
        case 400:
          if (error.message.includes('Email not confirmed')) {
            return { error: 'Please verify your email before signing in' };
          }
          if (error.message.includes('Invalid login credentials')) {
            return { error: 'Invalid email or password' };
          }
          break;
        case 422:
          return { error: 'Email and password are required' };
        case 429:
          return { error: 'Too many login attempts. Please try again later' };
        default:
          return { error: error.message };
      }
    }

    return { user: data.user };
  } catch (err) {
    console.error('Unexpected error:', err);
    return { error: 'An unexpected error occurred' };
  }
}
```

## Security Best Practices

### 1. Environment Variables

Always store Supabase credentials in environment variables:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key # Never expose this client-side
```

### 2. Row Level Security (RLS)

Ensure RLS is enabled on all tables:

```sql
-- Enable RLS on a table
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view own data" ON your_table
  FOR SELECT USING (auth.uid() = user_id);
```

### 3. Session Validation

Always validate sessions server-side:

```javascript
// Server-side validation
async function validateSession(supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  // Additional validation logic
  return user;
}
```

### 4. Secure Cookie Configuration

Configure secure cookies for production:

```javascript
const supabase = createServerClient(url, key, {
  cookies: {
    // ... cookie handlers
  },
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});
```

## Testing Authentication

### Example Test Cases

```javascript
// Jest/Vitest test example
import { createClient } from '@supabase/supabase-js';

describe('Authentication', () => {
  let supabase;

  beforeEach(() => {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  });

  test('should sign in with valid credentials', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'testpassword123',
    });

    expect(error).toBeNull();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('test@example.com');
  });

  test('should fail with invalid credentials', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(error).toBeDefined();
    expect(error.message).toContain('Invalid login credentials');
    expect(data.user).toBeNull();
  });

  test('should sign out successfully', async () => {
    // First sign in
    await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'testpassword123',
    });

    // Then sign out
    const { error } = await supabase.auth.signOut();

    expect(error).toBeNull();

    // Verify no active session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    expect(session).toBeNull();
  });
});
```

## Troubleshooting Common Issues

### 1. "Email not confirmed" Error

- Ensure email confirmation is enabled/disabled in Supabase Dashboard
- Check spam folder for confirmation emails
- Use `supabase.auth.resend()` to resend confirmation

### 2. Session Not Persisting

- Check cookie configuration in SSR setup
- Ensure cookies are properly set in both request and response
- Verify `sameSite` and `secure` cookie settings

### 3. OAuth Redirect Issues

- Verify redirect URLs in Supabase Dashboard
- Ensure callback URL is added to allowed URLs
- Check for URL encoding issues

### 4. Token Refresh Failures

- Monitor `TOKEN_REFRESHED` events
- Implement retry logic for network failures
- Check token expiry settings in Supabase Dashboard

## Migration from Supabase Auth v1 to v2

### Key Changes

1. **Sign In Methods**:
   - v1: `supabase.auth.signIn({ email, password })`
   - v2: `supabase.auth.signInWithPassword({ email, password })`

2. **Magic Links**:
   - v1: `supabase.auth.signIn({ email })`
   - v2: `supabase.auth.signInWithOtp({ email })`

3. **Response Structure**:
   - v1: Returns `{ user, session, error }`
   - v2: Returns `{ data: { user, session }, error }`

## Additional Resources

- [Official Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase SSR Package Documentation](https://github.com/supabase/ssr)
- [Next.js + Supabase Auth Guide](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [OAuth Provider Setup](https://supabase.com/docs/guides/auth/social-login)

## Support

For issues specific to the Zen & Zen Network Support project:

- Check the project's CLAUDE.md for development guidelines
- Review existing authentication implementations in `packages/api/` and `packages/web/`
- Ensure compliance with the project's security requirements for HITL approval and MFA
