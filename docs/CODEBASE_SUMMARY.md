# CloseWithMario Mobile - Codebase Summary

**Last Updated:** November 21, 2025  
**EAS Account:** mecerrato1  
**Latest Build:** iOS Production Build 3 (Nov 20, 2025)

---

## 📋 Project Overview

**CloseWithMario Mobile** is a React Native mobile application built with Expo that provides a comprehensive lead management system with a modern dashboard, lead tracking, status management, and activity logging. The app features email/password and Google OAuth authentication, displays leads from two sources (`leads` and `meta_ads` tables), and includes role-based access control (RBAC) for team management.

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
  "expo": "~54.0.25",
  "expo-auth-session": "~7.0.9",
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
├── App.tsx                          # Main application entry point (~2600 lines)
├── index.ts                         # Expo entry file
├── app.json                         # Expo configuration
├── package.json                     # Dependencies and scripts
├── .env                             # Environment variables (Supabase credentials)
├── src/
│   └── lib/
│       ├── supabase.ts             # Supabase client configuration
│       ├── roles.ts                # RBAC role management utilities
│       └── types/
│           └── leads.ts            # TypeScript type definitions
├── docs/                            # Documentation folder
│   └── CODEBASE_SUMMARY.md         # This file
├── assets/                          # App icons and images
│   ├── CWMLogo.png                 # Main logo (7099x5584)
│   ├── icon.png
│   ├── splash-icon.png
│   ├── adaptive-icon.png
│   ├── favicon.png
│   ├── fb.png                      # Facebook icon (deprecated - now using badges)
│   └── IG.png                      # Instagram icon (deprecated - now using badges)
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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
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
├── AuthScreen (when not authenticated)
│   ├── Logo container with shadow
│   ├── Email/Password inputs (modern card design)
│   ├── Sign In / Sign Up toggle
│   ├── Google OAuth button
│   └── Authentication handling
│
└── LeadsScreen (when authenticated)
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
        ├── Contact buttons (Call, Text, Email)
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

2. **No Session:**
   - Display `AuthScreen` (modernized login)
   - User can sign in with email/password or Google OAuth
   - On successful auth, session is set

3. **Active Session:**
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
- Sign in and sign up functionality
- Session persistence
- Auth state change listener
- Sign out capability
- Modern, card-based login UI with purple branding

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
2. **No Search/Filter:** All leads are displayed, no search or filtering capability
3. **Limited Pagination:** Only fetches 50 most recent leads per table
4. **No Offline Support:** Requires active internet connection
5. **No Push Notifications:** No real-time updates when new leads arrive
6. **Image Asset Issue:** Logo image (CWMLogo.png) is not square (7099x5584), should be square for Android adaptive icon
7. **Duplicate Dependencies:** Multiple copies of `expo-constants` exist in node_modules (requires cleanup)

---

## 🔮 Potential Next Steps

### High Priority
1. ✅ **Lead Detail View:** COMPLETED - Full detail view with navigation
2. ✅ **Pull to Refresh:** COMPLETED - Manual data refresh capability
3. ✅ **Status Updates:** COMPLETED - Quick status chip selection
4. ✅ **Activity Logging:** COMPLETED - Log calls, texts, emails, notes
5. **Search & Filter:** Search by name, email, status, etc.
6. **Pagination:** Load more leads as user scrolls (currently limited to 50)
7. **Lead Creation/Editing:** Add forms to create and update leads
8. **Fix Image Assets:** Create square logo for Android adaptive icon
9. **Dependency Cleanup:** Resolve duplicate expo-constants packages

### Medium Priority
10. **Real-time Updates:** Use Supabase subscriptions for live data
11. **Offline Support:** Cache data locally for offline viewing
12. **Push Notifications:** Alert users of new leads
13. **Lead Assignment:** Assign leads to team members from mobile
14. **Advanced Filtering:** Filter by date range, campaign, platform
15. **Export Functionality:** Export leads to CSV/PDF

### Low Priority
16. **Analytics Dashboard:** Charts and metrics (partially implemented)
17. **Dark Mode:** Theme switching
18. **Multi-language Support:** Internationalization
19. **Biometric Auth:** Face ID / Touch ID login
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

### `App.tsx` (~2600 lines)
Main application file containing:
- All component definitions:
  - `AuthScreen` - Modernized login with Google OAuth
  - `Dashboard` - New dashboard view with stats and guide
  - `LeadsScreen` - Leads list with tabs and pull-to-refresh
  - `LeadDetailView` - Full lead detail with activity logging
  - `App` - Root component with session management
- All TypeScript types (Lead, MetaLead, ActivityLog, etc.)
- Authentication logic (email/password + Google OAuth)
- Data fetching logic with RBAC filtering
- Activity logging functionality
- All styles (~150+ style definitions)
- Helper functions (formatStatus, getTimeAgo, etc.)

### `src/lib/supabase.ts` (13 lines)
Supabase client initialization with environment variable validation.

