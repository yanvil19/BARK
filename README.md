# NU-BOARD testing

Board Exam Reviewer for NU Laguna - a web-based platform for quizzes, mock board exams, and progress tracking.

## Project Overview

NU-BOARD is an institution-managed reviewer system where exam content is created by NU Laguna faculty and goes through a structured approval workflow before students can access it.

**User roles**

- Super Admin
- Dean
- Program Chair
- Professor
- Student

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

(why: downloads required packages for the API)

### 3) Create your backend `.env`

```bash
cd server
cp .env.example .env
```

(why: stores secrets/config locally; don't commit `server/.env`)

Edit `server/.env`:

- `MONGO_URI=...` (why: tells the server which MongoDB to use)
- Optional: `MONGO_DNS_SERVERS=1.1.1.1,8.8.8.8` (why: fixes some `mongodb+srv` DNS issues)

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
irm http://localhost:5000/health
```

### 6) Install frontend dependencies

```bash
cd client
npm install
```

(why: downloads required packages for the React app)

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

- Never commit secrets: `server/.env` is ignored by git.
- If a password/URI was ever shared publicly, rotate/reset the MongoDB Atlas DB user password immediately.

## Proposed AI Integration: PDF -> JSON

Goal: convert uploaded PDF reviewer files into structured JSON that can be reviewed and imported into the question bank.

Suggested flow:

1) Extract text from the PDF (OCR first if it's a scanned PDF)
2) Use an AI model to map extracted text into a strict JSON schema
3) Require human review before importing/publishing

## Contributing (Simple Rules)

1) Create a branch per task: `feat/<name>` or `fix/<name>` (why: keeps changes organized)
2) Open a Pull Request and ask for review (why: fewer bugs + shared learning)
3) Merge only after review (why: protects the main branch)
