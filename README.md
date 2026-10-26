# Math Exercise Site

A teacher-managed math exercise website with private student portals and zero-friction parent tracking. You create exercises (by hand or with AI), share links or QR codes, students practice without account friction, and parents follow their child's progress with a single private link.

**Stack:** Next.js 14 (App Router) · TypeScript · Firebase Auth + Firestore · firebase-admin (server) · KaTeX · Claude API (optional, for AI features)

---

## Features

### 1. Teacher Dashboard (`/admin`)
- **Single private teacher login** via Firebase Auth.
- Create, edit, duplicate, publish/unpublish, and delete exercises.
- **Question types:** number/fraction, text/expression, multiple choice.
- **Live KaTeX preview** for formulas, choices, and explanations. Khmer text supported everywhere.
- Per-question points, Khmer explanations, time limits, deadlines, one attempt per name, and question order shuffling.
- **✨ AI Exercise Generation:** topic, difficulty level, count, question type, Khmer or English.
- **✨ AI Step-by-Step Explanations:** instant solution explanations in Khmer.
- **Submission tracking:** per-question difficulty statistics, CSV export, and re-grading capability.
- **Unsubmitted students list:** see exactly who in your roster has not submitted an exercise, and copy a one-click Khmer reminder for Telegram or Facebook Messenger.
- **Parent settings toggle:** optionally enable or disable showing class average percentages to parents.

### 2. Student Roster & Links (`/admin/students` & `/s/<student-token>`)
- **Roster management:** add individual students or paste bulk rosters (one name per line).
- **Secure tokens:** unique, unguessable cryptographic tokens (`crypto.randomBytes`, >= 24 URL-safe characters) generated server-side for each student and parent.
- **Personalized Student Portal (`/s/<student-token>`):**
  - Shows "Hello {name}" and lists published exercises with completion status badges.
  - Tapping an exercise opens the test with the student's name pre-filled and locked.
  - Enforces one attempt per student ID when `oneAttemptPerName` is enabled.
- **Printable QR Sheet:** clean, printable layout with one card per student (student name + student QR code + parent QR code) for gluing directly into exercise notebooks.
- **Token regeneration:** regenerate a parent's tracking link at any time (immediately invalidates old link).
- **Deactivation toggle:** easily deactivate or re-activate students.

### 3. Parent Tracking Portal (`/p/<parent-token>`)
- **Zero friction:** No login, no password, no email, no app download. Parents tap ONE link or scan a QR code.
- **Khmer-first UI:** large, high-contrast text (>= 18px) tailored for parents unfamiliar with technology, with secondary English.
- **Overview header:** friendly completion summary (e.g., "កូនរបស់អ្នកបានធ្វើលំហាត់ 4 ក្នុងចំណោម 6").
- **Latest result card:** prominent score display with expressive faces and accessible colors:
  - 😊 Green (>= 80%): "ល្អណាស់! (Great!)"
  - 😐 Yellow (50% - 79%): "ល្អបង្គួរ (Fair)"
  - 😟 Red (< 50%): "ត្រូវព្យាយាមបន្ថែម (Needs improvement)"
- **Progress trend chart:** clean inline SVG chart tracking percentage performance across the child's last up to 8 exercises.
- **Expandable exercise history:** see each completed test, date, score, mistakes, correct answers, and full KaTeX math explanations. If 100% correct, displays a celebratory "ឆ្លើយត្រូវទាំងអស់!" badge.
- **Pending exercises section:** lists unfinished tests with remaining time countdown in Khmer ("នៅសល់ 2 ថ្ងៃ").
- **Strict data privacy:** unsubmitted exercises never expose question details or answers.
- **Offline cache & PWA:** saves last-loaded data to `localStorage` so results remain viewable without an internet connection. Includes clear 2-step "Add to Home Screen" instructions for Android Chrome and iPhone Safari.

---

## Security & Privacy

1. **Browser-side Firestore Isolation:** `firestore.rules` restricts browser-level read/write access to authenticated teachers only. `students`, `settings`, `exercises`, and `submissions` cannot be read or modified directly from public browser sessions.
2. **Server-Side Token Verification:** Public student (`/s/[token]`) and parent (`/p/[token]`) endpoints query Firestore exclusively through `firebase-admin` API routes. Tokens are never exposed client-side.
3. **Strict Data Sandboxing:** The parent API returns **only** that specific child's results. No other student's name, ID, submission, or token is ever returned or leaked in the API payload.
4. **Anti-Probing & Rate Limiting:** IP rate limiting (60 requests per 10 minutes) protects `/api/parent/[token]` and `/api/student/[token]`. Invalid tokens return generic 404 responses to prevent token enumeration.
5. **No Trackers or Cookies:** Parent pages use `<meta name="robots" content="noindex,nofollow">` and `Cache-Control: no-store` headers without third-party tracking scripts.

