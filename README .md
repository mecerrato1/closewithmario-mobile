🚀 Expo & EAS Workflow Cheat Sheet
Dev Client • TestFlight • Tunnel Mode • Google OAuth Support

This guide explains the full workflow for building, installing, and running your Expo/React Native app on iOS — including how to test Google OAuth using a dev client.

Use this anytime you need to:

Build for TestFlight

Build a development client

Run the app on your iPhone

Connect via tunnel mode

Decode the dev server URL

Test Google OAuth, deep links, and native modules

1️⃣ Build an iOS App for TestFlight (Production Build)

Run this to generate a production .ipa:

eas build -p ios --profile production

✔ This does:

Builds your native iOS app

Signs it with your Apple credentials

Uploads the IPA to Expo’s servers

❗ This does not:

Does not automatically send the build to Apple
(You must submit it manually — see next step.)

2️⃣ Submit Your Build to Apple / TestFlight

After the build completes:

eas submit -p ios --latest


This uploads the most recent EAS build to App Store Connect.
After processing (5–20 minutes), the build appears in TestFlight.

3️⃣ Running the App in Expo Go (Simple Preview)
npx expo start


Good for:

Layout/UI testing

Quick screen previews

⚠️ NOT good for Google OAuth
Expo Go cannot use your custom app scheme or native modules.

4️⃣ Build the Dev Client (Required for Google OAuth)

Google OAuth requires a dev client, not Expo Go or TestFlight.

Build it with:

eas build -p ios --profile development


When the build finishes, on your iPhone go to:

https://expo.dev/accounts/<your-account>/projects/<your-project>/builds


Tap the most recent development build → Install.

This installs:

closewithmario-mobile (Development Build)

5️⃣ Start Metro Bundler in Tunnel Mode (Windows-Friendly)

Tunnel mode avoids LAN issues, firewalls, and router isolation.

On your PC:

npx expo start --tunnel --dev-client


Wait until Metro prints:

Metro waiting on closewithmario://expo-development-client/?url=https%3A%2F%2F<encoded-url>


The important part is everything after url=.

Example:

https%3A%2F%2Fg08pu_s-mecerrato1-8081.exp.direct

6️⃣ Decode the Dev Server URL (Super Simple)

Expo uses only two encodings you need to decode:

Encoded	Replace With
%3A	:
%2F	/

Example encoded URL:

https%3A%2F%2Fg08pu_s-mecerrato1-8081.exp.direct


Decoded:

https://g08pu_s-mecerrato1-8081.exp.direct


This decoded URL is what you will enter on your iPhone.

7️⃣ Connect Your iPhone Dev Client to the Dev Server

On your iPhone:

Open
closewithmario-mobile (Development Build)

You’ll see:
No development servers found

Tap: Enter URL manually

Paste the decoded URL:

https://g08pu_s-mecerrato1-8081.exp.direct


Tap Connect

Your app will now load from your laptop — full React Native, with:

Google OAuth

Deep linking

Native modules

Hot reload

Debug logs

Screens updating instantly

8️⃣ Versioning for TestFlight

Before each production build, bump these values in app.json:

App Store version (user-facing):
"version": "1.1.1"

Build number (Apple requires increasing every build):
"ios": {
  "buildNumber": "15"
}


Rule:

Every TestFlight build → bump buildNumber

New app release → bump version

9️⃣ Quick Summary Table
Action	Command	Purpose
Build TestFlight	eas build -p ios --profile production	Create production IPA
Submit to Apple	eas submit -p ios --latest	Upload to TestFlight
Run in Expo Go	npx expo start	Fast UI testing (no OAuth)
Build Dev Client	eas build -p ios --profile development	Needed for Google OAuth
Start Dev Server	npx expo start --tunnel --dev-client	Works on Windows + iPhone
Connect iPhone	Paste decoded URL	Load the app on device
🔟 Summary of Decoding

When Metro prints:

...?url=https%3A%2F%2Fg08pu_s-mecerrato1-8081.exp.direct


Decode:

%3A → :

%2F → /

Final URL you paste:

https://g08pu_s-mecerrato1-8081.exp.direct

🎉 You're Ready for Google OAuth Testing

Using this workflow:

Google OAuth works

Custom scheme works

Deep links work

Supabase Auth works

Native modules work

Dev client matches production behavior