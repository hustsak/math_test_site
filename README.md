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

### 2. Automatic Student Profiles & Admin Management (`/admin/students`)
- **Zero registration for students:** Students type their name and optional class (e.g. 7A) when starting an exercise on `/e/[id]`.
- **Automatic Profile Generation (`profiles`):**
  - Document ID = SHA-256 hash of `profileKey = normalize(name) + "|" + normalize(class)`.
  - Generates an unguessable `parentToken` (>= 24 URL-safe characters) and a device `claimSecretHash`.
  - The student's device stores `claimSecret` in `localStorage` to claim ownership.
- **"Send to Parent" on Result Screen:**
  - When the student finishes an exercise on their device, a prominent "ផ្ញើលទ្ធផលទៅឪពុកម្តាយ" card appears.
  - One-tap "ផ្ញើទៅឪពុកម្តាយ" button uses `navigator.share` (Telegram / Messenger) with a Khmer message.
  - Includes a fallback "Copy link" button and a live QR code that parents can scan directly from the child's screen.
  - A small "My parent link" button also appears on the name screen of subsequent exercises on owner devices.
- **Teacher Student Management (`/admin/students`):**
  - Auto-lists all student profiles with exercises completed, average %, and last activity timestamp.
  - "Copy parent link" and "Copy message for parent" (Khmer text with link).
  - "QR code" preview modal for scanning.
  - "New parent link" regenerates the `parentToken` immediately (old link stops working).
  - "Rename / merge into another student" moves all submissions from typos (e.g. "Sokha" vs "Sokhaa").
  - "Hide" / "Unhide" toggle to manage inactive or test entries.
  - "Print QR sheet" with one card per student (name, class, parent QR code).

### 3. Student Access Control & Manual Payment Expiration (`/admin/students`)
- **Manual Payment Workflow:**
  1. The teacher receives payment manually outside the website (cash, ABA, Wing, etc.).
  2. The teacher adds the approved student to `/admin/students` with an optional class name (e.g. `7A`).
  3. The teacher sets an expiration date (valid in Cambodia time `Asia/Phnom_Penh`, UTC+7).
  4. The teacher shares the exercise link (`/e/[id]`).
  5. The student opens the link, types only their name, and taps Start.
  6. The server checks that the student is on the approved list, that `accessEnabled` is true, and that the expiration date has not passed.
  7. The teacher can extend access (+30 days, +60 days, etc.) or pause/block access from the admin dashboard anytime.
- **Cambodia Timezone (`Asia/Phnom_Penh`, UTC+7) Expiration Rule:**
  - An expiration date is valid through the entire calendar day in Cambodia time.
  - The exclusive boundary is stored server-side as the next local midnight in Cambodia (`2026-10-27T00:00:00+07:00`, which is `2026-10-26T17:00:00.000Z`).
  - Active check: `accessEnabled === true && currentTime < expiresAt`.
  - In-progress attempts started before expiration are permitted to complete normally; however, teachers can explicitly pause/block access at any time.
- **Security Note on Name-Only Access:**
  - Because students only type their names without passwords, accounts, or individual codes, name matching provides access authorization based on teacher approval, but cannot prevent one approved student from entering another approved student's name if they know it.
- **Required Firestore Indexes:**
  - Collection `students`: query `nameKey == ...` (single-field index, automatic in Firestore).
  - Collection `students`: query `nameKey == ... AND classKey == ...` (composite index).

### 4. Parent Tracking Portal (`/p/<parent-token>`)
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

1. **Browser-side Firestore Isolation:** `firestore.rules` restricts browser-level read/write access to authenticated teachers only. `profiles`, `settings`, `exercises`, and `submissions` cannot be read or modified directly from public browser sessions.
2. **Server-Side Token & Secret Verification:** Parent tracking (`/p/[token]`) and student ownership endpoints query Firestore exclusively through `firebase-admin` API routes. `claimSecret` comparisons use constant-time `crypto.timingSafeEqual` against `claimSecretHash`. Plaintext secrets and tokens are never logged.
3. **Device Ownership Protection:** A different device typing the same student name cannot claim the parent link; only the original device with matching `claimSecret` or the teacher can view or share the parent link.
4. **Strict Data Sandboxing:** The parent API returns **only** that specific child's results. No other student's name, ID, submission, or token is ever returned or leaked in the API payload.
5. **Anti-Probing & Rate Limiting:** IP rate limiting (60 requests per 10 minutes) protects `/api/parent/[token]`. Invalid tokens return generic 404 responses to prevent token enumeration.
6. **No Trackers or Cookies:** Parent pages use `<meta name="robots" content="noindex,nofollow">` and `Cache-Control: no-store` headers without third-party tracking scripts.

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

## How Parents Get Their Link

Parents never need to register, remember a password, or provide an email. There are three simple ways for parents to get their tracking link:

