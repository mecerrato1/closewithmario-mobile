# CloseWithMario Mobile - Codebase Summary

**Last Updated:** February 25, 2026 at 1:00 PM EST  
**Platform:** iOS Mobile Application  
**EAS Account:** mecerrato1  
**Latest Build:** iOS Production Build 82 (v1.1.65, Feb 25, 2026)  
**Major Refactor:** November 26, 2025 - Modular architecture with separated screens and styles  
**Security Update:** November 29, 2025 - Face ID/Touch ID biometric authentication  
**Architecture Update:** Post-Jan 2026 - Bottom tab navigation, Realtor CRM, Mortgage Calculator, Push Notifications  
**Feature Update:** February 25, 2026 - Quick Capture (Quick Leads) feature with photo attachments, convert-to-lead, cross-tab navigation  
**Bug Fix:** January 14, 2026 - Mortgage calculator Doc Stamps (Mortgage) now zeroes out for FLHFC DPA programs

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
├── App.tsx                          # Main application entry point (~2500+ lines)
├── index.ts                         # Expo entry file
├── app.json                         # Expo configuration (v1.1.65, build 82)
├── package.json                     # Dependencies and scripts
├── .env                             # Environment variables (Supabase credentials)
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   └── QuoteOfTheDay.tsx   # Daily motivational quote component (~72 lines)
│   │   ├── navigation/
│   │   │   └── BottomTabs.tsx      # ✨ Bottom tab bar (Leads, Quick Leads, Realtors, Calculator)
│   │   ├── realtors/               # ✨ Realtor CRM components
│   │   │   ├── RealtorCard.tsx     # Realtor list card with avatar, brokerage, lead count
│   │   │   ├── RealtorFilters.tsx  # Stage filter chips (All/Hot/Warm/Cold)
│   │   │   ├── RealtorStageBadge.tsx # Color-coded stage badge
│   │   │   └── NeedsLoveSection.tsx  # Horizontal "needs love" realtor cards
│   │   ├── DPAEntryModal.tsx       # ✨ Down Payment Assistance entry/edit modal
│   │   └── SmsMessaging.tsx        # ✨ In-app SMS messaging component (Twilio-backed)
│   ├── constants/
│   │   └── salesQuotes.ts          # Sales motivation quotes (~171 lines, 40 quotes)
│   ├── contexts/
│   │   └── AppLockContext.tsx       # Biometric authentication context (~112 lines)
│   ├── screens/
│   │   ├── AuthScreen.tsx          # Login/signup screen with OAuth
│   │   ├── AuthenticatedRoot.tsx   # ✨ Tab-based navigation container
│   │   ├── LeadDetailScreen.tsx    # Lead detail view with activities (~3700+ lines)
│   │   ├── LockScreen.tsx          # Face ID/Touch ID lock screen
│   │   ├── MortgageCalculatorScreen.tsx # ✨ Full mortgage calculator (~1900 lines)
│   │   ├── ProfileSettingsScreen.tsx # ✨ Profile settings (avatar, sign out)
│   │   ├── TeamManagementScreen.tsx # Team management for admins
│   │   ├── realtors/               # ✨ Realtor CRM screens
│   │   │   ├── AddRealtorScreen.tsx     # Add realtor form + import from contacts
│   │   │   ├── RealtorDetailScreen.tsx  # Realtor detail, activity log, templates
│   │   │   └── RealtorsListScreen.tsx   # Searchable realtor list with filters
│   │   └── tabs/                   # ✨ Tab screen wrappers
│   │       ├── CalculatorTabScreen.tsx  # Calculator tab wrapper
│   │       ├── MyLeadsTabScreen.tsx     # Leads tab wrapper
│   │       ├── RealtorsTabScreen.tsx    # Realtors tab with list/detail/add navigation
│   │       └── ScenariosTabScreen.tsx   # Scenarios tab (placeholder)
│   ├── styles/
│   │   ├── appStyles.ts            # All app styles in one place (~2120 lines)
│   │   └── theme.ts                # Theme colors (light/dark mode support)
│   ├── features/
│   │   └── quickCapture/            # ✨ Quick Capture (Quick Leads) feature
│   │       ├── QuickCaptureTab.tsx  # Tab container with list/add/detail navigation
│   │       ├── types.ts             # QuickCapture, QuickCaptureAttachment, payload types
│   │       ├── services/
│   │       │   └── quickCaptureService.ts  # Supabase CRUD, attachments, convert-to-lead
│   │       ├── screens/
│   │       │   ├── QuickCapturesListScreen.tsx  # Searchable list with status filters
│   │       │   ├── AddQuickCaptureScreen.tsx    # Add form with photo attachments
│   │       │   └── QuickCaptureDetailScreen.tsx # Detail/edit view with convert button
│   │       └── components/
│   │           └── SelectRealtorModal.tsx  # Realtor picker modal with search
│   ├── hooks/                      # ✨ Custom React hooks
│   │   ├── useAiLeadAttention.ts   # AI attention badge data hook
│   │   └── useRealtors.ts          # Realtor list state, search, filters, refresh
│   ├── utils/
│   │   ├── calculateMI.ts          # ✨ Mortgage insurance calculator (Conv/FHA/VA)
│   │   ├── dpaCalculations.ts      # ✨ DPA amount, payment, LTV/CLTV calculations
│   │   ├── dpaTypes.ts             # ✨ DPA types, presets (HTH, FL Assist, FHFC, etc.)
│   │   ├── floridaCounties.ts      # ✨ Florida county list for tax calculations
│   │   ├── floridaTaxes.ts         # ✨ FL lender's title, intangible tax, doc stamps
│   │   ├── getQuoteOfTheDay.ts     # Quote selection logic
│   │   ├── mortgageCalculations.ts # ✨ Full mortgage calculation engine
│   │   ├── outlookCalendar.ts      # ✨ Open Outlook calendar events from app
│   │   ├── parseRecordingUrl.ts    # Audio recording URL parser
│   │   ├── profilePicture.ts       # ✨ Profile picture upload/remove (user + realtor)
│   │   ├── rateService.ts          # ✨ FRED API mortgage rate fetching with cache
│   │   ├── vcard.ts                # ✨ Contact save + import from device contacts
│   │   └── __tests__/              # Test folder
│   └── lib/
│       ├── supabase.ts             # Supabase client configuration
│       ├── supabase/               # ✨ Supabase data access modules
│       │   ├── realtors.ts         # Realtor CRUD, assignments, activities, brokerages
│       │   └── leadTracking.ts     # ✨ Lead tracking (auto-track/untrack by status)
│       ├── roles.ts                # RBAC role management utilities
│       ├── textTemplates.ts        # SMS/Email templates with variables (~417 lines)
│       ├── realtorTextTemplates.ts # ✨ 7 bilingual realtor communication templates
│       ├── callbacks.ts            # Notification scheduling utilities
│       ├── notifications.ts        # ✨ Push notification registration (Expo Push Tokens)
│       ├── featureFlags.ts         # ✨ Feature flags (ALLOW_SIGNUP)
│       ├── leadsHelpers.ts         # Lead helper functions and constants
│       └── types/
│           ├── leads.ts            # TypeScript type definitions (leads, meta, activity)
│           └── realtors.ts         # ✨ Realtor CRM types (Realtor, Assignment, Activity)
├── docs/
│   └── CODEBASE_SUMMARY.md         # This file
├── assets/
│   ├── CWMLogo.png                 # Main logo
│   ├── MortgageCalc.png            # ✨ Calculator tab icon
│   ├── BrowardHPA_Ad.jpg           # Ad image for Broward HPA campaign
│   ├── Fl_Renter_Ad.png            # Ad image for FL Renter campaign
│   ├── Condo_Ad.jpg                # Ad image for Condo campaign
│   ├── Green_Acres_Ad.jpg          # Ad image for Green Acres campaign
│   ├── LO.png                      # Loan officer placeholder image
│   ├── icon.png
│   ├── splash-icon.png
│   ├── adaptive-icon.png
│   └── favicon.png
├── ios/                             # iOS native project files
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
  source?: string | null;        // 'My Lead', 'CTA Form', 'Referral', etc.
  source_detail?: string | null; // Referral text OR quick_captures.id UUID (for converted captures)
  lo_id?: string | null;         // For LO assignment
  realtor_id?: string | null;    // For RBAC filtering
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

