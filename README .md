# Expo & EAS Commands Cheat Sheet (Updated)
A simple guide to the **only commands you really need**, written for non‑experts. Use this anytime you're confused about TestFlight, dev builds, Google OAuth testing, or running the app locally.

---

# 🚀 1. How to Build a New iOS Version (TestFlight/Production)
This command **builds** your iOS app for production. It does **not** send it to Apple by itself.

```bash
eas build -p ios --profile production
```

### ✔ What this command does
- Bundles your JS/TS code
- Builds the native iOS app (.ipa)
- Signs it with your Apple credentials
- Stores the build on Expo’s EAS servers

### ❗ What it does **NOT** do
- It does **not** automatically upload to App Store Connect.
- You must run a **separate submit command** (see next section).

---

# 📤 2. How to Send the Latest Build to Apple / TestFlight
After a successful `eas build`, submit that build to Apple with:

```bash
eas submit -p ios --latest
```

### ✔ What this does
- Takes your **most recent** successful iOS EAS build
- Uploads it to **App Store Connect**
- After Apple processes it (usually 5–20 minutes), it shows up under **TestFlight → iOS Builds**

### 🔁 Typical production/TestFlight flow
1. **Update** version & buildNumber in `app.json` (see versioning section below)
2. Run `eas build -p ios --profile production`
3. When it finishes, run `eas submit -p ios --latest`
4. Wait for Apple to process the build

---

# 🧪 3. Run the App Locally with Expo Go
The fastest way to preview UI.

```bash
npx expo start
```

### ✔ Good for
- Layout changes
- Navigation
- Basic logic testing

### ❌ Not good for
- **Google OAuth**
- **Anything requiring native code**

Expo Go cannot run Google login.

---

# 📱 4. Run the App on Your iPhone Like a Real App (Dev Client)
This is how you test **Google OAuth**, **deep links**, **native modules**, and everything that doesn't work in Expo Go.

## Step 1 — Build the Dev Client
```bash
eas build -p ios --profile development
```
Scan the QR code from EAS Build after it's done.

You may need to enable **Developer Mode** on your iPhone.

## Step 2 — Run the Dev Server
```bash
npx expo start --dev-client
```
Then open the **dev client app** on your iPhone.

### ✔ Best for
- Google login testing
- Deep linking
- Real native modules
- Debug logs streamed to your terminal

Then open the **dev client app** on your iPhone.

### ✔ Best for
- Google login testing
- Deep linking
- Real native modules
- Debug logs streamed to your terminal

---

# 🔢 5. Updating Version & Build Number
You must bump these BEFORE sending a new TestFlight build.

Inside `app.json`:

### Version (user-facing)
```json
"version": "1.0.6"
```

### Build number (Apple requires this every build)
```json
"ios": {
  "buildNumber": "10"
}
```

### Simple rule
- **Every new TestFlight build → increase buildNumber**
- **When your app “changes versions” → increase version**

---

# 📝 Summary Table
| Action | Command | Description |
|--------|----------|-------------|
| **Build + upload to TestFlight** | `eas build -p ios --profile production` | Creates & sends new iOS build to Apple |
| **Submit last build again** | `eas submit -p ios --latest` | Uploads last build without rebuilding |
| **Run locally (Expo Go)** | `npx expo start` | No native modules or Google OAuth |
| **Build dev client** | `eas build -p ios --profile development` | Use for real testing on iPhone |
| **Run dev client** | `npx expo start --dev-client` | Connects dev client to your laptop |

---

# 💡 Tips You’ll Refer to Later
- Expo Go **cannot** do Google login → use **dev client**
- TestFlight builds take time to appear
- `eas build` ≠ submitting — sometimes you still need `eas submit`
- Always bump **buildNumber** before a production build
- Dev client = almost exactly like TestFlight, but faster

---
If you want, I can:
- Add screenshots
- Add a versioning strategy section
- Include troubleshooting for rejected TestFlight builds
- Add Google OAuth redirect setup info

Just tell me!
