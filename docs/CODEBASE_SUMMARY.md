# CloseWithMario Mobile - Codebase Summary

**Last Updated:** November 29, 2025  
**EAS Account:** mecerrato1  
**Latest Build:** iOS Production Build 37+ (v1.1.22+, Nov 29, 2025)  
**Major Refactor:** November 26, 2025 - Modular architecture with separated screens and styles  
**Security Update:** November 29, 2025 - Face ID/Touch ID biometric authentication  
**Feature Update:** November 29, 2025 - Voice notes, unread indicators, document templates

---

## 📋 Project Overview

**CloseWithMario Mobile** is a React Native mobile application built with Expo that provides a comprehensive lead management system with a modern dashboard, lead tracking, status management, and activity logging. The app features email/password and Google OAuth authentication with **Face ID/Touch ID biometric security**, displays leads from two sources (`leads` and `meta_ads` tables), and includes role-based access control (RBAC) for team management.

---

## 🏗️ Tech Stack

### Core Technologies
- **Framework:** React Native 0.81.5 with Expo SDK 54
- **Language:** TypeScript 5.9.2
- **UI Library:** React 19.1.0
- **Backend:** Supabase (PostgreSQL + Auth)
- **Build System:** EAS (Expo Application Services)

### Key Dependencies
```json
{
  "@supabase/supabase-js": "^2.84.0",
  "@react-native-async-storage/async-storage": "^2.1.0",
  "expo": "~54.0.25",
  "expo-auth-session": "~7.0.9",
  "expo-av": "~15.0.2",
  "expo-local-authentication": "~15.0.3",
  "expo-status-bar": "~3.0.8",
  "expo-web-browser": "~15.0.9",
  "react": "19.1.0",
  "react-native": "0.81.5"
}
```

---

## 📁 Project Structure

```
closewithmario-mobile/
├── App.tsx                          # Main application entry point (~1500 lines) ✨ REFACTORED
├── index.ts                         # Expo entry file
├── app.json                         # Expo configuration
├── package.json                     # Dependencies and scripts
├── .env                             # Environment variables (Supabase credentials)
├── src/
│   ├── contexts/                    # ✨ NEW - React contexts
│   │   └── AppLockContext.tsx      # Biometric authentication context (~112 lines)
│   ├── screens/                     # ✨ NEW - Screen components
│   │   ├── AuthScreen.tsx          # Login/signup screen with OAuth (~440 lines)
│   │   ├── LeadDetailScreen.tsx    # Lead detail view with activities (~1540 lines)
│   │   ├── LockScreen.tsx          # ✨ Face ID/Touch ID lock screen (~79 lines)
│   │   └── TeamManagementScreen.tsx # Team management for admins (~490 lines)
│   ├── styles/                      # ✨ NEW - Centralized styles
│   │   └── appStyles.ts            # All app styles in one place (~2120 lines)
│   └── lib/                         # Utilities and helpers
│       ├── supabase.ts             # Supabase client configuration
│       ├── roles.ts                # RBAC role management utilities
│       ├── textTemplates.ts        # SMS text message templates with variables
│       ├── callbacks.ts            # Notification scheduling utilities
│       ├── leadsHelpers.ts         # ✨ NEW - Lead helper functions and constants
│       └── types/
│           └── leads.ts            # TypeScript type definitions (expanded)
├── docs/                            # Documentation folder
│   └── CODEBASE_SUMMARY.md         # This file
├── assets/                          # App icons and images
│   ├── CWMLogo.png                 # Main logo (7099x5584)
│   ├── BrowardHPA_Ad.jpg           # Ad image for Broward HPA campaign
│   ├── Fl_Renter_Ad.png            # Ad image for FL Renter campaign
│   ├── Condo_Ad.jpg                # Ad image for Condo campaign
│   ├── Green_Acres_Ad.jpg          # Ad image for Green Acres campaign
│   ├── LO.png                      # Loan officer placeholder image
│   ├── icon.png
│   ├── splash-icon.png
│   ├── adaptive-icon.png
│   └── favicon.png
└── android/                         # Android native project files
```

---

## 🔑 Environment Configuration

### `.env` File
```bash
EXPO_PUBLIC_SUPABASE_URL=https://hxpvcaspgdgsehrehbhl.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Supabase Client (`src/lib/supabase.ts`)
```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## 📊 Data Models

### Lead Type (from `leads` table)
```typescript
type Lead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  loan_purpose?: string | null;
  price?: number | null;
  down_payment?: number | null;
  credit_score?: number | null;
  message?: string | null;
  realtor_id?: string | null;  // For RBAC filtering
};
```

### MetaLead Type (from `meta_ads` table)
```typescript
type MetaLead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  platform: string | null;
  campaign_name: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  form_id?: string | null;
  form_name?: string | null;
  realtor_id?: string | null;  // For RBAC filtering
};
```

### Activity Log Type
```typescript
type ActivityLog = {
  id: string;
  created_at: string;
  lead_id?: string | null;
  meta_lead_id?: string | null;
  activity_type: 'call' | 'text' | 'email' | 'note';
  note: string | null;
  user_id: string;
  user_email?: string;
};
```

### User Roles (RBAC)
```typescript
type UserRole = 'admin' | 'realtor' | null;
```

---

## 🎯 Application Architecture

### Component Hierarchy

