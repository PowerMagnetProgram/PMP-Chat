# PulseChat

A responsive realtime chat app built with HTML, CSS, vanilla JavaScript, Firebase Authentication, Cloud Firestore, and Firebase Hosting.

## Firebase Setup

1. Create a Firebase project at `https://console.firebase.google.com`.
2. Add a Web App and copy the Firebase config.
3. Replace the placeholder values in `js/firebase.js`.
4. Enable Authentication with the Email/Password provider.
5. Create a Cloud Firestore database.
6. Deploy the rules in `firestore.rules`.

## Local Run

Because the app uses ES modules, run it from a local server:

```bash
npx serve .
```

Then open the shown local URL in your browser.

## Firestore Indexes

Firestore may prompt you to create composite indexes for message queries that combine `senderId`, `receiverId`, and `createdAt`. Click the generated Firebase console link if prompted.

## Deploy To Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting firestore
firebase deploy
```

Use the current folder as the hosting public directory and keep `firestore.rules` when prompted.