---

## Setup Guide

1. **Create a Firebase Project:** https://console.firebase.google.com
2. **Enable Authentication:** Email/Password provider. Manually add your teacher email in the Firebase Console (there is no public registration).
3. **Create Firestore Database:** in Production mode.
4. **Deploy Firestore Rules:** Replace `teacher@example.com` with your admin email in `firestore.rules`, and publish it under *Firestore → Rules*.
5. **Generate Service Account Key:**
   - In Firebase Console: *Project Settings → Service accounts → Generate new private key*.
6. **Configure Environment Variables:**
   - Copy `.env.example` to `.env.local` and set:
     ```env
     NEXT_PUBLIC_FIREBASE_API_KEY=...
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
     NEXT_PUBLIC_FIREBASE_APP_ID=...
     NEXT_PUBLIC_ADMIN_EMAIL=your-teacher-email@example.com

     FIREBASE_PROJECT_ID=...
     FIREBASE_CLIENT_EMAIL=...
     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

     # Optional Claude API key for AI generation features
     ANTHROPIC_API_KEY=...
     ```
7. **Install & Run Locally:**
   ```bash
   npm install
   npm run dev       # http://localhost:3000
   ```
8. **Run Unit Tests:**
   ```bash
   npm test          # Runs grading logic and parent tracking privacy tests
   ```

---

## How to Give Parents Their Link

1. Go to `/admin` and click **Students** in the navigation bar.
2. Click **Add Student** or **Paste Multiple** to import your class roster.
3. Choose your preferred distribution method:
   - **For Telegram or Facebook Messenger:** Click **Copy message for parent**. This copies a ready-to-send Khmer message:
     ```
     សួស្តី! នេះជាតំណរបស់អ្នកដើម្បីមើលលទ្ធផលរបស់ សុខា ជា ៖ https://yoursite.com/p/abcdef123456...
     ```
     Paste this message directly into your private chat with the parent.
   - **For Student Exercise Books:** Click **Print QR Sheet** at the top of the Students page. This generates printable cards (each with student name, student QR, and parent QR). Print them, cut them out, and glue them inside each student's notebook.
4. Advise parents to open the link once and tap **Add to Home screen** so they can check their child's progress anytime without needing an account or app store download.

---

## Firestore Collections

- `students`: `{ name, className?, studentToken, parentToken, active, createdAt }`
- `settings/app`: `{ showClassAverageToParents: boolean }`
- `exercises`: `{ title, description, timeLimitMinutes, deadline, published, shuffleQuestions, questions[] }`
- `submissions`: `{ exerciseId, studentId?, studentName, nameKey, status, startedAt, submittedAt, late, score, total, details[] }`

---

## Project Structure

```
src/app/admin/                  # Teacher dashboard, exercises editor, submissions results
src/app/admin/students/page.tsx # Student roster management, QR sheets & parent messages
src/app/s/[token]/page.tsx      # Student portal (personalized test list & locked names)
src/app/p/[token]/page.tsx      # Parent tracking view (Khmer-first, progress chart & results)
src/app/e/[id]/page.tsx          # Student exercise solver (pre-fills name from token)
src/app/api/parent/[token]/     # Public parent API (strictly sandboxed child results)
src/app/api/student/[token]/    # Public student API (open tests & completion status)
src/app/api/admin/students/     # Admin student CRUD & token regeneration
src/app/api/admin/settings/     # Admin settings (class average visibility)
src/app/api/exercises/[id]/     # Exercise data, start attempt, submit & grade
src/app/manifest.ts             # Web App Manifest for mobile PWA installation
src/components/MathText.tsx     # KaTeX math rendering
src/lib/tokens.ts               # Server-only cryptographic token generator
src/lib/parentTracking.ts       # Face evaluation & data sandboxing builder
src/lib/rateLimit.ts            # In-memory IP rate limiter
firestore.rules                 # Security rules protecting admin data
scripts/test-grade.mjs          # Grading unit tests
scripts/test-parent-tracking.mjs# Parent tracking, face rating & privacy unit tests
```