```
App (Root)
├── AppLockProvider (Biometric Authentication Context)
│   └── RootApp
│       ├── LockScreen (when app is locked)
│       │   ├── Close With Mario logo
│       │   ├── "App Locked" message
│       │   └── "Unlock with Face ID" button
│       │
│       ├── AuthScreen (when not authenticated)
│       │   ├── Logo container with shadow
│       │   ├── Email/Password inputs (modern card design)
│       │   ├── Sign In / Sign Up toggle
│       │   ├── Google OAuth button
│       │   └── Authentication handling
│       │
│       └── LeadsScreen (when authenticated and unlocked)
    ├── Dashboard View (initial screen)
    │   ├── Header (purple gradient)
    │   ├── Stats Grid (4 cards: Total, New, Qualified, Closed)
    │   ├── "View All Leads" button
    │   ├── "How to Disposition Leads" guide
    │   └── Recent Leads list (last 5)
    │
    ├── Leads List View
    │   ├── Header with "← Home" and "Sign Out" buttons
    │   ├── Stats dashboard (Meta Ads / Website leads counts)
    │   ├── Tab bar (Meta Leads / Website Leads)
    │   ├── Pull-to-refresh
    │   └── Lead cards (FlatList)
    │       ├── Platform badges (FB, IG, etc.)
    │       ├── Color-coded status badges
    │       ├── Campaign info
    │       └── Contact info
    │
    └── Lead Detail View
        ├── Sticky header (purple) with back/next navigation
        ├── Sticky name bar (always visible when scrolling)
        ├── Status selection chips
        ├── Contact buttons (Call, Text with templates, Email)
        ├── Lead information grid
        ├── Activity logging section
        │   ├── Activity type buttons (Call, Text, Email, Note)
        │   ├── Note input
        │   └── Log Activity button (green)
        └── Activity history list
```

### Application Flow

1. **Initial Load:**
   - Check for existing Supabase session
   - Show loading spinner while checking
   - Initialize biometric authentication context

2. **App Lock Check (if session exists):**
   - Check if app was backgrounded for 10+ minutes
   - If locked, display `LockScreen`
   - User must authenticate with Face ID/Touch ID
   - Falls back to login if biometrics unavailable

3. **No Session:**
   - Display `AuthScreen` (modernized login)
   - User can sign in with email/password or Google OAuth
   - On successful auth, session is set and app is unlocked

4. **Active Session (Unlocked):**
   - Fetch user role (admin/realtor) from `team_members` table
   - Apply RBAC filtering (realtors see only their leads)
   - Display `Dashboard` (initial view)
   - Fetch data from both `leads` and `meta_ads` tables
   - Show stats, guide, and recent leads

4. **Navigation:**
   - Dashboard → "View All Leads" → Leads List View
   - Leads List → Tap lead → Lead Detail View
   - Lead Detail → Back button → Leads List
   - Leads List → "← Home" button → Dashboard
   - Lead Detail → Next/Previous buttons → Navigate between leads

5. **Lead Management:**
   - View lead details with sticky name bar
   - Update lead status (status chips)
   - Log activities (call, text, email, note)
   - View activity history
   - Contact lead (phone, SMS, email via deep links)

6. **Sign Out:**
   - Call `supabase.auth.signOut()`
   - Clear session state
   - Return to `AuthScreen`

---

## 🔐 Authentication

### Features
- Email/password authentication via Supabase Auth
- **Google OAuth** authentication with deep linking
- **Face ID / Touch ID** biometric authentication for app access
- Session persistence with AsyncStorage
- Auth state change listener
- Sign out capability
- Modern, card-based login UI with purple branding
- **Auto-lock after 10 minutes** of app being backgrounded
- Graceful fallback when biometrics unavailable

### Implementation
```typescript
// Sign In
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

// Sign Up
const { data, error } = await supabase.auth.signUp({
  email,
  password,
});

// Sign Out
await supabase.auth.signOut();

// Session Check
const { data: { session } } = await supabase.auth.getSession();

// Listen to auth changes
supabase.auth.onAuthStateChange((_event, newSession) => {
  setSession(newSession ?? null);
});

// Google OAuth
const redirectTo = makeRedirectUri({
  scheme: 'com.closewithmario.mobile',
  path: 'auth/callback',
});

const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo,
    skipBrowserRedirect: false,
  },
});
```

### Biometric Authentication (`expo-local-authentication`)
```typescript
// Check for biometric support
const hasHardware = await LocalAuthentication.hasHardwareAsync();
const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

// Prompt for authentication
const result = await LocalAuthentication.authenticateAsync({
  promptMessage: 'Unlock Close With Mario',
  cancelLabel: 'Cancel',
  disableDeviceFallback: false,
});

// Auto-lock after idle period
// Locks after 10 minutes of being backgrounded
// Uses AppState API to track background/foreground transitions
```

### OAuth Configuration
- **Deep Link Scheme:** `com.closewithmario.mobile://auth/callback`
- **Supabase Redirect URL:** Must be configured in Supabase Dashboard
- **Android Intent Filters:** Configured in `app.json` for Chrome Custom Tabs
- **iOS Associated Domains:** Configured for universal links

---

## 📡 Data Fetching

### Leads Query
```typescript
const { data: leadsData, error: leadsError } = await supabase
  .from('leads')
  .select('id, created_at, first_name, last_name, email, phone, status')
  .order('created_at', { ascending: false })
  .limit(50);
```

### Meta Ads Query
```typescript
const { data: metaData, error: metaError } = await supabase
  .from('meta_ads')
  .select('id, created_at, first_name, last_name, email, phone, status, platform, campaign_name')
  .order('created_at', { ascending: false })
  .limit(50);
```

### RBAC (Role-Based Access Control)
```typescript
// Get user role from team_members table
const userRole = await getUserRole(userId, userEmail);

// Check if user can see all leads (admin) or only their own (realtor)
const canSeeAll = canSeeAllLeads(userRole);

// Apply filtering for realtors
if (!canSeeAll) {
  const teamMemberId = await getUserTeamMemberId(userId, 'realtor');
  if (teamMemberId) {
    leadsQuery = leadsQuery.eq('realtor_id', teamMemberId);
    metaQuery = metaQuery.eq('realtor_id', teamMemberId);
  }
}
```

