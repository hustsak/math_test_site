# Math Exercise Site

A teacher-managed math exercise website. You create an exercise (by hand or with AI), share its link, and students type their name and answer, with no student accounts. Answers are graded on the server and you see every submission in the admin dashboard.

**Stack:** Next.js 14 (App Router) · TypeScript · Firebase Auth + Firestore · KaTeX · Claude API (optional, for AI features)

## Features

**Teacher (`/admin`)**
- One private teacher login (Firebase Auth).
- Create, edit, duplicate, publish/unpublish and delete exercises.
- Question types: **number/fraction**, **text/expression**, **multiple choice**.
- Live KaTeX preview for questions, choices and explanations. Khmer text works everywhere.
- Per-question points and Khmer explanations; time limit; deadline; one attempt per name; shuffle question order per student.
- **✨ Generate questions with AI**: topic, level, count, type, Khmer or English. AI questions are tagged "Check answer" until you edit them, and you get a warning if you publish unreviewed ones.
- **✨ Write explanation with AI**: step-by-step Khmer (or English) explanation for any question. If the AI's own solution disagrees with your answer key, the explanation starts with a WARNING line.
- Results: every student's name, score, answers, time taken, late flag; **per-question difficulty bars**; **Re-grade** all submissions after fixing an answer key; **CSV export** (Excel-friendly, Khmer-safe).

**Student (`/e/<exercise-id>`)**
- No login. Enter a name and start.
- Symbol bar (− × ÷ ² √ π ≤ ≥ ≠) for typed answers; radio buttons for multiple choice.
- Countdown timer on the server's clock, auto-submit at zero, progress survives a page refresh.
- After submitting: score, the correct answer for each wrong question, and your explanation.

**Security**
- Correct answers and explanations are never sent to students' browsers before they submit. Students only use server API routes.
- Firestore rules allow only your account to read or write from the browser.
- AI routes and re-grade require a valid Firebase login for the admin email. The AI key lives only on the server.

## Setup

1. **Create a Firebase project** at https://console.firebase.google.com
2. **Enable Authentication → Email/Password.** In the *Users* tab, add your own teacher account manually. There is no sign-up page, so nobody else can create one.
3. **Create a Firestore database** (production mode).
4. **Publish the rules:** open `firestore.rules`, replace `teacher@example.com` with your email, and paste the file into Firestore → Rules → Publish.
5. **Service account key:** Project settings → Service accounts → Generate new private key.
6. Copy `.env.example` to `.env.local` (or edit the provided `.env.local`) and fill in every value. `NEXT_PUBLIC_ADMIN_EMAIL` must be the same email as in the rules.
7. **AI features (optional):** create an API key at https://console.anthropic.com and set `ANTHROPIC_API_KEY`. Without it everything else works; the AI buttons just show an error.
8. Run:
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```
9. Go to `/admin`, sign in, click **New exercise**, add questions (or generate them), **Save & publish**, then **Copy link** and send it to students.

## Deploy to Vercel

Push the folder to GitHub, import it in Vercel, and add the same variables from `.env.local` under *Project → Settings → Environment Variables*. For `FIREBASE_PRIVATE_KEY`, paste the key exactly as in the downloaded JSON (with the `\n` sequences). Then add your Vercel domain under Firebase → Authentication → Settings → Authorized domains. AI routes can take up to a minute, so use a Vercel plan that allows it (the routes ask for 60 s).

## Writing questions

- **Just type math naturally:** `3*4` → 3 × 4, `x^2` → x², `3/4` → a fraction, `sqrt(49)` → √49, `x>=2` → x ≥ 2, `2^(n+1)`, `(a+b)/c`. No dollar signs needed, and it also works in students' typed answers (they see a live preview). Dates like `10/12/2026` would be read as a fraction; wrap them in text or avoid them.
- For more advanced math, use LaTeX between dollar signs: `$\frac{3}{4}+\frac{1}{2}$`, `$x^2+2x+1$`, `$\sqrt{49}$`, `$(-5)+8$`, `$2x+3=11$`, `$x^2\geq 0$`. Use `$$...$$` for a centered display equation.
- **Number or fraction**: `3/4`, `0.75` and `6/8` all count as equal; a typographic minus `−5` is accepted; `1,5` is read as 1.5.
- **Text / expression**: compared ignoring spaces and capitals, with symbols normalised (`x²` = `x^2`, `≥` = `>=`, `√49` = `sqrt49`). Give several accepted forms separated by `|`, for example `x>=2|x≥2`.
- **Multiple choice**: 2 to 6 choices; select the correct one with the radio button.
- If you fix a wrong answer key after students have submitted, open the results page and press **Re-grade**.

## Limits to be aware of

- Students don't sign in, so the site can't prove who they are. "One attempt per name" only blocks the same typed name; a student could use another name.
- The timer is enforced on the server: an answer sheet that arrives well after the time limit is accepted but flagged **Late**.
- AI can be wrong. Always review generated questions and answers before publishing.
- Deleting an exercise keeps its submissions in Firestore; remove them from the Firebase console if you want them gone.

## Tests

`npm run test:grade` checks the answer-matching and whole-sheet grading logic (needs Node 22.18+).

## Project layout

```
src/app/admin/…                 teacher dashboard, editor (with AI panel), results
src/app/e/[id]/page.tsx         student exercise page
src/app/api/exercises/[id]/     public exercise, start attempt, submit + grade (server only)
src/app/api/ai/…                AI question generation and explanations (admin only)
src/app/api/admin/regrade/      re-grade all submissions (admin only)
src/lib/grade.ts                answer normalisation and matching
src/lib/gradeExercise.ts        grades a whole answer sheet
src/lib/ai.ts                   Claude API client (server only)
src/components/MathText.tsx     KaTeX rendering of text with $math$
firestore.rules                 teacher-only database access
```
