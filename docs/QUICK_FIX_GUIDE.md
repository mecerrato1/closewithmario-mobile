# Quick Fix Guide: iOS App Lead Security Issue

## 🚨 IMMEDIATE ACTION REQUIRED

A critical security vulnerability allows new users on the iOS app to access all leads. Follow these steps to fix it NOW.

## ⚡ 5-Minute Fix

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project: **closewithmario**
3. Navigate to **SQL Editor** (left sidebar)

### Step 2: Run the Fix Script
1. Click **New Query**
2. Copy the entire contents of `docs/FIX_RLS_SECURITY_ISSUE.sql`
3. Paste into the SQL Editor
4. Click **Run** (or press Ctrl+Enter)
5. Wait for confirmation: "Success. No rows returned"

### Step 3: Verify the Fix
1. Open the iOS app
2. Create a new test account (use a different email)
3. Log in with the test account
4. Navigate to Leads screen
5. **Expected:** You should see ZERO leads

✅ If you see zero leads, the fix is working!  
❌ If you see leads, contact dhruv@loandock.com immediately

## 🔍 What This Fixes

**Before:** Any authenticated user could see all leads  
**After:** Only authorized users can see their assigned leads

### Access Control After Fix:
- ✅ **Admins:** See all leads
- ✅ **Loan Officers:** See only their assigned leads (where `lo_id` = their ID)
- ✅ **Realtors:** See only their assigned leads (where `realtor_id` = their ID)
- ✅ **Buyers/Others:** See NO leads

## 📋 Post-Fix Checklist

- [ ] SQL script executed successfully
- [ ] Tested with new user account (sees zero leads)
- [ ] Tested with admin account (sees all leads)
- [ ] Tested with loan officer account (sees only assigned leads)
- [ ] Web app still works correctly
- [ ] Team notified of fix

## 🆘 Troubleshooting

### Issue: "Permission denied" error when running SQL
**Solution:** Make sure you're logged in as the project owner or have admin access

### Issue: Loan officers can't see their assigned leads
**Solution:** Check that:
1. The loan officer has a record in the `loan_officers` table
2. The `user_id` field is set to their auth user ID
3. The `active` field is set to `true`
4. Leads have the correct `lo_id` assigned

### Issue: Web app stopped working
**Solution:** 
1. Check browser console for errors
2. Verify admin email is in the hardcoded list in the SQL script
3. Contact support if issue persists

## 📞 Emergency Contact

If you encounter any critical issues:
- **Primary:** dhruv@loandock.com
- **Secondary:** mario@closewithmario.com

## 📚 Additional Resources

- Full analysis: `docs/SECURITY_ISSUE_ANALYSIS.md`
- SQL fix script: `docs/FIX_RLS_SECURITY_ISSUE.sql`
- Role management code: `src/lib/roles.ts`

---

**Priority:** 🔴 CRITICAL  
**Time to Fix:** 5 minutes  
**Downtime Required:** None  
**Last Updated:** December 2, 2025