### Error Handling
- Individual error handling for each table query
- Graceful degradation (shows data from successful queries)
- Error messages displayed to user
- Console logging for debugging
- Pull-to-refresh for manual data reload

---

## 🎨 UI/UX Features

### Screens

#### AuthScreen (Modernized)
- **Circular logo container** with purple shadow
- **Card-based form design** with white background
- Modern input fields with borders
- **Purple primary button** matching brand
- Toggle between sign in/sign up modes
- **Google OAuth button** with icon
- Enhanced error display
- Loading state during authentication
- Keyboard-aware view for iOS

#### Dashboard Screen (NEW)
- **Purple gradient header** with "Dashboard" title
- **Stats grid** (4 cards):
  - Total Leads (green numbers)
  - New Leads
  - Qualified Leads
  - Closed Leads
- **"View All Leads" button** (purple, prominent)
- **"How to Disposition Leads" guide** (4 steps with numbered circles)
- **Recent Leads section** (last 5 leads with time ago)
- Tap any recent lead to jump directly to detail view

#### LeadsScreen (Leads List)
- **Header** with "← Home" button, centered title, and "Sign Out" button
- **Stats dashboard** (Meta Ads / Website leads counts with green numbers)
- **Tab bar** for switching between Meta Leads and Website Leads
- **Pull-to-refresh** functionality
- **Color-coded status badges** (New, Contacted, Qualified, etc.)
- **Platform badges** (FB, IG, MSG, WA) - text-based for instant loading
- Campaign info with icon
- Contact info with icon
- Timestamp (e.g., "Nov 20, 3:45 PM")

#### Lead Detail View (Enhanced)
- **Sticky purple header** with back button, lead count, and next/previous navigation
- **Sticky name bar** (always visible when scrolling) with name and date/time
- **Status selection chips** (green when active)
- **Modern contact buttons** (Call, Text, Email) with white icons on purple/green
  - **Text button** opens template selector with 4 pre-written SMS templates
  - Templates auto-fill with lead name, LO name, and platform (Facebook/Instagram)
- **Info grid** with dividers and section headers
- **Activity logging section**:
  - Activity type buttons (Call, Text, Email, Note) - green when active
  - Note input field
  - **Green "Log Activity" button** with shadow
- **Activity history** with user email and timestamps
- Visual dividers between sections
- Deep links for phone, SMS, and email actions

### Lead Card Display
- Full name (first + last name)
- **Color-coded status badge** with matching border
- **Platform badge** (text-based: FB, IG, MSG, WA)
- Contact info (email or phone) with icon
- Campaign name (for Meta leads) with icon
- Timestamp with date and time
- Source badge (🌐 Web for website leads)

---

## 🎨 Styling

### Design System (Updated Nov 2025)
- **Primary Purple:** `#7C3AED` (brand color - headers, buttons, accents)
- **Success Green:** `#10B981` (stats, success states, activity logging)
- **Background:** `#F8FAFC` (light gray-blue)
- **Card Background:** `#FFFFFF` (white)
- **Border Colors:** `#E2E8F0`, `#F1F5F9` (light grays)
- **Text Colors:** 
  - Primary: `#1E293B` (dark slate)
  - Secondary: `#64748B` (slate)
  - Tertiary: `#94A3B8` (light slate)
- **Status Colors:**
  - New: Blue (`#1976D2`)
  - Contacted: Orange (`#F57C00`)
  - Gathering Docs: Purple (`#7B1FA2`)
  - Qualified: Green (`#059669`)
  - Closed: Dark Green (`#047857`)
  - Unqualified: Red (`#C62828`)
  - No Response: Gray (`#616161`)

### Key Style Patterns
- **Purple gradient headers** with rounded bottom corners
- **Green accents** for positive actions and stats
- **Card-based layouts** with shadows and elevation
- **Rounded corners** (12-20px border radius)
- **Color-coded status badges** with matching borders
- **Responsive typography** with letter spacing
- **Touch-friendly button sizes** (minimum 44px height)
- **Shadows and elevation** for depth (purple/green tints)
- **Sticky elements** (headers, name bars) for context retention

---

## 📱 Platform Configuration

### Expo Config (`app.json`)
```json
{
  "expo": {
    "name": "closewithmario-mobile",
    "slug": "closewithmario-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "com.closewithmario.mobile",
    "newArchEnabled": true,
    "ios": {
      "bundleIdentifier": "com.closewithmario.mobile",
      "buildNumber": "3"
    },
    "android": {
      "package": "com.closewithmario.mobile",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "com.closewithmario.mobile",
              "host": "auth",
              "pathPrefix": "/callback"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

### Deep Linking
- **Scheme:** `com.closewithmario.mobile://`
- **OAuth Callback:** `com.closewithmario.mobile://auth/callback`
- Configured for Google OAuth (via `expo-auth-session` and `expo-web-browser`)
- Android intent filters for Chrome Custom Tabs
- iOS universal links support

---

## 🚀 Available Scripts

```bash
# Start development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run on web
npm run web
```

---

## 🔧 Development Setup

### Prerequisites
1. Node.js 20.18.0+ (note: some packages require 20.19.4+)
2. Expo CLI
3. EAS CLI (for builds)
4. Android Studio (for Android development)
5. Xcode (for iOS development, macOS only)

### Installation Steps
```bash
# Install dependencies
npm install

# Install additional Expo packages
npx expo install expo-auth-session expo-web-browser

# Login to EAS
eas login

# Start development server
npm start
```

---

## 🐛 Known Issues & Considerations

### Engine Warnings
- Several React Native packages require Node.js >= 20.19.4
- Current Node version: 20.18.0
- App runs fine despite warnings, but consider upgrading Node.js

