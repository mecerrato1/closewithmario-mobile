# Critical Security Issue: Unauthorized Lead Access on iOS App

## 🚨 Issue Summary

**Severity:** CRITICAL  
**Affected Platform:** iOS Mobile App (closewithmario-mobile)  
**Not Affected:** Web SPA (marios-personal)  
**Discovered:** December 2, 2025

### The Problem

New users who sign up on the iOS app using Google OAuth or email/password authentication can access **ALL leads** in the database, including sensitive customer information. This does not happen on the web app.

## 🔍 Root Cause Analysis

### Why This Happens

The security vulnerability exists due to a **mismatch between client-side role checks and server-side RLS (Row Level Security) policies**:

1. **Client-Side (Mobile App):**
   - The mobile app has role-based access control in `src/lib/roles.ts`
   - The `getUserRole()` function checks if a user is an admin, loan officer, realtor, or buyer
   - The `canSeeAllLeads()` function returns `true` only for super_admin and admin roles
   - **However**, the app still executes the database query regardless of role

2. **Server-Side (Supabase RLS Policies):**
   - The current RLS policies on `leads` and `meta_ads` tables are **email-based**, not role-based
   - They only check if `auth.email()` is in a hardcoded list of admin emails
   - **There is NO catch-all policy to deny access to other authenticated users**
   - This means: If you're authenticated but not in the admin list, you can still read all leads

### Current RLS Policy Structure (VULNERABLE)

```sql
-- Current policy (INSECURE)
CREATE POLICY "Admins can read leads" ON leads
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);
```

**Problem:** This policy allows specific admins to read leads, but doesn't prevent other authenticated users from accessing leads if no other restrictive policies exist.

### Why Web App Doesn't Have This Issue

The web app works correctly because:
1. The hardcoded admin emails in the RLS policies match the actual admin users
2. The web app likely doesn't allow new user signups (only existing admins log in)
3. The web app may have additional server-side checks or different query patterns

## 🛡️ The Fix

### Solution: Role-Based RLS Policies

Replace email-based policies with role-based policies that check:
1. **Super Admins & Admins:** Can see ALL leads (email-based check)
2. **Loan Officers:** Can ONLY see leads where `lo_id` matches their ID in the `loan_officers` table
3. **Realtors:** Can ONLY see leads where `realtor_id` matches their ID in the `realtors` table
4. **Buyers & Others:** Cannot see ANY leads (no matching policy = denied by default)

### New RLS Policy Structure (SECURE)

```sql
-- Policy 1: Admins can read ALL leads
CREATE POLICY "Admins can read all leads" ON leads
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Policy 2: Loan officers can read ONLY their assigned leads
CREATE POLICY "Loan officers can read their leads" ON leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND leads.lo_id = lo.id
  )
);

-- Policy 3: Realtors can read ONLY their assigned leads
CREATE POLICY "Realtors can read their leads" ON leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND leads.realtor_id = r.id
  )
);
```

## 📋 Implementation Steps

### Step 1: Run the Security Fix SQL

1. Open Supabase Dashboard
2. Navigate to SQL Editor
3. Run the SQL script: `docs/FIX_RLS_SECURITY_ISSUE.sql`
4. Verify all policies are created successfully

### Step 2: Test the Fix

#### Test Case 1: New User (Should See NO Leads)
1. Create a new test account using Google OAuth or email/password
2. Log into the iOS app
3. Navigate to the Leads screen
4. **Expected Result:** Zero leads visible

#### Test Case 2: Loan Officer (Should See ONLY Assigned Leads)
1. Create a loan officer record in the `loan_officers` table
2. Link it to a test user account (set `user_id` field)
3. Assign some leads to this loan officer (set `lo_id` field)
4. Log into the iOS app with this account
5. **Expected Result:** Only see leads where `lo_id` matches their ID

#### Test Case 3: Admin (Should See ALL Leads)
1. Log in with an admin email (e.g., mario@closewithmario.com)
2. Navigate to the Leads screen
3. **Expected Result:** See all leads in the database

### Step 3: Verify Web App Still Works

1. Log into the web app (marios-personal)
2. Test all lead management features
3. **Expected Result:** No changes in behavior (should work as before)

## 🔐 Security Best Practices

### Lessons Learned

1. **Never rely solely on client-side role checks for security**
   - Client-side checks are for UX only (hiding UI elements)
   - Server-side RLS policies are the actual security boundary

2. **Always have explicit DENY policies**
   - Don't assume "no matching policy = denied"
   - Create policies for each role explicitly

3. **Use role-based access control, not email-based**
   - Email lists are hard to maintain
   - Role-based checks scale better and are more flexible

4. **Test security with unauthorized accounts**
   - Always test with accounts that should NOT have access
   - Don't just test happy paths with admin accounts

### Recommended Additional Security Measures

1. **Add audit logging:**
   - Log all lead access attempts
   - Track who views/modifies leads

2. **Implement rate limiting:**
   - Prevent bulk data extraction
   - Limit query frequency per user

3. **Add data masking:**
   - Mask sensitive fields (phone, email) for non-admins
   - Only show full data to assigned team members

4. **Regular security audits:**
   - Review RLS policies quarterly
   - Test with penetration testing tools

## 📊 Impact Assessment

### Data Exposure Risk

- **Affected Records:** All leads and meta_ads records
- **Sensitive Data Exposed:**
  - Customer names
  - Phone numbers
  - Email addresses
  - Financial information (credit scores, income, down payments)
  - Property details
  - Personal notes and messages

### Mitigation Timeline

- **Discovery:** December 2, 2025
- **Fix Available:** December 2, 2025 (same day)
- **Deployment:** IMMEDIATE (run SQL script now)
- **Verification:** Within 24 hours

### User Notification

**Recommendation:** 
- Review Supabase audit logs to check if any unauthorized users accessed leads
- If unauthorized access is confirmed, notify affected customers per data breach protocols
- Update privacy policy to reflect security improvements

## 🔄 Related Files

### Files Modified/Created
- `docs/FIX_RLS_SECURITY_ISSUE.sql` - SQL script to fix RLS policies
- `docs/SECURITY_ISSUE_ANALYSIS.md` - This document

### Files to Review
- `src/lib/roles.ts` - Client-side role management (mobile app)
- `App.tsx` - Lead fetching logic (mobile app)
- `docs/UPDATE_DATABASE_POLICIES.sql` - Old RLS policies (outdated)
- `docs/FIX_META_ADS_POLICIES.sql` - Old meta ads policies (outdated)

## ✅ Verification Checklist

- [ ] Run `FIX_RLS_SECURITY_ISSUE.sql` in Supabase SQL Editor
- [ ] Test with new user account (should see zero leads)
- [ ] Test with loan officer account (should see only assigned leads)
- [ ] Test with admin account (should see all leads)
- [ ] Verify web app still works correctly
- [ ] Review Supabase audit logs for unauthorized access
- [ ] Update team on security fix
- [ ] Document in change log

## 📞 Support

If you encounter any issues after applying this fix:
1. Check Supabase logs for RLS policy errors
2. Verify user roles are correctly set in `loan_officers` and `realtors` tables
3. Ensure `user_id` fields are properly linked to auth users
4. Contact: dhruv@loandock.com or mario@closewithmario.com

---

**Status:** 🔴 CRITICAL - REQUIRES IMMEDIATE ACTION  
**Last Updated:** December 2, 2025
