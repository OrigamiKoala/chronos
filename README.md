# 🧠 Chronos Bot: Olympiad Prep & Stress Sandbox

**Chronos Bot** is a next-generation, premium AI-powered test-preparation sandbox designed for high-stakes science and mathematics competitive olympiads (Math, Physics, Chemistry). By simulating realistic stress factors (hidden timers, strict limits, dynamic visual acceleration) alongside real-time ELO difficulty scaling and deep automated diagnostic feedback loops, Chronos Bot trains mental endurance alongside academic mastery.

---

## 🚀 Key Features

* **Real-time SSE Question Streaming**: Streams challenging olympiad problems immediately using `@google/genai` SSE streams, generating and rendering questions on the fly while subsequent problems continue parsing in the background.
* **Simulated Stress Modes**:
  * **None**: A relaxed, standard timer.
  * **Hidden Clock**: Hides the timer entirely, only flashing an alarm in the final 10 seconds.
  * **Strict**: Enforces absolute time-outs, automatically skipping and marking questions incorrect at 0s.
  * **Dynamic Acceleration**: Speeds up timer animations and pulses when time runs low, simulating panic triggers.
* **Pause-and-Resume Multi-Directional Timers**: Tracks individual time left for each question in non-strict modes. Switch freely between questions; the timer pauses and resumes exactly where you left off.
* **Clickable Strengths & Weaknesses (AI Breakdown)**: Click any topic tag on your dashboard to instantly review a pre-compiled, highly specific breakdown of what you are `"good at"` and `"not good at"`, stored dynamically in BigQuery.
* **Inline AI Tutor Breakdown**: Open a custom dialog on any completed question in the test review breakdown. Ask the AI tutor exactly why the correct answer is correct and ask follow-up questions in real-time.
* **Full Session Caching**: Automatic caching of active usernames and previous test configurations in local storage for seamless onboarding.

---

## 🛠️ Technology Stack

* **Frontend**: React 19, Vite, Lucide Icons, MathJax
* **Backend**: Vercel Serverless Functions, Node.js, `@google/genai` SDK
* **Database & AI Engine**: Google Cloud Platform (GCP) BigQuery, BigQuery AI Remote Models (`ML.GENERATE_TEXT` utilizing Vertex Connection for background workers)

---

## 📊 Database Schema Guide

Execute these schemas inside your BigQuery GCP dataset named `chronos_users`:

### A. Users Table (`users`)
```sql
CREATE OR REPLACE TABLE `chronos-stress-sandbox.chronos_users.users` (
  user_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  math_rating INT64 DEFAULT 100 NOT NULL,
  physics_rating INT64 DEFAULT 100 NOT NULL,
  chemistry_rating INT64 DEFAULT 100 NOT NULL
);
```

### B. Topic Mastery (`user_topic_mastery`)
```sql
CREATE OR REPLACE TABLE `chronos-stress-sandbox.chronos_users.user_topic_mastery` (
  user_id STRING NOT NULL,
  sub_category STRING NOT NULL,
  subject STRING NOT NULL,
  correct_count INT64 DEFAULT 0 NOT NULL,
  total_count INT64 DEFAULT 0 NOT NULL,
  accuracy_rate FLOAT64 DEFAULT 0.0 NOT NULL
);
```

### C. Wrong Problems Table (`user_wrong_problems`)
```sql
CREATE OR REPLACE TABLE `chronos-stress-sandbox.chronos_users.user_wrong_problems` (
  user_id STRING NOT NULL,
  exam_id STRING NOT NULL,
  question_id STRING NOT NULL,
  subject STRING NOT NULL,
  topic STRING NOT NULL,
  question_text STRING NOT NULL,
  user_answer STRING,
  correct_answer STRING NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

### D. Detailed Analysis Table (`user_weakness_analysis`)
```sql
CREATE OR REPLACE TABLE `chronos-stress-sandbox.chronos_users.user_weakness_analysis` (
  user_id STRING NOT NULL,
  subject STRING NOT NULL,
  detailed_analysis STRING NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

### E. Topic Breakdowns Table (`user_topic_breakdown`)
```sql
CREATE OR REPLACE TABLE `chronos-stress-sandbox.chronos_users.user_topic_breakdown` (
  user_id STRING NOT NULL,
  subject STRING NOT NULL,
  topic STRING NOT NULL,
  good_at STRING NOT NULL,
  not_good_at STRING NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

### F. Exam History Table (`user_exam_history`)
```sql
CREATE OR REPLACE TABLE `chronos-stress-sandbox.chronos_users.user_exam_history` (
  user_id STRING NOT NULL,
  exam_id STRING NOT NULL,
  subject STRING NOT NULL,
  accuracy FLOAT64 NOT NULL,
  avg_time FLOAT64 NOT NULL,
  rating_change INT64 NOT NULL,
  new_rating INT64 NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

---

## ⚙️ Environment Configuration

Create a `.env` or Vercel environment group with the following keys:

```bash
# Gemini API Key (Backend & Streaming)
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-3.5-flash"

# Google Cloud BigQuery Credentials
BIGQUERY_PROJECT_ID="chronos-stress-sandbox"
BIGQUERY_CLIENT_EMAIL="chronos-service-account@gcp..."
BIGQUERY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADAN..."
```

---

## 🏃 Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start Dev Server**:
   ```bash
   npm run dev
   ```
3. **Compile Production Bundle**:
   ```bash
   npm run build
   ```
4. **Code Quality Linting**:
   ```bash
   npm run lint
   ```