### Current Limitations
1. **No Lead Creation:** Cannot create new leads from mobile app
2. ~~**No Search/Filter:**~~ ✅ RESOLVED - Search and filtering implemented (Nov 26)
3. **Limited Pagination:** Only fetches 50 most recent leads per table
4. **No Offline Support:** Requires active internet connection
5. **Callback Notifications:** Scheduled but not yet triggering push notifications
6. **Image Asset Issue:** Logo image (CWMLogo.png) is not square (7099x5584), should be square for Android adaptive icon
7. **Duplicate Dependencies:** Multiple copies of `expo-constants` exist in node_modules (requires cleanup)
8. ~~**Large File Size:**~~ ✅ RESOLVED - App.tsx refactored from ~6250 lines to ~1500 lines (Nov 26)

---

## 🔮 Potential Next Steps

### High Priority
1. ✅ **Lead Detail View:** COMPLETED - Full detail view with navigation
2. ✅ **Pull to Refresh:** COMPLETED - Manual data refresh capability
3. ✅ **Status Updates:** COMPLETED - Status dropdown with modal picker
4. ✅ **Activity Logging:** COMPLETED - Log calls, texts, emails, notes
5. ✅ **Search & Filter:** COMPLETED - Search by name, email, phone + status/LO filters
6. ✅ **Team Management:** COMPLETED - Manage loan officers and realtors
7. ✅ **Bilingual Support:** COMPLETED - Spanish text templates
8. **Pagination:** Load more leads as user scrolls (currently limited to 50)
9. **Lead Creation/Editing:** Add forms to create and update leads
10. **Fix Image Assets:** Create square logo for Android adaptive icon
11. **Dependency Cleanup:** Resolve duplicate expo-constants packages
12. **Push Notifications:** Implement actual notifications for callbacks

### Medium Priority
13. **Real-time Updates:** Use Supabase subscriptions for live data
14. **Offline Support:** Cache data locally for offline viewing
15. ✅ **Lead Assignment:** COMPLETED - LO assignment in detail view
16. **Advanced Filtering:** Filter by date range, campaign, platform
17. **Export Functionality:** Export leads to CSV/PDF
18. ~~**Component Refactoring:**~~ ✅ COMPLETED - Modular architecture with separate screens and styles (Nov 26)

### Low Priority
16. **Analytics Dashboard:** Charts and metrics (partially implemented)
17. **Dark Mode:** Theme switching
18. **Multi-language Support:** Internationalization
19. ✅ **Biometric Auth:** COMPLETED - Face ID / Touch ID with auto-lock
20. **Lead Notes:** Add persistent notes to leads (separate from activity log)

---

## 🔒 Security Considerations

### Current Implementation
- ✅ Environment variables for sensitive credentials
- ✅ Supabase Row Level Security (RLS) should be enabled on backend
- ✅ Authentication required to view data
- ✅ HTTPS for all API calls

### Recommendations
- Ensure RLS policies are properly configured in Supabase
- Implement proper error handling to avoid leaking sensitive info
- Add rate limiting for authentication attempts
- Consider implementing refresh token rotation
- Add session timeout for inactive users

---

## 📚 Key Files Reference

### `App.tsx` (~1500 lines) ✨ REFACTORED
Main application orchestrator containing:
- Root `App` component with session management
- `LeadsScreen` component - Main leads list view with:
  - Dashboard view with stats and recent leads
  - Tabbed interface (Meta Leads / Website Leads / All)
  - Search and filter functionality
  - Pull-to-refresh
  - Lead card display
- Navigation logic between screens
- Data fetching with RBAC filtering
- State management for leads, filters, and UI
- Imports modular screens and utilities

### `src/screens/AuthScreen.tsx` (~440 lines)
Dedicated authentication screen:
- Email/password login and signup
- Google OAuth integration with deep linking
- Modern card-based UI with purple branding
- Loading and error states
- Keyboard-aware view
- Session persistence with AsyncStorage

### `src/screens/LeadDetailScreen.tsx` (~1540 lines) ✨ NEW
Comprehensive lead detail view:
- Sticky header with navigation (back, next/previous)
- Sticky name bar (always visible when scrolling)
- Status management with dropdown picker
- LO assignment (admin only)
- Contact buttons (Call, Text with templates, Email)
- Activity logging section (Call, Text, Email, Note)
- Activity history display
- Text template modal with bilingual support
- Callback scheduling
- Ad image viewer for Meta leads
- Deep linking for phone/SMS/email

### `src/screens/TeamManagementScreen.tsx` (~490 lines) ✨ NEW
Team management interface (super admin only):
- Manage loan officers and realtors
- Add/edit/delete team members
- Toggle active status
- Lead eligibility toggle for LOs
- Auto-assign toggle for automatic lead distribution
- Search functionality
- Separate tabs for LOs and realtors

### `src/styles/appStyles.ts` (~2120 lines) ✨ NEW
Centralized style definitions:
- All component styles in one organized file
- Purple/green design system
- Status color mappings
- Responsive layouts
- Reusable style patterns
- ~500+ style definitions extracted from App.tsx

### `src/lib/leadsHelpers.ts` (~90 lines) ✨ NEW
Lead-related helper functions and constants:
- `STATUSES` - Array of valid status values
- `STATUS_DISPLAY_MAP` - Status to display name mapping
- `STATUS_COLOR_MAP` - Status to color scheme mapping
- `getLeadAlert()` - Attention badge logic (matches web)
- `formatStatus()` - Format status for display
- `getTimeAgo()` - Human-readable time formatting

### `src/lib/supabase.ts` (~20 lines)
Supabase client initialization with:
- Environment variable validation
- AsyncStorage for session persistence
- Auto-refresh token configuration
- Biometric-friendly session management

