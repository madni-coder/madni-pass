# MadniPass — Setup Guide

## Firebase Setup (5 min)

### Step 1: Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → enter project name (e.g., `madni-pass`) → Create
3. You can turn off Google Analytics if you want.

---

### Step 2: Enable Authentication

1. Left sidebar → **Authentication** → Get started
2. **Sign-in method** tab → **Email/Password** → Enable → Save

---

### Step 3: Create Firestore Database

1. Left sidebar → **Firestore Database** → Create database
2. Select **Start in production mode** → Next
3. Choose location (e.g., asia-south1 for India) → Done
4. Go to **Rules** tab → paste these rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /folders/{folderId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /notes/{noteId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

5. Click **Publish**

---

### Step 4: Enable Storage (for images)

1. Left sidebar → **Storage** → Get started
2. Production mode → Next → Done
3. Go to **Rules** tab → paste this:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /images/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Click **Publish**

---

### Step 5: Register Web App

1. Project Overview → click **</>** (Web) icon
2. Enter app nickname → **Register app**
3. Copy the Firebase config — it will look something like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "madni-pass.firebaseapp.com",
  projectId: "madni-pass",
  storageBucket: "madni-pass.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

### Step 6: Update `.env.local`

Open `.env.local` file in project root and enter your values:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=madni-pass.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=madni-pass
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=madni-pass.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

### Step 7: Run the App

```bash
npm run dev
```

Go to your browser: [http://localhost:3000](http://localhost:3000)

---

## Using the App

### When Registering:
- **Email** → your email address
- **Account Password** → for Firebase login
- **Master Password** → ⚠️ THIS IS EXTREMELY IMPORTANT — this password encrypts your notes. Note it down somewhere safe. If you forget it, you will not be able to recover your notes.

### How to write Notes:
```
Insta id - john@gmail.com
Insta pass - 123456

Gmail id - john@mail.com
Pass - 123453
```

### Search:
- Type `insta` in the search bar → only the Instagram note will appear
- Type `gmail` → the Gmail note will appear
- Searching also works within the content of the notes

---

## Security

- **AES-256 encryption** — data is encrypted before being sent to Firebase
- **Master password is never stored** — it remains only in RAM during your session
- **Firebase Security Rules** — only the logged-in user can access their data
- Nobody (not even Firebase employees) can read your encrypted notes without the master password