### Method 1: Directly from the child's screen after an exercise (Automatic & Recommended)
1. The student opens `/e/[id]`, enters their name and class (e.g. `7A`), and completes the math exercise.
2. On the result screen, an automatic **"ផ្ញើលទ្ធផលទៅឪពុកម្តាយ (Send to Parent)"** card is displayed:
   - **Share via Chat:** The child taps the big primary button **"ផ្ញើទៅឪពុកម្តាយ"**. This launches the phone's native share sheet (Telegram, Messenger, WhatsApp, SMS) with a pre-formatted Khmer message:
     ```
     សួស្តី! នេះជាតំណដើម្បីមើលលទ្ធផលរបស់ សុខា ថ្នាក់ 7A ៖ https://yoursite.com/p/abcdef123456...
     ```
   - **Scan QR Code:** If the parent is nearby, they can simply point their smartphone camera at the QR code on the child's screen to open the tracking page instantly.
   - **Copy Link:** A "ចម្លងតំណ (Copy link)" button copies the direct URL with instant visual confirmation.

### Method 2: From the teacher via the Admin Portal (`/admin/students`)
1. In `/admin/students`, the teacher sees all automatically registered student profiles.
2. The teacher can:
   - Click **"Copy message for parent"** to copy a friendly Khmer message with the private parent link and paste it into Telegram or Messenger.
   - Click **"Print QR Sheet"** to print student/parent QR cards that can be cut out and glued into physical student exercise notebooks.

### Method 3: From the student's exercise start screen
- Once a student begins an exercise on their device, their profile is securely remembered in `localStorage`.
- On future exercises, a small **"តំណឪពុកម្តាយ (My parent link)"** button appears directly on the name screen so the child can re-share their parent link at any time.

Parents are prompted on their page to tap **"Add to Home Screen"** (with clear 2-step guides for Android Chrome and iPhone Safari), giving them 1-tap access to live math results anytime!

### 5. Permanent Student Portal (`/student`)
- **Single permanent link:** Teachers share `/student` once instead of sending daily exercise links.
- **Automatic Grade Identification:** Students type only their approved name. The system identifies their grade (7–12) and status.
- **Categorized Dashboard:**
  - **Available Now:** Active exercises scheduled for their grade that are open.
  - **Upcoming:** Future scheduled exercises with publication countdown in Cambodia time.
  - **Completed:** Scores, percentages, and submission timestamps.
  - **Parent Link:** 1-tap QR code and link sharing for parents.

### 6. Exercise Scheduling & Grade Targeting (Grades 7–12)
- **Advance preparation:** Create draft exercises, assign to one or multiple grades (7–12), and schedule automatic publication.
- **No background cron job needed:** Automatic publication evaluates `Date.now() >= scheduledPublishAt` in Cambodia time (`Asia/Phnom_Penh`, UTC+7) on every read. Future scheduled exercises remain hidden from students until their exact release time.
- **Permanent results retention:** Submissions store full snapshots (`exerciseTitle`, `grade`, `answers`, `details`) and are never deleted when exercises are edited, closed, or when student access expires.

---

## Firestore Collections

- `students`: `{ name, nameKey, grade (7-12), className, classKey, accessEnabled, active, expiresAt (Timestamp), createdAt, updatedAt, lastActivityAt?, studentToken, parentToken }`
- `profiles`: `{ name, className?, profileKey, parentToken, claimSecretHash, hidden?, createdAt, updatedAt?, lastActivityAt? }`
- `settings/app`: `{ showClassAverageToParents: boolean }`
- `exercises`: `{ title, description, timeLimitMinutes, deadline, published, shuffleQuestions, gradeLevels (number[]), publicationMode ('instant' | 'scheduled' | 'draft'), scheduledPublishAt, timezone, questions[] }`
- `submissions`: `{ exerciseId, exerciseTitle?, grade?, profileId?, studentId?, studentName, nameKey, status, startedAt, submittedAt, late, score, total, answers?, details[] }`

---

## Project Structure

```
src/app/admin/                  # Teacher dashboard, exercises editor, submissions results
src/app/admin/students/page.tsx # Automatic student profiles, rename/merge, QR sheets & parent messages
src/app/admin/exercises/[id]/results/page.tsx # Exercise results with unsubmitted student alerts & reminders
src/app/p/[token]/page.tsx      # Parent tracking view (Khmer-first, progress chart & results)
src/app/e/[id]/page.tsx          # Student exercise solver (class input, Send to Parent card & QR)
src/app/api/parent/[token]/     # Public parent API (strictly sandboxed child results)
src/app/api/admin/profiles/     # Admin profile list, rename/merge, hide, and token regeneration
src/app/api/admin/settings/     # Admin settings (class average visibility)
src/app/api/exercises/[id]/     # Exercise start (profile link), submit & grading
src/app/manifest.ts             # Web App Manifest for mobile PWA installation
src/components/MathText.tsx     # KaTeX math rendering
src/lib/profiles.ts             # Server-only profile hashing, claimSecret verification & tokens
src/lib/parentTracking.ts       # Face evaluation & data sandboxing builder
src/lib/rateLimit.ts            # In-memory IP rate limiter
firestore.rules                 # Security rules protecting admin data
scripts/test-grade.mjs          # Grading unit tests
scripts/test-parent-tracking.mjs# Parent tracking, face rating, token & privacy unit tests
```