### `src/contexts/AppLockContext.tsx` (~112 lines) ✨ NEW
Biometric authentication context:
- `isLocked` state management
- `requireUnlock()` - Triggers Face ID/Touch ID prompt
- `enableLock()` / `disableLock()` - Manual lock control
- AppState tracking for auto-lock after 10 minutes idle
- Hardware capability detection
- Graceful fallback for devices without biometrics

### `src/screens/LockScreen.tsx` (~79 lines) ✨ NEW
Biometric lock screen UI:
- Close With Mario logo display
- "App Locked" messaging
- "Unlock with Face ID" button
- Matches app's purple branding
- Integrates with AppLockContext

### `src/lib/roles.ts` (~100 lines)
RBAC utilities:
- `getUserRole()` - Fetch user role from team_members table
- `getUserTeamMemberId()` - Get team member ID for filtering
- `canSeeAllLeads()` - Check if user is admin
- Type definitions for UserRole

### `src/lib/textTemplates.ts` (~380 lines)
SMS text message templates with bilingual support:
- **10 pre-written templates** (Initial Contact, Document Follow-up, Pre-approval Check-in, Stop Paying Rent, Not Ready - General, Not Ready - Credit, Callback Confirmation, Hung Up, Variable Income Docs, Self-Employed Docs)
- **Bilingual support:** English and Spanish versions for all templates
- Variable replacement system: `{fname}`, `{loFullname}`, `{loFname}`, `{loPhone}`, `{loEmail}`, `{platform}`, `{recentYear}`, `{prevYear}`
- **Dynamic year calculation:** `{recentYear}` = current year - 1, `{prevYear}` = current year - 2
- `formatPlatformName()` - Converts FB/IG to Facebook/Instagram (case-insensitive)
- `fillTemplate()` - Replaces template variables with actual values including dynamic years
- `getTemplateText()` - Returns English or Spanish version based on preference
- `getTemplateName()` - Returns template name in selected language
- **Auto-detection:** Automatically uses Spanish if lead's `preferred_language` is 'spanish'
- **Manual override:** Language toggle in template modal for manual selection
- **Document Checklists:** Variable Income Docs and Self-Employed Docs templates with tax year placeholders
- Templates include friendly emojis and proper formatting

### `src/lib/types/leads.ts` (~80 lines) ✨ EXPANDED
Comprehensive TypeScript type definitions:
- `Lead` - Website leads type
- `MetaLead` - Meta ads leads type
- `Activity` - Activity log type
- `LoanOfficer` - Loan officer type
- `Realtor` - Realtor type
- `SelectedLeadRef` - Selected lead reference type
- `AttentionBadge` - Attention badge type for alerts
- All types centralized and shared across components

### `src/lib/callbacks.ts` (~60 lines)
Notification scheduling utilities:
- `scheduleLeadCallback()` - Schedule callback notifications
- Integration with Expo Notifications
- Stores callbacks in `lead_callbacks` table

### `app.json` (~70 lines)
Expo configuration for iOS, Android, and web platforms:
- Deep linking scheme configuration
- Android intent filters for OAuth
- iOS bundle identifier and build number
- EAS project ID

### `.env` (2 lines)
Environment variables for Supabase connection.

---

## 🤝 Integration Points

### Supabase Tables
1. **`leads` table:**
   - Columns: id, created_at, first_name, last_name, email, phone, status, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id
   - Used for general lead management (website leads)
   - RBAC: Filtered by realtor_id for non-admin users
   - LO assignment via lo_id foreign key

2. **`meta_ads` table:**
   - Columns: id, created_at, first_name, last_name, email, phone, status, platform, campaign_name, ad_id, ad_name, adset_id, adset_name, form_id, form_name, lo_id, realtor_id, preferred_language, subject_address, credit_range, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes
   - Used for Meta advertising platform leads
   - RBAC: Filtered by realtor_id for non-admin users
   - LO assignment via lo_id foreign key
   - Language preference for bilingual templates

3. **`team_members` table:**
   - Used for RBAC role management
   - Columns: id, user_id, role, email
   - Roles: 'super_admin' | 'loan_officer' | 'realtor' | 'buyer'

4. **`loan_officers` table:**
   - Manages loan officer team members
   - Columns: id, first_name, last_name, email, phone, active, lead_eligible, created_at
   - lead_eligible: Determines if LO can receive auto-assigned leads

5. **`realtors` table:**
   - Manages realtor team members
   - Columns: id, first_name, last_name, email, phone, active, created_at

6. **`lead_activities` table:**
   - Tracks interactions for website leads
   - Columns: id, created_at, lead_id, activity_type, notes, created_by, user_email, audio_url
   - Activity types: 'call', 'text', 'email', 'note'
   - `audio_url` stores voice note recordings

9. **Supabase Storage Bucket:**
   - **`activity-voice-notes`** - Stores voice note audio files
   - Public read access for playback
   - Authenticated upload/delete access
   - Files organized by lead ID

7. **`meta_ad_activities` table:**
   - Tracks interactions for meta leads
   - Columns: id, created_at, meta_ad_id, activity_type, notes, created_by, user_email, audio_url
   - Activity types: 'call', 'text', 'email', 'note'
   - `audio_url` stores voice note recordings

8. **`lead_callbacks` table:**
   - Stores scheduled callback reminders
   - Columns: id, created_at, lead_id, meta_ad_id, callback_time, note, user_id, completed
   - Used with Expo Notifications for reminders

### Authentication
- Uses Supabase Auth with email/password and Google OAuth
- Session management handled by Supabase SDK
- Auth state persisted automatically
- Deep linking for OAuth callbacks

---

## � Major Refactoring (November 26, 2025)

### What Changed
The codebase underwent a massive refactoring to improve maintainability, readability, and scalability:

