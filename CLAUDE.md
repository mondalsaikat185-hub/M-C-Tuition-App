# CLAUDE.md — M-C Tuition Application: Master AI Guide

> **READ THIS ENTIRE FILE BEFORE TOUCHING ANY CODE.**
> This is the single source of truth for every AI assistant working on this project.
> Violating any rule here will cause billing overruns, broken UI, or failed deployments.

---

## 🎯 Project Identity

**Application Name:** M-C Tuition Application  
**Owner / Developer:** Saikat Mondal (`mondal.saikat185@gmail.com`)  
**Repository:** `mondalsaikat185-hub/M-C-Tuition-App` (branch: `main`)  
**Local Working Path:** `C:\Users\monda\Desktop\Tution Application`  
**Deployment:** Firebase Hosting + Oracle VPS (`https://saikat-tuition.duckdns.org`)

---

## 🏫 What This Application Does

A **private tuition management portal** for a single teacher (admin) and their students in India.

### Core Features:
1. **Student Library** — Students access PDF notes and interactive exams assigned by the admin.
2. **Live Exam Sessions** — Admin starts a timed live exam with a 5-character access code; students join using the code to record attendance.
3. **PDF Watermarking** — All PDFs served to students are watermarked with their name and phone number via a private Oracle VPS server.
4. **Payment Tracking** — Admin records monthly fee payments; students see their payment status.
5. **Attendance Tracking** — Attendance is auto-recorded when a student joins a live exam session.
6. **Notifications** — Admin broadcasts messages to all students or a specific batch.
7. **Admin Dashboard** — Manage students, batches, library items, exams, results, payments, settings.
8. **Student Dashboard** — View profile, recent exams, payment status, recent library additions.

### Roles:
- **Admin** (teacher) — Full control over all data and features.
- **Student** — Read-only access to their batch's library, exams, payments, notifications.

---

## 🔴 ABSOLUTE #1 PRIORITY: Firebase Spark Free Quota

> **THIS IS THE MOST CRITICAL CONSTRAINT IN THE ENTIRE PROJECT.**
> The application runs on **Firebase Spark (free) plan: 50,000 Firestore reads per day.**
> A handful of students opening the app can exhaust this quota in hours if there are bugs.
> **Every single Firestore read must be justified. Treat each read like real money.**

### Firebase Setup:
- **Auth:** Google OAuth (popup → redirect fallback)
- **Firestore Database ID:** `ai-studio-5a848f2e-44a8-4b45-8f95-7971b615f241`
- **Offline Cache:** `persistentLocalCache` + `persistentMultipleTabManager` (IndexedDB)
- **In-Memory Cache:** `cachedGetDocs()` in `src/lib/cache.ts` — 15-minute TTL, module-level Map

### Firestore Collections:
| Collection | Purpose | Typical Size |
|---|---|---|
| `users` | All users (students + admin) | ~20-50 docs |
| `admins` | Admin UIDs (security check) | 1-2 docs |
| `batches` | Student batch groups | 2-5 docs |
| `library` | Library items (folders, PDFs, exams) | ~100-500 docs |
| `batchAssignments` | Links batches to library items | ~200-1000 docs |
| `payments` | Payment records per student | ~50-200 docs |
| `notifications` | Admin/student messages | ~20-100 docs |
| `examSessions` | Live exam sessions (transient) | ~10-50 docs |
| `attendance` | Daily attendance records per batch | ~30-100 docs |
| `libraryChunks` | Large PDFs stored as base64 chunks | variable |

---

## ⚡ Quota Rules — NEVER BREAK THESE

### ❌ FORBIDDEN — These destroy the quota:

1. **`onSnapshot` for students** — Real-time listeners charge reads on EVERY document change for ALL connected clients simultaneously. Example: 5 students online + 1 notification change = 5×30 = 150 reads instantly. **NEVER use `onSnapshot` for student-facing queries.** Use `getDocs` + polling instead.

2. **`useEffect` with Firestore calls + state in dependency array** — If a `useEffect` fetches data AND updates state, AND that state is in the dependency array, it creates an infinite read loop. Example: `libraryCache` was in the dependency array of the effect that also called `setLibraryCache` — this caused the quota to run out within one session.

3. **Reads without `limit()`** — NEVER fetch an entire collection without a `limit()`. Always use `limit()` even if you think the collection is small.

4. **Multiple `getDoc` calls for the same document in one operation** — In `AuthProvider`, the original code called `getDoc(userRef)` 3 times per login. Now it uses `Promise.all` to fetch in parallel (2 reads). Never add extra redundant reads.

5. **No caching** — Every `getDocs` / `getDoc` that is not wrapped in `cachedGetDocs` is a potential quota drain. Use `cachedGetDocs` for all non-critical, non-real-time data.

### ✅ REQUIRED — Always do this:

