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
* **Inline AI Tutor Breakdown**: Ask AI about any completed question in the test review breakdown. Ask the AI tutor exactly why the correct answer is correct and ask follow-up questions in real-time.
* **Full Session Caching**: Automatic caching of active usernames and previous test configurations in local storage for seamless onboarding.