**Before:**
- Single monolithic `App.tsx` file (~6250 lines)
- All components, styles, types, and logic in one file
- Difficult to navigate and maintain
- Slow IDE performance with large file

**After:**
- Modular architecture with separated concerns
- `App.tsx` reduced to ~1500 lines (76% reduction!)
- 3 dedicated screen components
- Centralized styles file
- Expanded utility libraries
- Better code organization

### Files Created
1. **`src/screens/AuthScreen.tsx`** - Authentication UI (440 lines)
2. **`src/screens/LeadDetailScreen.tsx`** - Lead detail view (1540 lines)
3. **`src/screens/TeamManagementScreen.tsx`** - Team management (490 lines)
4. **`src/styles/appStyles.ts`** - All styles centralized (2120 lines)
5. **`src/lib/leadsHelpers.ts`** - Lead helper functions (90 lines)

### Benefits Achieved
- ✅ **Better Organization:** Each screen in its own file
- ✅ **Easier Maintenance:** Changes isolated to specific files
- ✅ **Improved Performance:** Faster IDE navigation and autocomplete
- ✅ **Code Reusability:** Shared utilities and types
- ✅ **Better Testing:** Easier to unit test individual components
- ✅ **Team Collaboration:** Multiple developers can work on different screens
- ✅ **Cleaner Imports:** Clear dependencies between modules

### Migration Notes
- All functionality preserved - zero breaking changes
- Types centralized in `src/lib/types/leads.ts`
- Styles extracted to `src/styles/appStyles.ts`
- Helper functions moved to `src/lib/leadsHelpers.ts`
- Screen components maintain same props interfaces
- Asset file renamed: `BrowardHPA _Ad.jpg` → `BrowardHPA_Ad.jpg` (removed space)

---

## � Code Quality Notes

### Strengths
- ✅ **Modular Architecture** with separated screens and styles (NEW)
- ✅ **Modern UI/UX** with purple/green brand colors
- ✅ **Comprehensive feature set** (dashboard, detail view, activity logging)
- ✅ **TypeScript** for type safety
- ✅ **RBAC implementation** for team management
- ✅ **Proper error handling** with user-friendly messages
- ✅ **Loading and empty states** throughout
- ✅ **Pull-to-refresh** for data updates
- ✅ **Deep linking** for OAuth and contact actions
- ✅ **Consistent styling** with centralized design system (NEW)
- ✅ **Well-organized code** with clear separation of concerns (NEW)
- ✅ **Reusable utilities** and helper functions (NEW)

### Areas for Improvement
- ~~**Large single file:**~~ ✅ RESOLVED - Modular architecture implemented
- ~~**Types are duplicated:**~~ ✅ RESOLVED - Types centralized in types/leads.ts
- ~~**Styles could be extracted:**~~ ✅ RESOLVED - Centralized in appStyles.ts
- **No unit tests** or integration tests
- **No component library** (could use React Native Paper, NativeBase, etc.)
- **No logging/analytics integration** (e.g., Sentry, Mixpanel)
- **Image assets need optimization** (logo is not square)
- **Duplicate dependencies** in node_modules need cleanup
- **Limited pagination** (only 50 leads per table)
- **Text templates are hardcoded** (could be stored in database for customization)

---

## 📅 Recent Changes (November 2025)

### November 29, 2025 - Voice Notes, Unread Indicators & Document Templates (v1.1.22+)

#### 🎙️ Voice Notes Feature
1. **Audio Recording** - Record voice notes for lead activities
   - Uses `expo-av` for audio recording (HIGH_QUALITY preset)
   - Microphone permission handling with graceful prompts
   - Visual recording indicator with red mic button
   - Stop recording and auto-save functionality

2. **Voice Note Storage**
   - Uploads to Supabase Storage bucket `activity-voice-notes`
   - Files stored as `.m4a` format
   - Public URL generation for playback
   - Stored in `audio_url` column of activity tables

3. **Voice Note Playback**
   - Play button on activities with voice notes
   - Stop/pause functionality
   - Inverted audio player styling for dark theme
   - Works on both `lead_activities` and `meta_ad_activities`

#### 🔵 Unread Lead Indicator
4. **New Lead Visual Indicator**
   - Blue dot appears next to lead name for unread leads
   - Unread = `!last_contact_date && (status === 'new' || !status)`
   - Shows on both website leads and meta leads cards
   - Helps identify leads that haven't been contacted yet

#### 📄 Document Checklist Templates
5. **Variable Income Docs Template** (English/Spanish)
   - Most recent paystub
   - Last paystub of {recentYear} and {prevYear}
   - W-2 for {recentYear} and {prevYear}
   - Driver's license
   - Dynamic year calculation (current year - 1 and - 2)

6. **Self-Employed Docs Template** (English/Spanish)
   - Personal tax returns (all pages) for {recentYear} and {prevYear}
   - W-2 (issued from business) for {recentYear} and {prevYear}
   - Driver's license
   - Dynamic year calculation

#### ✨ UI Micro-Animations
7. **Log Activity Button Animation**
   - Subtle scale animation on press (0.96 → 1.0)
   - 80ms duration for snappy feedback
   - Uses `Animated.sequence` for smooth effect
   - `LayoutAnimation` for activity list updates

---

### November 29, 2025 - Security & Infrastructure Updates (v1.1.21, Build 36)

#### 🔒 Biometric Authentication (Face ID / Touch ID)
1. **App Lock System** - Secure app access with biometrics
   - Face ID and Touch ID support via `expo-local-authentication`
   - Auto-lock after 10 minutes of app being backgrounded
   - Manual lock/unlock capability via `AppLockContext`
   - Graceful fallback for devices without biometric hardware
   - Lock screen UI with Close With Mario branding
   - Seamless integration with existing auth flow

