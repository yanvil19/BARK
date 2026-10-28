# BARK

Board Exam Reviewer for NU Laguna - a web-based platform for quizzes, mock board exams, and progress tracking.

## Project Overview

BARK is an institution-managed reviewer system where exam content is created by NU Laguna faculty and goes through a structured approval workflow before students can access it.

**User roles**

- Super Admin
- Dean
- Program Chair
- Professor
- Student
- Alumni

## Setup (Beginner-Friendly)

### Prerequisites

- Install **Node.js (LTS recommended)** and **Git** (why: everyone uses the same tools)

### 1) Clone the repo

```bash
git clone <your-repo-url>
cd NU-BOARD
```

(why: gets the code onto your laptop)

### 2) Install backend dependencies

```bash
cd server
npm install
```

*(Note: This includes recently added packages like `node-cron` for scheduled background jobs, so make sure to run this if you're pulling new code!)*

(why: downloads required packages for the API)

### 3) Create your backend `.env`

```bash
cd server
cp .env.example .env
```

(why: stores secrets/config locally; don't commit `server/.env`)

Edit `server/.env` and replace every `<placeholder>` value. Each setting is explained in `server/.env.example`. The main ones:

- `MONGO_URI=...` (why: tells the server which MongoDB to use)
- `JWT_SECRET`, `TEXT_ENCRYPTION_KEY`, `IMAGE_ENCRYPTION_KEY` (why: sign logins and encrypt stored questions/images)
- `GEMINI_API_KEY`, `R2_*`, `BREVO_API_KEY` (why: AI question import, image storage, and email)
- Optional: `MONGO_DNS_SERVERS=1.1.1.1,8.8.8.8` (why: fixes some `mongodb+srv` DNS issues)

### 3b) Create the first Super Admin account

Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `server/.env`, then run:

```bash
cd server
npm run seed:superadmin
```

(why: the Super Admin creates every other account from inside the app)

### 4) Run the backend (API)

```bash
cd server
npm run dev
```

(why: starts Express + connects to MongoDB)

If `nodemon` has issues:

```bash
cd server
npm start
```

### 5) Verify backend

- API root: `GET /` -> `API is running...` (why: confirms Express is running)
- Health: `GET /health` (why: confirms DB connection + ping)

PowerShell example:

```powershell
irm http://localhost:10000/health
```

(The port comes from `PORT` in `server/.env`; the frontend dev server expects `10000`.)

### 6) Install frontend dependencies

```bash
cd client
npm install
cp .env.example .env
```

(why: downloads required packages for the React app; `VITE_API_URL` in `client/.env` points the app to the backend)

### 7) Run the frontend (client)

```bash
cd client
npm run dev
```

(why: starts the Vite dev server so you can view the UI)

## Troubleshooting (Most Common)

### `querySrv ECONNREFUSED _mongodb._tcp...` (Atlas SRV/DNS)

Cause: Node can't resolve SRV records used by `mongodb+srv://...`.

Check Node DNS:

```bash
node -e "console.log(require('node:dns').getServers())"
```

Fix: set this in `server/.env` and restart:

```env
MONGO_DNS_SERVERS=1.1.1.1,8.8.8.8
```

## Security Notes

- Never commit secrets: `server/.env` and `client/.env` are ignored by git. Only the `.env.example` templates (placeholders, no real values) are included.
- If a password/URI was ever shared publicly, rotate/reset the MongoDB Atlas DB user password immediately.

## AI Question Import (PDF / DOCX)

Faculty can upload existing reviewer files and turn them into questions instead of typing each one.

How it works:

1) Text is extracted from the uploaded PDF (`pdf-parse`) or DOCX (`mammoth`)
2) Google Gemini maps the text into a strict JSON question format (question, choices, correct answer, rationalization, subject)
3) The faculty member reviews every question (each is marked Ready, Needs Review, or Invalid) before submitting
4) Submitted questions are saved as **drafts** and still go through the normal approval workflow before students can see them

Imports are rate-limited per user and per day (see the `IMPORT_*` and `GEMINI_*` settings).

## Contributing (Simple Rules)

1) Create a branch per task: `feat/<name>` or `fix/<name>` (why: keeps changes organized)
2) Open a Pull Request and ask for review (why: fewer bugs + shared learning)
3) Merge only after review (why: protects the main branch)
