# Agent LO Connect: Google Play listing draft

Entered in Play Console as a draft on 2026-11-26: name, short and full description, icon, feature graphic, category.
Contact details published. NOT entered: app content answers. Nothing is submitted for review.
Items marked **CONFIRM** need your decision; legal declarations are yours to make.

## Store listing

**App name** (30 max): Agent LO Connect

**Short description** (80 max):
Leads, follow-ups and messages for loan officers and their assistants.

**Full description** (4,000 max):

Agent LO Connect is a mobile workspace for loan officers to manage leads and follow-ups from anywhere.

WHAT YOU CAN DO
• Today: see who to call, with callbacks that are due and leads that need attention.
• Leads: filter by status and source, and open any lead for its history, notes and contact details.
• Assisting: loan officer assistants switch between their own leads and the officers they help.
• Messages: read and reply to the text and direct message conversations tied to your leads.
• Quick Leads: capture a new contact in the field with photos and notes.
• Realtors: keep your realtor partners and the leads connected to them in one place.
• Calculator: estimate monthly payments and closing costs for common loan scenarios.
• Voice notes: record a spoken update on a lead instead of typing.

SIGN IN
An account is required. Sign in with your email and password or Google. New accounts are set up at agentloconnect.com.

Calculator results are estimates for planning only. They are not a loan offer, rate quote or commitment to lend. Agent LO Connect is a software platform, not a lender or mortgage broker.

(Reminders and push notifications are left out on purpose: they are not expected to work on Android yet.)

## Graphics
- App icon 512 x 512: `play/icon-512.png`
- Feature graphic 1024 x 500: `play/feature-graphic-1024x500.png`
- Phone screenshots: `play/screenshots/` (4, from the testreview account's sample data, tagged `play_screenshots` in the database).

## Category and contact
- Type: App. Category: Business.
- Email: info@agentloconnect.com **CONFIRM** it is monitored
- Website: https://www.agentloconnect.com
- Privacy policy: https://www.agentloconnect.com/privacy

## App content
| Item | Proposed answer |
|---|---|
| Sign-in details | testreview@closewithmario.com (exempt from two-step verification). **You enter the password yourself.** It has almost no sample leads yet. |
| Ads | No ads |
| Content rating | Business / productivity questionnaire. Users can message leads by text. No violence, sexual content, gambling or purchases. |
| Target audience | 18 and over only |
| Government app | No |
| Health features | None |
| Financial features | **CONFIRM.** The app does not lend, broker or move money, but it has a mortgage calculator and tracks mortgage leads. |
| Trader status | **CONFIRM.** Legal declaration for the EU. |
| Account deletion URL | https://www.agentloconnect.com/support once the page says how to request deletion without the app (see below). |

## Data safety (proposed, CONFIRM against the privacy policy)
Collected, encrypted in transit, deletion can be requested. No analytics or advertising SDKs are in the app.

| Data | Why |
|---|---|
| Name, email, phone | Account and app function |
| Other people's contact details (leads, realtors) | App function |
| Financial info on leads (price, down payment, credit score) | App function |
| Photos | Profile picture and Quick Leads |
| Voice recordings | Voice notes on a lead |
| Messages (SMS and direct messages sent through the service) | App function |
| Device or other IDs (push token, sign-in device) | Notifications and security |

**CONFIRM:** whether any provider (text messaging, AI, hosting) counts as "sharing" under Google's definitions, or only as a service provider.

## Website changes needed first
The support page says: "In the mobile app, open the profile menu, choose Profile Settings, then Delete Account."
It should read: "In the app, open the profile menu, choose Settings, then Account, then Delete Account. Without the app, email info@agentloconnect.com to request deletion of your account and data."

## Before publishing
- Run the app on a real Android device, including Google sign-in (checked on an emulator only: lists, messages, Back button).
- Android push notifications need a Firebase setup file that the project does not have.
- A new demo account with made-up data; the current reviewer password is weak.