2. **Session Persistence Enhancement**
   - Added AsyncStorage integration to Supabase client
   - Persistent sessions across app restarts
   - Auto-refresh token configuration
   - Better session management for mobile environment

3. **App Architecture Updates**
   - New `AppLockProvider` context wrapping entire app
   - `RootApp` component for session and lock state management
   - `LockScreen` component for biometric prompt UI
   - AppState tracking for background/foreground transitions

#### 📊 Dashboard Enhancement
4. **Pull-to-Refresh on Dashboard** - Added pull-to-refresh to dashboard view
   - Updates lead eligibility status in real-time
   - Refreshes stats and recent leads
   - Consistent with leads list refresh behavior

### November 26, 2025 - Major Refactoring & Updates (v1.1.16, Build 31)

#### 🔄 Major Refactoring
1. **Modular Architecture** - Complete codebase restructuring
   - Split App.tsx from ~6250 lines to ~1500 lines (76% reduction)
   - Created 3 dedicated screen components (Auth, LeadDetail, TeamManagement)
   - Centralized all styles in `src/styles/appStyles.ts` (2120 lines)
   - Extracted lead helpers to `src/lib/leadsHelpers.ts`
   - Expanded type definitions in `src/lib/types/leads.ts`
   - Renamed asset file: `BrowardHPA _Ad.jpg` → `BrowardHPA_Ad.jpg`

#### New Features
1. **Bilingual Text Templates** - Spanish language support
   - Auto-detection based on lead's `preferred_language` field
   - Manual language toggle (🇺🇸 English / 🇪🇸 Español) in template modal
   - All 4 templates translated to Spanish with proper formatting
   - Dynamic modal title based on selected language

2. **Callback Scheduling** - Schedule reminders to call leads
   - "Schedule Callback" button in lead detail view
   - Date/time picker with default 2 hours from now
   - Custom note field for callback context
   - Integration with Expo Notifications
   - Stores callbacks in `lead_callbacks` table

3. **Team Management Screen** (Super Admin Only)
   - Manage loan officers and realtors
   - Add/edit/delete team members
   - Toggle active status
   - Lead eligibility toggle for loan officers
   - Auto-assign toggle for automatic lead distribution
   - Search functionality for team members
   - Accessible via 👥 icon in header

4. **Enhanced Status Management**
   - Status dropdown (replaces horizontal chips)
   - Current status badge in header area
   - Cleaner UI with better organization
   - Full-width dropdown for non-admin users
   - Side-by-side status/LO dropdowns for admins

5. **Advanced Filtering System**
   - **Status filter:** Filter by any status (new, contacted, qualified, etc.)
   - **LO filter:** Super admins can filter by assigned loan officer
   - **Search filter:** Search by name, email, or phone
   - **Unqualified handling:** Excluded from default "all" view
   - Separate unqualified count card on dashboard
   - All filters work together seamlessly

6. **Smart Navigation**
   - Navigation arrows respect ALL active filters
   - Tab-aware navigation (combines meta + regular leads on "all" tab)
   - Accurate lead count display (e.g., "3 of 27" for filtered view)
   - Seamless switching between lead types when navigating
   - Prevents navigation to unqualified leads by default

7. **Ad Image Viewer**
   - "View Ad" button for meta leads with ad images
   - Full-screen modal image viewer
   - Support for multiple ad campaigns:
     - Florida Renter Ad
     - Broward HPA Ad
     - Condo Ad
     - Green Acres Ad

8. **Activity Enhancements**
   - Automatic call logging when dialing
   - Automatic text logging when sending SMS
   - Automatic email logging when composing email
   - Activity refresh after logging
   - Delete activity button (super admin only)

#### Bug Fixes
- Fixed navigation showing all leads instead of filtered leads
- Fixed lead count displaying total instead of filtered count
- Fixed status dropdown width for non-admin users
- Fixed navigation not working across different lead types on "all" tab
- Fixed unqualified leads appearing in navigation despite being filtered

#### UI/UX Improvements
- Status picker modal with counts for each status
- Language toggle with flag emojis (🇺🇸 🇪🇸)
- Improved dropdown styling and spacing
- Better visual hierarchy in lead detail view
- Muted/grayed styling for unqualified count card
- Cleaner status badge positioning

#### Technical Improvements
- Added `callbacks.ts` library for notification scheduling
- Enhanced filter logic with `matchesSearch()` and `matchesLOFilter()` helpers
- Tab-aware navigation with combined lead lists
- Proper TypeScript typing for all new features
- Optimized re-renders with proper state management

### Earlier November 2025 Updates

#### Major Features Added
1. **Dashboard Screen** - New landing page with stats, guide, and recent leads
2. **Lead Detail View** - Full lead information with next/previous navigation
3. **Activity Logging** - Log calls, texts, emails, and notes with activity history
4. **Status Management** - Update lead status with color-coded chips
5. **Google OAuth** - Added Google sign-in with deep linking
6. **RBAC System** - Role-based access control (admin/realtor)
7. **Pull-to-Refresh** - Manual data refresh on leads list
8. **Sticky UI Elements** - Sticky header and name bar in detail view
9. **Contact Actions** - Deep links for phone, SMS, and email
10. **Modern UI Redesign** - Purple/green brand colors throughout
11. **SMS Text Templates** (Nov 24) - Template selector with 4 pre-written messages, auto-fill variables

### UI/UX Improvements
- Modernized login screen with card design and purple branding
- Color-coded status badges (New, Contacted, Qualified, etc.)
- Platform badges (FB, IG, MSG, WA) - text-based for instant loading
- Green accent color for positive actions and stats
- Purple gradient headers with rounded corners
- Improved typography with letter spacing
- Enhanced shadows and elevation
- Better spacing and visual hierarchy
- Text template modal with live preview (shows 8 lines of message)
- Friendly platform names (FB→Facebook, IG→Instagram) in templates
- Professional SMS templates with emojis (👋, 🏡, 📄, 🏠, ✅, 💰)