1. **Use `cachedGetDocs(query, cacheKey)`** from `src/lib/cache.ts` for all standard reads. The TTL is 15 minutes.
2. **Use `limit(n)`** on every Firestore query. Even if you want "all", cap it at a safe number (e.g., `limit(100)`).
3. **Use `Promise.all`** to parallelize multiple independent reads (reduces latency AND rounds).
4. **Call `clearCache(key)`** after any write operation so the next read gets fresh data.
5. **Poll instead of `onSnapshot`** — If live updates are needed, use `setInterval` with `getDocs` every 5 minutes.
6. **Check cache before fetching** — Use `useRef` to hold cached data in effects so the effect doesn't need state in its dependency array.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Routing | React Router v6 (`useSearchParams` for library nav state) |
| Auth | Firebase Auth (Google OAuth) |
| Database | Firebase Firestore (named DB) |
| Hosting | Firebase Hosting |
| PWA | `vite-plugin-pwa` (installable, offline-capable) |
| PDF Watermark | Oracle VPS (`https://saikat-tuition.duckdns.org`) — students only |
| PDF Encryption | `@pdfsmaller/pdf-encrypt` (phone number as password) |
| PDF Rendering | `pdf-lib`, `react-pdf` |
| Quiz Engine | `src/components/quiz/UnifiedQuizPlayer.tsx` |
| Error Handling | `src/components/ErrorBoundary.tsx` wraps entire app |

---

## 📁 Critical File Map

```
src/
├── App.tsx                          ← Main router, TopNav, StudentDashboard
├── main.tsx                         ← App entry, ErrorBoundary wraps App
├── lib/
│   ├── cache.ts                     ← cachedGetDocs() — USE THIS FOR ALL READS
│   ├── firebase.ts                  ← Firebase init with persistentLocalCache
│   ├── exam-session-utils.ts        ← createExamSession, verifyAndJoinSession, attendance
│   ├── firestore-error.ts           ← Error handling helper
│   └── utils.ts                     ← safeToDate() and other helpers
├── components/
│   ├── AuthProvider.tsx             ← Auth state, user loading (QUOTA SENSITIVE)
│   ├── NotificationsPanel.tsx       ← Notification UI
│   ├── ErrorBoundary.tsx            ← Global crash catcher
│   └── quiz/
│       └── UnifiedQuizPlayer.tsx    ← Handles all 5 quiz types
├── pages/
│   ├── StudentLibrary.tsx           ← Student PDF/exam browser (QUOTA SENSITIVE)
│   ├── AdminLibrary.tsx             ← Admin library manager (Firebase only, no Oracle)
│   ├── Pages.tsx                    ← AdminStudents, AdminPayments, StudentPayments, AdminBatches
│   ├── AdminResults.tsx             ← Exam results viewer
│   ├── AdminSettings.tsx            ← App settings
│   └── ProfileSetup.tsx             ← Student profile completion
└── types/
    └── QuizData.ts                  ← TypeScript types for all quiz formats
```

---

## 🔐 Security & Access Rules

### Oracle VPS:
- **ONLY** `src/pages/StudentLibrary.tsx` communicates with the Oracle server.
- `AdminLibrary.tsx` does **NOT** use Oracle — pure Firebase only.
- Oracle API Key is in env var `VITE_ORACLE_API_KEY`. **NEVER change or expose this key.**
- Oracle serves watermarked PDFs. The watermark includes student name + download timestamp.

### Admin vs Student:
- Admin is identified by existence in `admins/{uid}` Firestore collection.
- Fallback: if `users/{uid}.role === 'admin'`, treat as admin and auto-migrate to `admins` collection.
- Students with `status: 'incomplete'` are redirected to `/setup-profile`.
- Students with `status: 'pending'` see a waiting screen.
- Students with `status: 'rejected'` see a rejection screen with re-apply option.

---

## ⚛️ React Rules (Strict)

### Keys:
- **ALWAYS** use Firestore document `id` as the React `key` prop: `key={item.id}`
- **NEVER** use array index as key: `key={index}` is **FORBIDDEN**
- **NEVER** append index to an id: `key={`${item.id}-${index}`}` is **FORBIDDEN**
- Reason: Ghost state bugs occur when lists reorder or items delete with index keys.

### Hooks Order:
- **NEVER** return early from a component before all hooks are declared.
- All `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback` must execute unconditionally on every render.
- Conditional early returns must come AFTER all hook declarations.
- Violation causes: "Rendered fewer hooks than expected" → blank white screen.

### useEffect Dependencies:
- If an effect calls a setter (e.g., `setLibraryCache`) AND that state is in the dependency array → infinite loop.
- Fix: use `useRef` to hold the latest value, remove the state from deps.
- Pattern:
  ```typescript
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    // use dataRef.current, NOT data
  }, [otherDep]); // data intentionally excluded
  ```

---

## 🎨 UI / Style Rules

- **Design System:** Brutalist/bold — thick black borders (`border-2 border-zinc-900`), box shadows (`shadow-[6px_6px_0px_0px_rgba(24,24,27,1)]`), uppercase headings.
- **Dark Mode:** Full support. Every color must have a `dark:` variant.
- **No Emojis in code** unless already present in the file.
- **Tailwind only** — no inline styles, no CSS modules.