### Quick Capture Type (from `quick_captures` table)
```typescript
type QuickCapture = {
  id: string;
  created_at: string;
  created_by_user_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  realtor_id: string | null;
  notes: string | null;
  status: 'open' | 'converted' | 'archived';
  converted_lead_id: string | null;
  last_touched_at: string;
};
```

### Quick Capture Attachment Type (from `quick_capture_attachments` table)
```typescript
type QuickCaptureAttachment = {
  id: string;
  created_at: string;
  quick_capture_id: string;
  file_path: string;
  file_url: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
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

#### Dashboard Screen (NEW) ✨ UPDATED Dec 2
- **Purple gradient header** with "Dashboard" title
- **Quote of the Day** - Daily motivational sales quote (40 rotating quotes)
  - Purple gradient card with golden "Daily Motivation" header
  - Personalized per user (based on email hash + day of year)
  - Quotes from sales coaching, Zig Ziglar, James Clear, etc.
  - Italic quote text with author attribution
- **Stats grid** (3 cards):
  - Meta Ads count
  - My Leads count
  - Total Leads count
- **Performance section** (4 cards with emojis):
  - ✨ New Leads
  - 🎯 Qualified
  - 🎉 Closed
  - ⚠️ Needs Attention (filters leads requiring follow-up)
- **"Needs Attention" filter** - Shows leads with attention badges (no response, stale, etc.)
- Tapping performance cards filters the lead list by status
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
8. ✅ **Lead Creation:** COMPLETED (Dec 1, 2025) - LOs can create "My Lead" leads with referral source
9. **Pagination:** Load more leads as user scrolls (currently limited to 50)
10. **Lead Editing:** Edit existing lead details (name, email, phone, etc.)
11. **Fix Image Assets:** Create square logo for Android adaptive icon
12. **Dependency Cleanup:** Resolve duplicate expo-constants packages
13. **Push Notifications:** Implement actual notifications for callbacks

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

### `src/screens/LeadDetailScreen.tsx` (~1700 lines) ✨ UPDATED
Comprehensive lead detail view:
- Sticky header with navigation (back, next/previous)
- Sticky name bar (always visible when scrolling)
- Status management with dropdown picker
- LO assignment (admin only)
- Contact buttons (Call, Text with templates, Email, Voice Note)
- Activity logging section (Call, Text, Email, Note, Voice)
- Voice note recording with preview flow (record → preview → save)
- Activity history display with voice note playback
- **"My Lead" badge** with green styling for self-created leads
- **Delete button** for "My Lead" leads (red, with confirmation)
- **Referral source display** when `source_detail` is text
- **"View Quick Capture & Photos" link** when lead was converted from a quick capture (detects UUID in `source_detail`, navigates cross-tab to captures)
- Text template modal with bilingual support
- Callback scheduling
- Ad image viewer for Meta leads
- Deep linking for phone/SMS/email
- LO can delete activities on their own "My Lead" leads

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

### `src/lib/textTemplates.ts` (~417 lines) ✨ UPDATED Dec 2
SMS/Email text message templates with bilingual support:
- **11 pre-written templates** (Initial Contact, Document Follow-up, Pre-approval Check-in, Stop Paying Rent, Not Ready - General, Not Ready - Credit, Callback Confirmation, Hung Up, Variable Income Docs, Self-Employed Docs, **W2 Regular**)
- **Bilingual support:** English and Spanish versions for all templates
- **Works for both SMS and Email** - Same templates used in text and email functionality
- Variable replacement system: `{fname}`, `{loFullname}`, `{loFname}`, `{loPhone}`, `{loEmail}`, `{platform}`, `{recentYear}`, `{prevYear}`, **`{callbackTime}`**
- **Dynamic year calculation:** `{recentYear}` = current year - 1, `{prevYear}` = current year - 2
- **Smart callback dates:** `{callbackTime}` shows "today at 6:00 PM", "tomorrow at 10:00 AM", or "12/05/2025 at 2:30 PM"
  - Only fetches future callbacks (ignores past dates)
  - Empty string if no callback scheduled
- `formatPlatformName()` - Converts FB/IG to Facebook/Instagram (case-insensitive)
- **Platform name formatting in detail view:** FB → Facebook, IG → Instagram (bold display)
- `fillTemplate()` - Replaces template variables with actual values including dynamic years and callback times
- `getTemplateText()` - Returns English or Spanish version based on preference
- `getTemplateName()` - Returns template name in selected language
- **Auto-detection:** Automatically uses Spanish if lead's `preferred_language` is 'spanish'
- **Manual override:** Language toggle in template modal for manual selection
- **Document Checklists:** Variable Income Docs, Self-Employed Docs, and **W2 Regular** templates with tax year placeholders
- **W2 Regular template:** Simplified checklist for W2 employees (most recent paystub + 2 years W-2s + driver's license)
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

### `src/components/dashboard/QuoteOfTheDay.tsx` (~72 lines) ✨ NEW Dec 2
Daily motivational quote component:
- Displays rotating sales/motivation quotes
- Purple gradient card with golden header
- Bulb icon with "Daily Motivation" label
- Italic quote text with author attribution
- Personalized per user (email hash + day of year)
- 40 curated quotes from sales coaching experts
- Seamlessly integrated into dashboard view

### `src/constants/salesQuotes.ts` (~171 lines) ✨ NEW Dec 2
Sales motivation quotes database:
- **40 curated quotes** for loan officers and sales professionals
- Topics: Speed to lead, follow-up, pipeline management, consistency
- Authors: Sales Coaching, Zig Ziglar, James Clear, Mortgage Coaching
- TypeScript type: `SalesQuote { text: string; author: string }`
- Examples:
  - "Speed to lead is the #1 predictor of your closing rate."
  - "The fortune is in the follow-up." - Zig Ziglar
  - "Your future closings are hiding in today's follow-ups."

### `src/utils/getQuoteOfTheDay.ts` (~25 lines) ✨ NEW Dec 2
Quote selection logic:
- Calculates day of year for daily rotation
- Optional user-based offset for personalization
- Deterministic selection (same quote per user per day)
- Returns `SalesQuote` object with text and author
- Used by `QuoteOfTheDay` component

### `src/styles/theme.ts` (~27 lines) ✨ NEW Dec 2
Theme color system:
- Light and dark color schemes defined
- `useThemeColors()` hook for theme-aware components
- Supports future dark mode implementation
- Colors: background, cardBackground, headerBackground, text, border
- Currently app uses light mode only

### `app.json` (~84 lines)
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
   - Columns: id, created_at, first_name, last_name, email, phone, status, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id, source, source_detail
   - Used for general lead management (website leads + LO self-created leads)
   - `source`: Origin of lead ('My Lead', 'CTA Form', 'Referral', 'Preapproval Wizard', etc.)
   - `source_detail`: Referral text for self-created leads, OR `quick_captures.id` UUID for converted captures
   - RBAC: Filtered by lo_id or realtor_id for non-admin users
   - LO assignment via lo_id foreign key
   - **Delete RLS policy** requires `source = 'My Lead'` for LO deletion

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
   - Manages realtor contacts in the CRM
   - Columns: id, first_name, last_name, email, phone, brokerage, active, campaign_eligible, email_opt_out, preferred_language, secondary_language, profile_picture_url, created_by_user_id, user_id, created_at, updated_at

6. **`realtor_assignments` table:**
   - Links realtors to loan officers (many-to-many)
   - Columns: id, realtor_id, lo_user_id, relationship_stage (hot/warm/cold), notes, last_touched_at, created_at

7. **`realtor_activities` table:**
   - Tracks interactions with realtors
   - Columns: id, realtor_id, lo_user_id, activity_type (note/call/text/email/meeting), content, created_at

8. **`lead_activities` table:**
   - Tracks interactions for website leads
   - Columns: id, created_at, lead_id, activity_type, notes, created_by, user_email, audio_url
   - Activity types: 'call', 'text', 'email', 'note'
   - `audio_url` stores voice note recordings

9. **Supabase Storage Buckets:**
   - **`activity-voice-notes`** - Stores voice note audio files
     - Public read access for playback
     - Authenticated upload/delete access
     - Files organized by lead ID
   - **`quick-capture-attachments`** - Stores quick capture photo attachments
     - Signed URL access (1-hour expiry)
     - Authenticated upload/delete access
     - Files organized by capture ID

10. **`quick_captures` table:**
    - Columns: id, created_at, created_by_user_id, first_name, last_name, email, phone, realtor_id, notes, status, converted_lead_id, last_touched_at
    - Quick lead capture for fast data entry with photo attachments
    - `status`: 'open' | 'converted' | 'archived'
    - `converted_lead_id`: FK to `leads.id` (set when converted, cleared on lead delete)
    - RLS: Filtered by `created_by_user_id`

11. **`quick_capture_attachments` table:**
    - Columns: id, created_at, quick_capture_id, file_path, file_url, mime_type, width, height, size_bytes, sort_order
    - Stores photo attachments for quick captures
    - `file_path`: Path in `quick-capture-attachments` storage bucket
    - `quick_capture_id`: FK to `quick_captures.id`

7. **`meta_ad_activities` table:**
   - Tracks interactions for meta leads
   - Columns: id, created_at, meta_ad_id, activity_type, notes, created_by, user_email, audio_url
   - Activity types: 'call', 'text', 'email', 'note'
   - `audio_url` stores voice note recordings

8. **`lead_callbacks` table:**
   - Stores scheduled callback reminders
   - Columns: id, created_at, lead_id, meta_ad_id, callback_time, note, user_id, completed
   - Used with Expo Notifications for reminders

9. **`sms_messages` table:**
   - Stores SMS conversation history (Twilio-backed)
   - Columns: id, direction (inbound/outbound), from_number, to_number, message_text, created_at, sent_at, received_at, status
   - Used by `SmsMessaging.tsx` component for in-app messaging

10. **`expo_push_tokens` table:**
    - Stores device push notification tokens
    - Columns: user_id, push_token, device_type, is_active
    - Upsert on conflict (user_id, push_token)
    - Token deactivated on sign out

11. **Lead tracking columns** (on `leads` and `meta_ads` tables):
    - `is_tracked` (boolean) - Whether lead is pinned for follow-up
    - `tracking_reason` - 'manual' | 'auto_docs_requested' | 'auto_qualified'
    - `tracking_note` - User-added note for tracked leads
    - `tracking_note_updated_at` - Timestamp of last note update

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

## 📅 Recent Changes (November 2025 - February 2026)

### February 25, 2026 - Quick Capture (Quick Leads) Feature (v1.1.65, Build 82)

#### ⚡ Quick Capture Feature - Fast Lead Entry with Photo Attachments
1. **Quick Capture CRUD** - Full create, read, update, delete for quick lead captures
   - First name (required), last name, phone, email, notes, realtor link
   - Phone validation (10-digit) and email validation (regex) on save
   - Email normalized to lowercase before saving
   - Status management: open → converted / archived
   - Delete functionality with storage cleanup (removes attachments from bucket)

2. **Photo Attachments**
   - Attach photos during quick capture creation
   - Photos uploaded to `quick-capture-attachments` Supabase Storage bucket
   - Signed URL generation for secure viewing (1-hour expiry)
   - Photos displayed in detail screen with full-size viewing
   - Attachments cleaned up on capture deletion

3. **Convert to Lead**
   - "Convert to Lead" button on detail screen (only shown for non-converted captures)
   - Maps fields: first_name, last_name, phone, email, notes → message, realtor_id
   - Sets `source: 'My Lead'` and `source_detail: <capture_id>` (UUID) on the new lead
   - Resolves `lo_id` from `loan_officers` table based on authenticated user
   - Sets `loan_purpose: 'Home Buying'` and `status: 'new'`
   - Updates quick capture status to 'converted' with `converted_lead_id` pointing to new lead
   - Converted banner shown on capture detail after conversion

4. **Lead → Quick Capture Navigation (Cross-Tab)**
   - "View Quick Capture & Photos" purple banner on lead detail when `source_detail` is a UUID
   - Clicking navigates from Leads tab → Quick Leads tab → opens the capture detail
   - Uses `onNavigateToCapture` callback threaded through: `AuthenticatedRoot` → `LeadsScreen` → `LeadDetailView`
   - `QuickCaptureTab` accepts `initialCaptureId` prop for cross-tab deep linking

5. **Lead Delete Fix (FK Constraint)**
   - Deleting a lead that was converted from a quick capture now clears `converted_lead_id` first
   - Resets quick capture status back to 'open' so it can be re-converted
   - Prevents FK constraint violation (`quick_captures_converted_lead_id_fkey`)

6. **Quick Capture Screens**
   - **`QuickCapturesListScreen`** - Searchable list with status filter chips (All/Open/Converted/Archived), color-coded status badges
   - **`AddQuickCaptureScreen`** - Form with photo attachments, realtor picker, validation
   - **`QuickCaptureDetailScreen`** - View/edit with KeyboardAvoidingView, convert/archive/delete actions
   - **`SelectRealtorModal`** - Searchable realtor picker with KeyboardAvoidingView and `keyboardShouldPersistTaps`

7. **Quick Capture Service** (`quickCaptureService.ts`)
   - `fetchQuickCaptures()` - List with optional status/query filters
   - `fetchQuickCapture()` - Single capture by ID
   - `createQuickCapture()` - Insert with auto `created_by_user_id`
   - `updateQuickCapture()` - Partial update
   - `deleteQuickCapture()` - Delete with storage attachment cleanup
   - `uploadAttachment()` - Upload photo to Supabase Storage
   - `deleteAttachment()` - Remove photo from storage + DB
   - `fetchAttachments()` - List attachments with signed URLs
   - `convertQuickCaptureToLead()` - Full conversion flow

---

### February 24, 2026 - Import Realtor from Contacts & Search Fixes (v1.1.64, Build 81)

#### 📇 Import Realtor from Device Contacts
1. **Import from Contacts button** on Add Realtor screen
   - Opens a searchable contact picker modal with all device contacts
   - Auto-fills first name, last name, phone, email, and profile picture
   - Uses existing `expo-contacts` dependency (already used for saving leads to contacts)
   - Phone numbers normalized (strips country code prefix, formats to (xxx) xxx-xxxx)
   - Brokerage and other fields remain manual (not available from contacts)

2. **New utilities in `src/utils/vcard.ts`**
   - `getDeviceContacts()` - Fetches all device contacts with permission handling
   - `PickedContact` interface - firstName, lastName, phone, email, imageUri

#### 🔍 Search Improvements
3. **Full-name search fix** - Realtor search now matches partial full names
   - "marlene h" now correctly finds "Marlene Howard"
   - Changed from separate first_name/last_name matching to concatenated fullName matching
   - Fix in `src/lib/supabase/realtors.ts`

4. **Cursor visibility fix** - Search input cursor now visible
   - Added `cursorColor="#FFFFFF"` and `selectionColor` to realtor list search box
   - Fix in `src/screens/realtors/RealtorsListScreen.tsx`

---

### January 2026 – February 2026 - Bottom Tabs, Realtor CRM, Mortgage Calculator, Push Notifications, SMS Messaging

#### 🗂️ Bottom Tab Navigation Architecture
1. **`AuthenticatedRoot.tsx`** - New tab-based navigation container
   - 4 tabs: **Leads**, **Scenarios**, **Realtors**, **Calculator**
   - `BottomTabs.tsx` component with emoji + image icons and purple active indicator
   - Cross-tab navigation (e.g., tap a lead from Realtor detail → navigates to Leads tab)
   - Dashboard shows on first load; subsequent Leads tab clicks skip dashboard

#### 🤝 Realtor CRM System (Full Feature)
2. **Realtor Management** - Complete CRM for managing realtor partnerships
   - **Database tables:** `realtors`, `realtor_assignments`, `realtor_activities`
   - **Relationship stages:** Hot (🔴), Warm (🟠), Cold (🔵) with color-coded badges
   - **Brokerage autocomplete** - Fetches existing brokerages to avoid name variations

3. **Realtor Screens**
   - **`RealtorsListScreen.tsx`** - Searchable list with stage filters (All/Hot/Warm/Cold)
   - **`AddRealtorScreen.tsx`** - Full form with profile picture, contact info, brokerage autocomplete, language preferences, campaign eligibility, import from contacts
   - **`RealtorDetailScreen.tsx`** (~1566 lines) - Comprehensive detail view with:
     - Profile picture management (upload/remove)
     - Contact buttons (Call, Text with templates, Email)
     - Activity logging (note, call, text, email, meeting)
     - Activity history display
     - Assigned leads list with status badges (tappable → navigates to lead)
     - Realtor text templates (7 bilingual templates)
     - Stage management, settings toggles, language preferences
     - Delete realtor functionality
     - Save realtor to device contacts

4. **Realtor Components**
   - `RealtorCard.tsx` - List card with avatar (profile pic or initials), brokerage, lead count badge
   - `RealtorStageBadge.tsx` - Color-coded Hot/Warm/Cold badge
   - `RealtorFilters.tsx` - Horizontal stage filter chips
   - `NeedsLoveSection.tsx` - Horizontal scroll of realtors not contacted in 14+ days with quick "Send Update" SMS button

5. **Realtor Data Layer**
   - `src/lib/supabase/realtors.ts` (~655 lines) - Full CRUD:
     - `fetchAssignedRealtors()` - List with search, stage filter, lead counts
     - `fetchNeedsLoveRealtors()` - Realtors with no recent activity
     - `createRealtorAndAssign()` - Insert into `realtors` + `realtor_assignments`
     - `updateRealtor()`, `updateAssignment()`, `deleteRealtor()`
     - `logRealtorActivity()`, `fetchRealtorActivity()`
     - `fetchLeadsByRealtor()` - Leads assigned to a realtor
     - `touchRealtor()` - Update `last_touched_at` timestamp
     - `fetchBrokerages()` - Distinct brokerage names via RPC
   - `src/hooks/useRealtors.ts` - Hook with debounced search, stage filter, refresh
   - `src/lib/types/realtors.ts` - Full type definitions (Realtor, AssignedRealtor, RealtorActivity, CreateRealtorPayload, etc.)

6. **Realtor Text Templates** (`src/lib/realtorTextTemplates.ts`)
   - 7 bilingual templates (English/Spanish):
     - New Brokerage Welcome, Introduction/Partnership, Follow Up, Client Update, Preapproval Offer, Thank You for Referral, Check In
   - Variable replacement: `{realtorFname}`, `{brokerage}`, `{LO fullname}`, `{LO phone}`, `{LO email}`

#### 🧮 Mortgage Calculator (Full Feature)
7. **`MortgageCalculatorScreen.tsx`** (~1910 lines) - Comprehensive mortgage calculator
   - **Loan types:** Conventional, FHA, VA, DSCR
   - **Inputs:** Sales price, down payment %, interest rate, credit score, county, loan term
   - **Calculations:** Monthly P&I, MI, taxes, insurance, HOA, total payment
   - **Florida-specific:** Doc stamps, intangible tax, lender's title, county-based owner's title
   - **Closing costs breakdown:** Lender fees, title fees, government taxes, prepaid items
   - **DPA (Down Payment Assistance):** Add multiple DPA programs with presets (Hometown Heroes, FL Assist, FHFC HFA Plus, FL HLP, etc.)
   - **Live mortgage rates** from FRED API via `rateService.ts` (4-hour cache)
   - **Copy to clipboard** - Formatted summary for sharing with leads
   - **Persistent state** - Inputs saved to AsyncStorage, restored on reopen
   - **VA funding fee** calculation based on first/subsequent use and disability exemption

8. **Calculator Utilities**
   - `mortgageCalculations.ts` - Core calculation engine with closing costs, MI, taxes
   - `calculateMI.ts` - Mortgage insurance grid (Conventional by LTV+credit, FHA annual MIP)
   - `floridaTaxes.ts` - FL doc stamps, intangible tax, lender's title, owner's title by county
   - `floridaCounties.ts` - Complete Florida county list
   - `dpaTypes.ts` - DPA entry types, presets for FL programs
   - `dpaCalculations.ts` - DPA amount, payment (P&I, I/O, fixed), LTV/CLTV calculations
   - `rateService.ts` - FRED API rate fetching with in-memory cache and fallback rates
   - `DPAEntryModal.tsx` - Modal for adding/editing DPA programs

#### 💬 In-App SMS Messaging
9. **`SmsMessaging.tsx`** - Real-time SMS conversation view
   - Fetches SMS history from `sms_messages` Supabase table
   - Send messages via API endpoint (`closewithmario.com`)
   - Chat bubble UI (inbound left, outbound right)
   - Real-time polling for new messages
   - Integrated into Lead Detail Screen

#### 📱 Push Notifications
10. **`src/lib/notifications.ts`** - Expo push notification system
    - `registerForPushNotifications()` - Requests permission, gets Expo push token, stores in `expo_push_tokens` table
    - `unregisterPushNotifications()` - Deactivates token on sign out
    - Foreground notification handler (shows alerts even when app is open)
    - Notification tap listeners for deep linking to specific leads

#### 📌 Lead Tracking
11. **`src/lib/supabase/leadTracking.ts`** - Lead tracking/pinning system
    - `toggleLeadTracking()` - Pin/unpin leads for follow-up
    - `updateTrackingNote()` - Add notes to tracked leads
    - **Auto-tracking:** Automatically tracks leads when status changes to `gathering_docs` or `qualified`
    - **Auto-untracking:** Automatically untracks when status changes to `closed` or `unqualified` (unless manually tracked)
    - Tracking reason labels: manual, auto_docs_requested, auto_qualified

#### 📅 Outlook Calendar Integration
12. **`src/utils/outlookCalendar.ts`** - Create calendar events from app
    - Opens Outlook mobile app with pre-filled event details
    - Supports start time, duration, title, location, notes
    - Includes lead details in event body
    - Timezone-aware date formatting

#### 👤 Profile Settings
13. **`ProfileSettingsScreen.tsx`** - Dedicated profile settings screen
    - View/change profile picture (upload from photo library)
    - Remove custom profile picture
    - Sign out button
    - Uses `profilePicture.ts` utility for Supabase Storage upload

#### 🖼️ Profile Pictures (User + Realtor)
14. **`src/utils/profilePicture.ts`** - Shared image upload utilities
    - `pickProfileImage()` - Launch image picker with square crop
    - `uploadProfilePicture()` / `uploadRealtorProfilePicture()` - Upload to Supabase Storage
    - `removeCustomProfilePicture()` / `removeRealtorProfilePicture()` - Remove from storage
    - `getAvatarUrl()` - Get avatar URL from user metadata

#### 🚩 Feature Flags
15. **`src/lib/featureFlags.ts`** - Environment-based feature toggles
    - `ALLOW_SIGNUP` - Controls whether new user registration is available

---

### January 14, 2026 - Mortgage Calculator Tax Waiver Fix

#### 🧮 Mortgage Calculator Bug Fix
1. **Doc Stamps (Mortgage) Tax Waiver** - Fixed tax not zeroing out for FLHFC programs
   - Doc Stamps (Mortgage) now displays $0 when DPA programs are selected
   - Matches existing Intangible Tax waiver behavior
   - Programs that waive both taxes:
     - Hometown Heroes
     - FL Assist
     - FHFC HFA Plus
     - FL HLP (newly added)
   - Taxes reset to calculated values when DPA programs are removed
   - Updated `hasWaivedTaxProgram` memo to include FL HLP

---

### December 1, 2025 - "My Lead" Self-Created Leads & Voice Note Preview

#### 👤 "My Lead" Feature - LO Self-Created Leads
1. **Add Lead Modal** - Loan officers can create their own leads
   - First name, last name, phone, email fields
   - Referral source field (optional) for tracking lead origin
   - Loan purpose dropdown (inline picker, not modal)
   - Message/notes field
   - Leads created this way have `source: 'My Lead'`
   - Auto-assigns to the creating LO's `lo_id`

2. **"My Lead" Badge** - Visual indicator for self-created leads
   - Green badge with person-add icon on lead cards
   - Also appears in lead detail view
   - Only shows when `source === 'My Lead'`

3. **Swipe-to-Delete** - LOs can delete their own leads
   - Red "Delete" swipe action on lead cards (only for "My Lead" leads)
   - Confirmation alert before deletion
   - Uses database RLS policy requiring `source = 'My Lead'`

4. **Delete Button in Lead Detail** - Alternative to swipe delete
   - Red "Delete" button next to "My Lead" badge
   - Confirmation dialog before deletion
   - Navigates back to lead list after successful deletion

5. **Referral Source Display** - Shows referral info when available
   - Green megaphone icon with referral text
   - Only displays when `source_detail` exists
   - Shows on both lead cards and detail view

#### 🎙️ Voice Note Preview Flow
6. **Record → Preview → Save** - Two-step voice note process
   - Record button starts recording (red pulsing indicator)
   - Stop recording shows preview with playback controls
   - User can play preview before saving
   - Cancel or Save buttons for final decision
   - Prevents accidental saves of unintended recordings

#### 🗑️ LO Activity Deletion
7. **Delete Own Lead Activities** - LOs can manage their activity history
   - Delete button appears on activities for "My Lead" leads
   - Previously only super_admin could delete activities
   - Still requires the lead to be owned by the LO

#### 🧹 Dashboard UI Cleanup
8. **Removed Redundant Elements**
   - Removed "View All Leads" button (Total Leads tile does the same)
   - Removed FAB "Add Lead" button from dashboard view
   - Add Lead only accessible from leads list view now

#### 🐛 Bug Fixes
9. **Fixed `source` field overwrite issue**
   - Dashboard and "All" tab were overwriting database `source` with table type
   - Changed internal type indicator to `_tableType` field
   - Now preserves original `source` values ("My Lead", "Referral", etc.)

10. **Fixed loan purpose picker not working**
    - Converted from nested modal to inline dropdown
    - Updated `LOAN_PURPOSES` to match database check constraint
    - Valid values: 'Home Buying', 'Home Selling', 'Mortgage Refinance', 'Investment Property', 'General Real Estate'

---

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

### December 11, 2025 - AI Badges, Profile Menu & Source Filtering (v1.1.44, Build 60)

#### 🤖 AI-Powered Lead Attention Badges
1. **AI Lead Disposition System** - GPT-4o-mini powered lead prioritization
   - Reads from `lead_attention_cache` Supabase table (fast, no API calls)
   - Priority 1-5 scale with color-coded badges:
     - 🔴 Priority 1-2: Red (URGENT/HIGH - respond immediately/today)
     - 🟠 Priority 3-4: Orange/Yellow (MEDIUM/LOW - follow up soon)
     - 🟢 Priority 5: Green (✅ No Action Needed)
   - Badges display on lead cards and detail view
   - Shows badge regardless of `needsAttention` flag (green badges for no action needed)
   - New hook: `src/hooks/useAiLeadAttention.ts`

2. **AI Badge Integration**
   - `renderLeadItem` and `renderMetaLeadItem` display AI badges
   - `LeadDetailScreen` shows AI badge with priority-based colors
   - Falls back to rule-based badges if no AI data available
   - Cache invalidation on activity logging

#### 👤 Profile Menu Modal
3. **New Profile Menu** - Replaces "Sign Out" button with profile avatar
   - Profile avatar button in header (shows user initial or custom picture)
   - Modal menu with options:
     - 🧮 Payment Calculator
     - 👥 Team Management (super admin only)
     - 📷 Change Profile Picture
     - 🗑️ Remove Custom Picture (if custom avatar exists)
     - 🚪 Sign Out (red)
   - Clean slide-down animation

4. **Notification Bell** - Unread message indicator
   - Bell icon in header next to profile avatar
   - Red badge with unread message count
   - Tapping filters to unread messages on Meta tab
   - Shows "99+" for counts over 99

#### 🔍 Source Filtering for Super Admins
5. **Filter by Source/Ad Name** - Super admin feature
   - New source filter button in filter row
   - Aggregates ad names from meta leads and sources from organic leads
   - Shows count for each source option
   - Smart tab switching (auto-switches to correct tab based on source)
   - Respects other active filters (status, LO)

#### 🐛 Bug Fixes (Dec 3-11)
6. **Fixed filtering issues** after adding source filter
7. **Fixed microphone in use error** - Better error handling for voice recording
8. **Fixed AI badge display** - Shows badge regardless of `needsAttention` flag
9. **Fixed crash issues** - Various stability improvements
10. **Fixed menu layout** - Profile menu positioning and styling

#### 📱 Apple App Store Compliance (Dec 11)
11. **Updated permission descriptions** for Apple approval
    - Microphone: "Close With Mario uses your microphone to record voice notes on leads, such as when you want to add spoken updates instead of typing."
    - Contacts: "Close With Mario uses your contacts only when you choose to save a lead into your device's address book."
    - Photo Library: "Close With Mario uses your photo library only when you choose an image for your profile picture."
    - Camera: "Close With Mario uses your camera only when you take a profile picture so your team can recognize your account."
    - All descriptions now explain the specific use case and user benefit

#### Technical Implementation
- New `useAiLeadAttention` hook queries Supabase directly (no slow API)
- `AiAttentionData` type with `badge`, `priority`, `needsAttention`, `reason`, `suggestedAction`
- Profile menu state: `showProfileMenu`
- Source filter state: `selectedSourceFilter`, `showSourcePicker`
- `uniqueSources` memo aggregates sources from both lead types
- `matchesSourceFilter` helper function

---

### December 2, 2025 Updates

#### UI/UX Enhancements
1. **Quote of the Day Feature** ✨ NEW
   - Daily motivational sales quotes on dashboard
   - 40 curated quotes rotating daily
   - Personalized per user (email + day of year)
   - Purple gradient card with golden "Daily Motivation" header
   - Quotes from sales coaching, Zig Ziglar, James Clear
   - Topics: Speed to lead, follow-up, pipeline, consistency
   - New components: `QuoteOfTheDay.tsx`, `salesQuotes.ts`, `getQuoteOfTheDay.ts`

2. **Dashboard Performance Cards with Emojis**
   - ✨ New Leads
   - 🎯 Qualified
   - 🎉 Closed
   - ⚠️ Needs Attention
   - Visual indicators make cards more engaging and easier to scan

3. **"Needs Attention" Filter**
   - New performance card that filters leads requiring follow-up
   - Shows leads with attention badges (no response, stale, etc.)
   - Integrates with existing attention badge system
   - Filter persists when switching between tabs (Meta Ads, My Leads, Total)

4. **Smart Callback Date Formatting**
   - Callback confirmation template now includes dynamic date/time
   - Shows "today at 6:00 PM" for same-day callbacks
   - Shows "tomorrow at 10:00 AM" for next-day callbacks
   - Shows full date "12/05/2025 at 2:30 PM" for future dates
   - Only fetches future callbacks (ignores past dates)
   - Gracefully handles missing callbacks (omits date if none scheduled)

5. **Platform Name Formatting**
   - Lead detail view now shows full platform names
   - FB → **Facebook** (bold)
   - IG → **Instagram** (bold)
   - Messenger → **Messenger** (bold)
   - WhatsApp → **WhatsApp** (bold)
   - Case-insensitive matching

6. **W2 Regular Document Template**
   - New simplified template for W2 employees
   - Checklist: Most recent paystub, 2 years W-2s, driver's license
   - Bilingual support (English/Spanish)
   - Complements existing Variable Income and Self-Employed templates

7. **Email Templates Integration**
   - All 11 SMS templates now work for email too
   - Template selector in email compose flow
   - Same variable replacement system
   - Bilingual support for email messages

#### Technical Implementation
- Added `callbackTime` variable to template system
- Smart date formatting function with relative dates
- Query optimization to fetch only future callbacks
- Platform name helper function with bold styling
- Template variable expansion for callback dates
- Quote rotation algorithm with user personalization
- Theme system with light/dark mode support (foundation for future dark mode)

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
- **Latest iOS Build:** Build 61 (Production, Dec 11, 2025)
- **App Version:** 1.1.45
- **Build Status:** Successful, submitted to TestFlight
- **Distribution:** App Store ready
- **Latest Features:** AI-powered lead attention badges, profile menu with notification bell, source filtering for super admins, Apple-compliant permission descriptions

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
- **Frontend:** React Native 0.81.5 + Expo SDK 54 + TypeScript 5.9.2
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **SMS:** Twilio via API (closewithmario.com backend)
- **AI:** GPT-4o-mini for lead attention analysis (cached in Supabase)
- **Rates:** FRED API for live mortgage rates
- **Security:** Face ID/Touch ID biometric authentication
- **Navigation:** Bottom tab bar (Leads, Quick Leads, Realtors, Calculator)
- **Main File:** `App.tsx` (~2500+ lines - modular with imported screens)
- **Color Scheme:** Purple (#7C3AED) + Green (#10B981)
- **Version:** 1.1.65 (Build 82)
- **Latest Update:** February 25, 2026

### Main Components
1. `LockScreen` - Face ID/Touch ID biometric authentication
2. `AuthScreen` - Login with email/password and Google OAuth
3. `AuthenticatedRoot` - Tab-based navigation (Leads, Quick Leads, Realtors, Calculator) with cross-tab navigation
4. `BottomTabs` - Bottom tab bar with 4 tabs
5. `Dashboard` - Stats, Quote of the Day, performance cards, and recent leads
6. `LeadsScreen` - Tabbed list view with search, filters, and pull-to-refresh
7. `LeadDetailView` - Full lead details with activity logging, SMS/Email templates, voice notes, in-app SMS messaging, lead tracking, Quick Capture photo link
8. `RealtorsListScreen` - Searchable realtor list with stage filters
9. `AddRealtorScreen` - Add realtor form with import from contacts
10. `RealtorDetailScreen` - Realtor detail with activity log, templates, assigned leads
11. `MortgageCalculatorScreen` - Full mortgage calculator with DPA, closing costs, live rates
12. `ProfileSettingsScreen` - Profile picture management and sign out
13. `TeamManagementScreen` - Manage loan officers and realtors (super admin only)
14. `SmsMessaging` - In-app SMS conversation view (Twilio-backed)
15. `QuickCaptureTab` - Quick Leads tab container (list/add/detail navigation)
16. `QuickCapturesListScreen` - Searchable quick capture list with status filters
17. `AddQuickCaptureScreen` - Add quick capture form with photo attachments
18. `QuickCaptureDetailScreen` - Quick capture detail/edit with convert-to-lead

### Database Tables
- `leads` - Website leads with lo_id, realtor_id, is_tracked, tracking_reason, tracking_note
- `meta_ads` - Meta advertising leads with lo_id, realtor_id, preferred_language, is_tracked
- `team_members` - User roles (super_admin/loan_officer/realtor/buyer)
- `loan_officers` - LO team members with lead_eligible flag
- `realtors` - Realtor CRM contacts with brokerage, language prefs, campaign eligibility, profile picture
- `realtor_assignments` - Links realtors to LOs with relationship stage (hot/warm/cold)
- `realtor_activities` - Realtor interaction history (note/call/text/email/meeting)
- `lead_activities` - Website lead interaction history
- `meta_ad_activities` - Meta lead interaction history
- `lead_callbacks` - Scheduled callback reminders
- `lead_attention_cache` - AI-generated lead attention badges
- `sms_messages` - SMS conversation history (Twilio-backed)
- `expo_push_tokens` - Device push notification tokens
- `quick_captures` - Quick lead captures with status (open/converted/archived), converted_lead_id FK
- `quick_capture_attachments` - Photo attachments for quick captures (file_path in storage bucket)

### Current State (Feb 25, 2026)
- ✅ Full CRUD for lead status and activities
- ✅ RBAC with super_admin/loan_officer/realtor/buyer roles
- ✅ Modern UI with brand colors (purple/green)
- ✅ Google OAuth working
- ✅ Face ID/Touch ID biometric authentication
- ✅ Auto-lock after 10 minutes idle
- ✅ Session persistence with AsyncStorage
- ✅ iOS Production Build 82 deployed (v1.1.65)
- ✅ **Bottom tab navigation** (Leads, Quick Leads, Realtors, Calculator)
- ✅ **Realtor CRM** - Full realtor management with stages, activities, templates, brokerage autocomplete
- ✅ **Import realtor from device contacts** with searchable picker
- ✅ **Mortgage calculator** with DPA programs, closing costs, live FRED API rates, FL taxes
- ✅ **In-app SMS messaging** via Twilio backend
- ✅ **Push notifications** with Expo Push Tokens stored in Supabase
- ✅ **Lead tracking/pinning** with auto-track on status change
- ✅ **Outlook calendar integration** for scheduling appointments
- ✅ **Profile picture management** for users and realtors
- ✅ **Realtor text templates** (7 bilingual templates)
- ✅ **Feature flags** (ALLOW_SIGNUP)
- ✅ SMS/Email templates with bilingual support (11 lead templates + 7 realtor templates)
- ✅ Voice notes recording with preview and playback
- ✅ Unread lead indicator - blue dot
- ✅ Document checklist templates with dynamic years
- ✅ Advanced filtering (status, LO, search, attention, source)
- ✅ Smart navigation (respects all filters, tab-aware)
- ✅ Callback scheduling with smart date formatting
- ✅ AI-powered lead attention badges
- ✅ Profile menu modal with avatar and notification bell
- ✅ Source/ad name filtering for super admins
- ✅ "My Lead" self-created leads with delete capability
- ✅ Quote of the Day - 40 rotating motivational quotes
- ✅ Mortgage calculator Doc Stamps tax waiver for FLHFC programs
- ✅ **Quick Capture (Quick Leads)** - Fast lead entry with photo attachments, convert-to-lead, cross-tab navigation
- ✅ **Quick Capture → Lead linking** - "View Quick Capture & Photos" banner on lead detail with cross-tab navigation
- ✅ **Lead delete FK fix** - Clears quick capture reference before deleting converted leads
- ⚠️ Need to fix: Square logo for Android, duplicate dependencies
- 🔜 Next: Pagination, dark mode implementation

### Important Notes
- **Bottom tab navigation** via `AuthenticatedRoot.tsx` + `BottomTabs.tsx`
- **Face ID/Touch ID required** after 10 minutes of being backgrounded
- Deep link scheme: `com.closewithmario.mobile://auth/callback`
- Supabase URL must have this redirect URL configured
- AsyncStorage used for session persistence and mortgage calculator state
- RBAC filters leads by `lo_id` or `realtor_id` for non-admin users
- Activity logging writes to `lead_activities` or `meta_ad_activities` tables
- **Lead templates** in `src/lib/textTemplates.ts` (11 bilingual messages)
- **Realtor templates** in `src/lib/realtorTextTemplates.ts` (7 bilingual messages)
- **Realtor CRM tables:** `realtors`, `realtor_assignments`, `realtor_activities`
- **Brokerage autocomplete** fetches existing names via `get_all_brokerages` RPC to avoid variations
- **Realtor search** matches concatenated full name (e.g., "marlene h" finds "Marlene Howard")
- **Import from contacts** uses `expo-contacts` (also used for saving leads to contacts)
- **Mortgage calculator** persists inputs to AsyncStorage, fetches live rates from FRED API (4hr cache)
- **DPA presets:** Hometown Heroes, FL Assist, FHFC HFA Plus, FL HLP, Custom
- **Lead tracking** auto-tracks on `gathering_docs`/`qualified`, auto-untracks on `closed`/`unqualified`
- **Push notifications** registered on login, deactivated on logout, stored in `expo_push_tokens`
- **SMS messaging** via `closewithmario.com` API endpoint (Twilio-backed)
- **Outlook calendar** integration via `ms-outlook://` URL scheme
- **"My Lead" leads** have `source: 'My Lead'` and can be deleted by the creating LO
- **Quick Capture** converted leads also have `source: 'My Lead'` with `source_detail` = capture UUID
- **Lead delete** clears `quick_captures.converted_lead_id` FK before deleting to avoid constraint violations
- **Cross-tab navigation:** Leads → Quick Captures via `onNavigateToCapture` callback chain
- Templates auto-fill: {fname}, {loFullname}, {loFname}, {loPhone}, {loEmail}, {platform}, {recentYear}, {prevYear}, {callbackTime}
- Realtor templates auto-fill: {realtorFname}, {brokerage}, {LO fullname}, {LO phone}, {LO email}
- Voice notes stored in Supabase Storage bucket `activity-voice-notes`
- Platform names formatted: FB→Facebook, IG→Instagram (case-insensitive)
- Theme system foundation in place for future dark mode implementation

---

**End of Codebase Summary**