### Technical Improvements
- Updated deep linking scheme to `com.closewithmario.mobile`
- Added Android intent filters for OAuth
- Implemented RBAC filtering for team members
- Added activity log table integration
- Improved error handling and loading states
- Added helper functions (formatStatus, getTimeAgo, formatPlatformName, fillTemplate)
- Better TypeScript type definitions
- Text template system with variable replacement
- Case-insensitive platform name matching
- Fetches current loan officer info from database for templates

### Bug Fixes
- Fixed duplicate style definitions
- Resolved platform icon loading issues
- Fixed contact button icon visibility
- Corrected OAuth redirect URI configuration

### Build Information
- **Latest iOS Build:** Build 36 (Production, Nov 29, 2025)
- **App Version:** 1.1.21
- **Build Status:** Successful
- **Distribution:** App Store ready
- **New Features:** Face ID/Touch ID biometric authentication

---

## 🎓 Learning Resources

### Expo Documentation
- https://docs.expo.dev/

### Supabase Documentation
- https://supabase.com/docs

### React Native Documentation
- https://reactnative.dev/docs/getting-started

### EAS Build Documentation
- https://docs.expo.dev/build/introduction/

---

## 📞 Support & Contacts

- **EAS Account:** mecerrato1
- **Supabase Project:** hxpvcaspgdgsehrehbhl
- **Bundle Identifier (iOS):** com.closewithmario.mobile
- **Package Name (Android):** com.closewithmario.mobile

---

## 🏁 Quick Start for New Developers

```bash
# 1. Clone the repository
git clone <repository-url>
cd closewithmario-mobile

# 2. Install dependencies
npm install

# 3. Set up environment variables
# Create .env file with Supabase credentials

# 4. Start development server
npm start

# 5. Run on device/simulator
# Scan QR code with Expo Go app
# OR press 'a' for Android, 'i' for iOS
```

---

## 🎯 Quick Reference for LLMs

### Key Technologies
- **Frontend:** React Native 0.81.5 + Expo SDK 54 + TypeScript
- **Backend:** Supabase (PostgreSQL + Auth)
- **Security:** Face ID/Touch ID biometric authentication
- **Main File:** `App.tsx` (~1500 lines - refactored)
- **Color Scheme:** Purple (#7C3AED) + Green (#10B981)
- **Version:** 1.1.21 (Build 36)

### Main Components
1. `LockScreen` - Face ID/Touch ID biometric authentication (NEW)
2. `AuthScreen` - Login with email/password and Google OAuth
3. `TeamManagementScreen` - Manage loan officers and realtors (super admin only)
4. `Dashboard` - Stats, guide, and recent leads (initial view)
5. `LeadsScreen` - Tabbed list view with search, filters, and pull-to-refresh
6. `LeadDetailView` - Full lead details with activity logging, SMS templates, and callback scheduling

### Database Tables
- `leads` - Website leads with lo_id and realtor_id for RBAC
- `meta_ads` - Meta advertising leads with lo_id, realtor_id, and preferred_language
- `team_members` - User roles (super_admin/loan_officer/realtor/buyer)
- `loan_officers` - LO team members with lead_eligible flag
- `realtors` - Realtor team members
- `lead_activities` - Website lead interaction history
- `meta_ad_activities` - Meta lead interaction history
- `lead_callbacks` - Scheduled callback reminders

### Current State (Nov 29, 2025)
- ✅ Full CRUD for lead status and activities
- ✅ RBAC with super_admin/loan_officer/realtor/buyer roles
- ✅ Modern UI with brand colors
- ✅ Google OAuth working
- ✅ Face ID/Touch ID biometric authentication
- ✅ Auto-lock after 10 minutes idle
- ✅ Session persistence with AsyncStorage
- ✅ iOS Production Build 37+ deployed (v1.1.22+)
- ✅ SMS text templates with bilingual support (10 templates, English/Spanish)
- ✅ **Voice notes recording and playback (NEW)**
- ✅ **Unread lead indicator - blue dot (NEW)**
- ✅ **Document checklist templates with dynamic years (NEW)**
- ✅ **UI micro-animations (NEW)**
- ✅ Advanced filtering (status, LO, search)
- ✅ Smart navigation (respects all filters, tab-aware)
- ✅ Team management screen
- ✅ Callback scheduling
- ✅ Ad image viewer
- ✅ Modular architecture (refactored from 6250 to 1500 lines)
- ⚠️ Need to fix: Square logo for Android, duplicate dependencies
- 🔜 Next: Push notifications, pagination, lead creation

### Important Notes
- Modular architecture with separated screens (~1500 line main file)
- **Face ID/Touch ID required** after 10 minutes of being backgrounded
- Deep link scheme: `com.closewithmario.mobile://auth/callback`
- Supabase URL must have this redirect URL configured
- AsyncStorage used for session persistence
- RBAC filters leads by `lo_id` or `realtor_id` for non-admin users
- Activity logging writes to `lead_activities` or `meta_ad_activities` tables
- Text templates in `src/lib/textTemplates.ts` with 10 bilingual messages
- Templates auto-fill: {fname}, {loFullname}, {loFname}, {loPhone}, {loEmail}, {platform}, {recentYear}, {prevYear}
- Voice notes stored in Supabase Storage bucket `activity-voice-notes`
- Unread leads identified by `!last_contact_date && (status === 'new' || !status)`
- Spanish templates auto-selected if `preferred_language === 'spanish'`
- Navigation respects status filter, LO filter, and search query
- Unqualified leads excluded from default "all" view but accessible via filter
- Tab-aware navigation combines meta + regular leads on "all" tab

---

**End of Codebase Summary**