---

## 📊 Quiz Types (5 Total)

All handled by `UnifiedQuizPlayer.tsx`:

| Type | Description |
|---|---|
| `Bilingual MCQ` | MCQ with both Bengali and English text |
| `Cloze Test` | Fill-in-the-blank passage |
| `Error Correction` | Find the grammatical error in a sentence |
| `Parajumble` | Arrange jumbled sentences in correct order |
| `Comprehension` | Reading passage with MCQ questions |

Also supports:
- `Online Link` — embed external exam URL
- `PDF Upload` — display uploaded PDF exam

---

## 🐛 Known Fixed Bugs (Do NOT Reintroduce)

| Bug | File | Fix Applied |
|---|---|---|
| Blank screen on library open | `StudentLibrary.tsx` | Moved `if (previewItem)` return to AFTER all hooks |
| `libraryCache` infinite read loop | `StudentLibrary.tsx` | Removed `libraryCache` from useEffect deps; use `libraryCacheRef` |
| `onSnapshot` draining 50k quota | `App.tsx` TopNav | Replaced with `getDocs` + 5-min polling |
| 3 redundant reads per login | `AuthProvider.tsx` | Merged to 2 parallel reads using `Promise.all` |
| Attendance double cache key | `exam-session-utils.ts` | Unified fallback cache key to match normal path |
| PDF filter too strict (hid PDFs) | `StudentLibrary.tsx` | Changed `type === 'note'` to `type !== 'exam'` |
| Crash on null quiz data | `UnifiedQuizPlayer.tsx` | Added optional chaining `q?.`, `Array.isArray()`, `String()` guards |
| Payment fallback reads all records | `App.tsx` | Added `limit(10)` to fallback query |
| No error boundary | `main.tsx` | Added `ErrorBoundary` wrapping `<App />` |
| Stale notification cache after write | `NotificationsPanel.tsx` | `clearCache` now also clears `notif_count_` key |
| `batchAssignments` no limit — unbounded read | `App.tsx` + `StudentLibrary.tsx` | Added `limit(500)` to all `batchAssignments` queries |
| `users` collection no limit in admin pages | `Pages.tsx` | Added `limit(100)` to all `users` collection queries |
| Unused `onSnapshot` import | `Pages.tsx` | Removed unused import to keep code clean |
| **ROOT CAUSE** — 500 reads per student from `batchAssignments` | `StudentLibrary.tsx`, `App.tsx` | **DATA MODEL**: Students read `batches/{batchId}.assignedItemsMap` (1 read) not `batchAssignments` (500 reads). Admin keeps both in sync via `handleSaveShare`+`handleDelete`. Auto-migration in `AdminLibrary.tsx` on first open. |
| `UnifiedQuizPlayer` uncached + unlimited results check | `UnifiedQuizPlayer.tsx` | `cachedGetDocs` + `limit(1)` added; `clearCache` called after submit |
| Missing `cachedGetDoc` for single-document reads | `cache.ts` | Added `cachedGetDoc(docRef, cacheKey)` with 15-min TTL |

---

## 🚀 Deployment

```bash
# Local dev
npm run dev         # Vite dev server on port 3000

# Build
npm run build       # Output to /dist

# Lint (TypeScript check)
npm run lint        # Runs tsc --noEmit

# Deploy to Firebase
firebase deploy --only hosting
```

Git remote: `mondalsaikat185-hub/M-C-Tuition-App` on branch `main`

---

## 🗣️ Communication Rule — MANDATORY

> **After completing ANY task in this codebase, the AI MUST communicate its findings,**
> **changes, and questions with the user in Bengali (বাংলা).**
>
> The user is Saikat Mondal, a Bengali-speaking developer from India.
> All explanations, bug reports, code summaries, and confirmations must be written in Bengali.
> Technical terms (like "Firestore", "useEffect", "cache") can stay in English within Bengali sentences.
> Example: "আমি `App.tsx`-এ `onSnapshot` বন্ধ করে `getDocs` দিয়ে 5 মিনিটের polling লাগিয়েছি।"

---

## 📋 Development Workflow for AI Assistants

When asked to work on this project, follow this order:

1. **Read this file first** (`CLAUDE.md`) — understand all constraints.
2. **Read `AGENTS.md`** — additional agent-specific rules.
3. **Read the relevant source file(s)** before making any changes.
4. **Check quota impact** of every change — will this add, remove, or keep the same number of Firestore reads?
5. **Make changes** — edit files, never create unnecessary new files.
6. **Verify** — check that hooks are in correct order, no new `onSnapshot` listeners, all queries have `limit()`.
7. **Report in Bengali** — explain what was done, what was found, and what (if anything) needs the user's input.

---

*Last updated by Claude (Anthropic) — May 2026*  
*Maintained for Saikat Mondal's M-C Tuition Application*