### `src/lib/roles.ts` (~100 lines)
RBAC utilities:
- `getUserRole()` - Fetch user role from team_members table
- `getUserTeamMemberId()` - Get team member ID for filtering
- `canSeeAllLeads()` - Check if user is admin
- Type definitions for UserRole

### `src/lib/types/leads.ts` (11 lines)
Type definitions for Lead model (currently duplicated in App.tsx).

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
   - Columns: id, created_at, first_name, last_name, email, phone, status, loan_purpose, price, down_payment, credit_score, message, realtor_id
   - Used for general lead management (website leads)
   - RBAC: Filtered by realtor_id for non-admin users

2. **`meta_ads` table:**
   - Columns: id, created_at, first_name, last_name, email, phone, status, platform, campaign_name, ad_id, ad_name, adset_id, adset_name, form_id, form_name, realtor_id
   - Used for Meta advertising platform leads
   - RBAC: Filtered by realtor_id for non-admin users

3. **`team_members` table:**
   - Used for RBAC role management
   - Columns: id, user_id, role, email
   - Roles: 'admin' | 'realtor'

4. **`activity_log` table:**
   - Tracks all lead interactions
   - Columns: id, created_at, lead_id, meta_lead_id, activity_type, note, user_id, user_email
   - Activity types: 'call', 'text', 'email', 'note'

### Authentication
- Uses Supabase Auth with email/password and Google OAuth
- Session management handled by Supabase SDK
- Auth state persisted automatically
- Deep linking for OAuth callbacks

---

## 📝 Code Quality Notes

### Strengths
- **Modern UI/UX** with purple/green brand colors
- **Comprehensive feature set** (dashboard, detail view, activity logging)
- **TypeScript** for type safety
- **RBAC implementation** for team management
- **Proper error handling** with user-friendly messages
- **Loading and empty states** throughout
- **Pull-to-refresh** for data updates
- **Deep linking** for OAuth and contact actions
- **Consistent styling** with design system
- **Well-commented sections** and helper functions

### Areas for Improvement
- **Large single file:** App.tsx is ~2600 lines (should be split into components)
- **Types are duplicated** (in App.tsx and types/leads.ts)
- **No unit tests** or integration tests
- **No component library** (could use React Native Paper, NativeBase, etc.)
- **Styles could be extracted** to separate file or theme provider
- **No logging/analytics integration** (e.g., Sentry, Mixpanel)
- **Image assets need optimization** (logo is not square)
- **Duplicate dependencies** in node_modules need cleanup
- **Limited pagination** (only 50 leads per table)
- **No search/filter** functionality yet

---

## 📅 Recent Changes (November 2025)

### Major Features Added
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

### UI/UX Improvements
- Modernized login screen with card design and purple branding
- Color-coded status badges (New, Contacted, Qualified, etc.)
- Platform badges (FB, IG, MSG, WA) - text-based for instant loading
- Green accent color for positive actions and stats
- Purple gradient headers with rounded corners
- Improved typography with letter spacing
- Enhanced shadows and elevation
- Better spacing and visual hierarchy

### Technical Improvements
- Updated deep linking scheme to `com.closewithmario.mobile`
- Added Android intent filters for OAuth
- Implemented RBAC filtering for team members
- Added activity log table integration
- Improved error handling and loading states
- Added helper functions (formatStatus, getTimeAgo)
- Better TypeScript type definitions

### Bug Fixes
- Fixed duplicate style definitions
- Resolved platform icon loading issues
- Fixed contact button icon visibility
- Corrected OAuth redirect URI configuration

### Build Information
- **Latest iOS Build:** Build 3 (Production, Nov 20, 2025)
- **Build Status:** Successful
- **Distribution:** App Store ready

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
- **Main File:** `App.tsx` (~2600 lines)
- **Color Scheme:** Purple (#7C3AED) + Green (#10B981)

### Main Components
1. `AuthScreen` - Login with email/password and Google OAuth
2. `Dashboard` - Stats, guide, and recent leads (initial view)
3. `LeadsScreen` - Tabbed list view with pull-to-refresh
4. `LeadDetailView` - Full lead details with activity logging

### Database Tables
- `leads` - Website leads with realtor_id for RBAC
- `meta_ads` - Meta advertising leads with realtor_id for RBAC
- `team_members` - User roles (admin/realtor)
- `activity_log` - Lead interaction history

### Current State
- ✅ Full CRUD for lead status and activities
- ✅ RBAC with admin/realtor roles
- ✅ Modern UI with brand colors
- ✅ Google OAuth working
- ✅ iOS Production Build 3 deployed
- ⚠️ Need to fix: Square logo for Android, duplicate dependencies
- 🔜 Next: Search/filter, pagination, lead creation

### Important Notes
- All code in single `App.tsx` file (should be refactored)
- Deep link scheme: `com.closewithmario.mobile://auth/callback`
- Supabase URL must have this redirect URL configured
- RBAC filters leads by `realtor_id` for non-admin users
- Activity logging writes to `activity_log` table

---

**End of Codebase Summary**
