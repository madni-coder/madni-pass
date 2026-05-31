# MadniPass — Setup Guide

## Firebase Setup (5 min)

### Step 1: Firebase Project banao

1. [console.firebase.google.com](https://console.firebase.google.com) pe jao
2. **"Add project"** click karo → project name do (ex: `madni-pass`) → Create
3. Google Analytics off kar sakte ho

---

### Step 2: Authentication enable karo

1. Left sidebar → **Authentication** → Get started
2. **Sign-in method** tab → **Email/Password** → Enable → Save

---

### Step 3: Firestore Database banao

1. Left sidebar → **Firestore Database** → Create database
2. **Start in production mode** select karo → Next
3. Location choose karo (asia-south1 for India) → Done
4. **Rules** tab pe jao → ye rules paste karo:

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

5. **Publish** karo

---

### Step 4: Storage enable karo (images ke liye)

1. Left sidebar → **Storage** → Get started
2. Production mode → Next → Done
3. **Rules** tab → ye paste karo:

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

4. **Publish** karo

---

### Step 5: Web App register karo

1. Project Overview → **</>** (Web) icon click karo
2. App nickname do → **Register app**
3. Firebase config copy karo — kuch aisa dikhega:

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

### Step 6: `.env.local` update karo

Project root mein `.env.local` file open karo aur apni values dalo:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=madni-pass.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=madni-pass
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=madni-pass.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

### Step 7: App run karo

```bash
npm run dev
```

Browser mein jao: [http://localhost:3000](http://localhost:3000)

---

## App Use Karna

### Register karte waqt:
- **Email** → apni email
- **Account Password** → Firebase login ke liye
- **Master Password** → ⚠️ YE BAHUT ZAROORI HAI — ye password notes encrypt karta hai. Kahi note kar lo. Bhool gaye toh notes recover nahi honge.

### Notes kaise likhein:
```
Insta id - john@gmail.com
Insta pass - 123456

Gmail id - john@mail.com
Pass - 123453
```

### Search:
- Search bar mein `insta` likho → sirf Instagram wala note aayega
- `gmail` likho → Gmail wala note aayega
- Content ke andar bhi search hogi

---

## Security

- **AES-256 encryption** — data Firebase pe jaane se pehle encrypt hota hai
- **Master password kabhi store nahi hota** — sirf RAM mein rehta hai session tak
- **Firebase Security Rules** — sirf logged-in user apna data dekh sakta hai
- Koi bhi (Firebase employee bhi) encrypted notes nahi padh sakta bina master password ke
