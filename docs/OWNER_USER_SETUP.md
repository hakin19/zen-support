# Owner User Setup Guide

## Overview

The Aizen vNE system uses a role-based access control (RBAC) system with three roles:
- **Owner**: Full administrative access, can manage all aspects of the organization
- **Admin**: Can manage most features but cannot delete the organization or change owner
- **Viewer**: Read-only access to the system

## How Owner Users Are Created

### 1. Automatic Assignment (Default Process)

**The first user to sign up for an organization automatically becomes the owner.**

When a new user signs up via the standard signup flow:
1. They create an account at `/signup`
2. The system checks if any users exist for their organization
3. If they are the **first user**, they are automatically assigned the **owner** role
4. All subsequent users are assigned the **viewer** role by default

This is handled by the database trigger `handle_new_user()` which runs automatically when a user signs up.

### 2. Manual Role Assignment

Existing owners can promote other users:
1. Navigate to **Settings** → **User Management**
2. Find the user you want to promote
3. Click the role dropdown and select "Owner"
4. Confirm the change

**Note**: There must always be at least one owner per organization. The system prevents removing the last owner.

## Setting Up Your First Owner

### For New Organizations

1. **Go to the signup page**: http://localhost:3000/signup
2. **Create your account** with:
   - Email address
   - Password (minimum 8 characters)
   - Confirm password
3. **Verify your email** (check your inbox)
4. **Login** at http://localhost:3000/login
5. **You are now the owner!** You'll have full access to:
   - User Management
   - Device Registration
   - Organization Settings
   - Prompt Templates
   - All administrative features

### For Existing Organizations

If your organization already has users but no owner (edge case), run this SQL command in Supabase:

```sql
-- Make the first user of a customer an owner
INSERT INTO user_roles (user_id, customer_id, role, created_by)
SELECT 
    u.id,
    u.customer_id,
    'owner'::user_role,
    u.id
FROM users u
WHERE u.customer_id = 'YOUR_CUSTOMER_ID'
ORDER BY u.created_at ASC
LIMIT 1
ON CONFLICT (user_id, customer_id) 
DO UPDATE SET role = 'owner'::user_role;
```

## Database Schema

The owner role is managed through two tables:

1. **`users` table**: Contains user profile information
2. **`user_roles` table**: Contains role assignments (owner/admin/viewer)

The relationship:
- One user can have one role per customer organization
- The first user automatically gets the owner role
- At least one owner must exist per organization (enforced by database trigger)

## Security Considerations

- **Owner accounts should use strong passwords** and enable 2FA when available
- **Limit the number of owners** to trusted individuals only
- **Regularly audit user roles** in Settings → User Management
- **The last owner cannot be removed** (database constraint protection)

## Troubleshooting

### "Access Denied" Errors

If you're getting access denied errors:
1. Check your role in the database: 
   ```sql
   SELECT * FROM user_roles WHERE user_id = 'YOUR_USER_ID';
   ```
2. Ensure you have the correct role (owner/admin for admin features)

### No Owner Exists

If somehow no owner exists (should not happen):
1. Run the migration: `012_auto_assign_first_owner.sql`
2. This will automatically assign the first user as owner

### Multiple Organizations

If you need to manage multiple organizations:
- Each organization has its own set of users and roles
- You can be an owner in one organization and a viewer in another
- Switch between organizations using the organization selector (if implemented)

## Best Practices

1. **Document who has owner access** in your organization
2. **Use admin role** for day-to-day management instead of owner when possible
3. **Regularly review user roles** and remove unnecessary access
4. **Have at least two owners** for redundancy (but limit total number)
5. **Use invitation system** for adding new users (owners can invite via Settings)

## API Integration

When integrating with the API, the owner role is checked via:
- Middleware: `webPortalAuthMiddleware`
- Role check: `user.role === 'owner'`
- Database function: `has_role_or_higher(customer_id, 'owner'::user_role)`

Example API check:
```typescript
if (!user || user.role !== 'owner') {
  return reply.code(403).send({ 
    error: 'Access denied. Owner role required.' 
  });
}
```