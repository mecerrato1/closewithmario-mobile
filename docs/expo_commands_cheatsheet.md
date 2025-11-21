# Expo & EAS Commands Cheat Sheet
A friendly, non‑technical guide to the commands you need when working with your Expo/React Native app. Use this anytime you forget which command does what.

---

## 🚀 1. Sending a New Build to Apple / TestFlight
This is the command you run whenever you want a **new version** to show up in TestFlight.

```
eas build -p ios --profile production
```

**What it does:**
- Builds your iOS app
- Signs it with your Apple credentials
- Uploads it automatically to App Store Connect
- Appears in TestFlight after Apple finishes processing

**Use this when:**
- You fixed something
- You added something
- You updated icons, code, etc.

---

## 🧪 2. Running the App Locally in Expo Go
This is the fastest way to preview your UI and basic app behavior.

```
npx expo start
```

**How it works:**
- Opens a QR code in your terminal/browser
- Scan it with **Expo Go** on your iPhone

**Important limitation:**
> ❌ Google OAuth and other native modules **do NOT work** in Expo Go.

**Use this when:**
- You just want to see layout changes
- You want to test navigation or simple logic

---

## 📱 3. Running the App on Your iPhone as a "Trusted" App (Dev Client)
This is the most realistic way to run your app during development.
It behaves like a TestFlight or App Store build — but still lets you see live logs.

### Step A — Build the Dev Client (only needed when native code changes)
```
eas build -p ios --profile development
```
Install the build on your iPhone via QR code or link.
You may have to **trust the developer** in Device Management.

### Step B — Start the Dev Server
```
npx expo start --dev-client
```

Then simply open the **dev client app** on your iPhone.

**Use this when:**
- You want to test **Google Sign-In**
- You want to debug with **real native modules**
- You want **console logs** in your terminal while your iPhone runs the app

---

## 📝 Summary Cheat Sheet

| Action | Command | Notes |
|-------|---------|-------|
| **Push new version to TestFlight** | `eas build -p ios --profile production` | Uploads to Apple automatically |
| **Submit latest build again** | `eas submit -p ios --latest` | Rarely needed |
| **Run locally (Expo Go)** | `npx expo start` | Fastest, **no Google OAuth** |
| **Build Dev Client for iPhone** | `eas build -p ios --profile development` | Install & trust on device |
| **Run Dev Client with logs** | `npx expo start --dev-client` | Best for debugging login |

---

## 💡 Helpful Tips
- Expo Go is great for UI but **not** for real authentication.
- Dev Client = full native app + instant updates from your laptop.
- TestFlight = real production-like build used for QA.
- Use production builds for final testing before App Store submission.

---

If you ever want a section added, screenshots, or a printable PDF version, just ask.

