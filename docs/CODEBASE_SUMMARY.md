# CloseWithMario Mobile - Codebase Summary

**Last Updated:** November 20, 2025  
**EAS Account:** mecerrato1

---

## 📋 Project Overview

**CloseWithMario Mobile** is a React Native mobile application built with Expo that displays and manages leads from a Supabase backend. The app features authentication and displays leads from two different sources: a general `leads` table and a `meta_ads` table for Meta advertising platform leads.

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
├── App.tsx                          # Main application entry point
├── index.ts                         # Expo entry file
├── app.json                         # Expo configuration
├── package.json                     # Dependencies and scripts
├── .env                             # Environment variables (Supabase credentials)
├── src/
│   └── lib/
│       ├── supabase.ts             # Supabase client configuration
│       └── types/
│           └── leads.ts            # TypeScript type definitions
├── docs/                            # Documentation folder
├── assets/                          # App icons and images
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
};
```

---

## 🎯 Application Architecture

### Component Hierarchy

```
App (Root)
├── AuthScreen (when not authenticated)
│   ├── Email/Password inputs
│   ├── Sign In / Sign Up toggle
│   └── Authentication handling
│
└── LeadsScreen (when authenticated)
    ├── Header with Sign Out button
    ├── Debug info display
    ├── Loading state
    ├── Error state
    ├── Empty state
    └── Lead lists (FlatList)
        ├── Leads from `leads` table
        └── Meta leads from `meta_ads` table
```

### Application Flow

1. **Initial Load:**
   - Check for existing Supabase session
   - Show loading spinner while checking

2. **No Session:**
   - Display `AuthScreen`
   - User can sign in or sign up
   - On successful auth, session is set

3. **Active Session:**
   - Display `LeadsScreen`
   - Fetch data from both `leads` and `meta_ads` tables
   - Display leads in separate sections
   - Show debug info (row counts)

4. **Sign Out:**
   - Call `supabase.auth.signOut()`
   - Clear session state
   - Return to `AuthScreen`

---

## 🔐 Authentication

### Features
- Email/password authentication via Supabase Auth
- Sign in and sign up functionality
- Session persistence
- Auth state change listener
- Sign out capability

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
```

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

### Error Handling
- Individual error handling for each table query
- Graceful degradation (shows data from successful queries)
- Error messages displayed to user
- Console logging for debugging

---

## 🎨 UI/UX Features

### Screens

#### AuthScreen
- Clean, centered layout
- Email and password inputs
- Toggle between sign in/sign up modes
- Error message display
- Loading state during authentication
- Keyboard-aware view for iOS

#### LeadsScreen
- Header with app title and sign out button
- Debug info showing row counts
- Loading spinner with message
- Error state with error message
- Empty state when no data
- Scrollable list of leads
- Card-based lead display

### Lead Card Display
- Full name (first + last name)
- Status information (formatted to match website)
- Contact info (email or phone) with icon
- Campaign name (for Meta leads) with icon
- Platform badge (for Meta leads) - shows Facebook, Instagram, etc.

---

## 🎨 Styling

### Design System
- **Primary Color:** `#007aff` (iOS blue)
- **Background:** `#fff` (white)
- **Card Background:** `#fafafa` (light gray)
- **Border Color:** `#eee` (very light gray)
- **Error Color:** `red`
- **Text Colors:** `#000` (default), `#555` (secondary), `#888` (tertiary)

### Key Style Patterns
- Consistent padding and margins
- Rounded corners (8px border radius)
- Card-based layouts with subtle borders
- Responsive typography
- Touch-friendly button sizes

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
    "scheme": "closewithmario",
    "newArchEnabled": true,
    "ios": {
      "bundleIdentifier": "com.closewithmario.mobile"
    },
    "android": {
      "package": "com.closewithmario.mobile"
    }
  }
}
```

### Deep Linking
- **Scheme:** `closewithmario://`
- Configured for Google OAuth (via `expo-auth-session` and `expo-web-browser`)

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
1. **No Lead Creation:** App is read-only, no ability to add/edit leads
2. **No Search/Filter:** All leads are displayed, no filtering capability
3. **Limited Pagination:** Only fetches 50 most recent leads per table
4. **No Lead Details:** No drill-down view for individual leads
5. **No Offline Support:** Requires active internet connection
6. **No Push Notifications:** No real-time updates when new leads arrive

---

## 🔮 Potential Next Steps

### High Priority
1. **Lead Detail View:** Tap a lead to see full details
2. **Search & Filter:** Search by name, email, status, etc.
3. **Pagination:** Load more leads as user scrolls
4. **Pull to Refresh:** Manual data refresh capability
5. **Lead Creation/Editing:** Add forms to create and update leads

### Medium Priority
6. **Real-time Updates:** Use Supabase subscriptions for live data
7. **Offline Support:** Cache data locally for offline viewing
8. **Push Notifications:** Alert users of new leads
9. **Lead Assignment:** Assign leads to team members
10. **Status Updates:** Quick actions to change lead status

### Low Priority
11. **Analytics Dashboard:** Charts and metrics
12. **Export Functionality:** Export leads to CSV/PDF
13. **Dark Mode:** Theme switching
14. **Multi-language Support:** Internationalization
15. **Biometric Auth:** Face ID / Touch ID login

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

### `App.tsx` (480 lines)
Main application file containing:
- All component definitions (AuthScreen, LeadsScreen, App)
- All TypeScript types
- Authentication logic
- Data fetching logic
- All styles

### `src/lib/supabase.ts` (13 lines)
Supabase client initialization with environment variable validation.

### `src/lib/types/leads.ts` (11 lines)
Type definitions for Lead model (currently duplicated in App.tsx).

### `app.json` (38 lines)
Expo configuration for iOS, Android, and web platforms.

### `.env` (2 lines)
Environment variables for Supabase connection.

---

## 🤝 Integration Points

### Supabase Tables
1. **`leads` table:**
   - Columns: id, created_at, first_name, last_name, email, phone, status
   - Used for general lead management

2. **`meta_ads` table:**
   - Columns: id, created_at, first_name, last_name, email, phone, status, platform, campaign_name
   - Used for Meta advertising platform leads

### Authentication
- Uses Supabase Auth with email/password
- Session management handled by Supabase SDK
- Auth state persisted automatically

---

## 📝 Code Quality Notes

### Strengths
- Clean component separation
- TypeScript for type safety
- Proper error handling
- Loading and empty states
- Consistent styling
- Well-commented sections

### Areas for Improvement
- Types are duplicated (in App.tsx and types/leads.ts)
- All code in single file (App.tsx is 480 lines)
- No unit tests
- No component library (could use React Native Paper, NativeBase, etc.)
- Styles could be extracted to separate file
- No logging/analytics integration

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

**End of Codebase Summary**
