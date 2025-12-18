# LinkBee - AI LinkedIn Follow-up Agent

LinkBee is a powerful Chrome Extension that acts as your personal technical career coach and executive assistant for LinkedIn. It scans your messaging inbox, analyzes conversations using Google Gemini AI, and identifies high-value opportunities to follow up—ensuring you never drop the ball on a recruiter, peer, or lead.

## 🚀 Key Features

### 🧠 Intelligent Analysis (Gemini AI)
LinkBee provides deep insights into your conversations:
*   **7 Strategic Scenarios**: Automatically classifies interactions (e.g., *Recruiter Recovery*, *Strategic Pivot*, *Senior Ask*).
*   **Confidence Scoring**: Explains *why* a follow-up is relevant.
*   **Draft Suggestions**: Generates context-aware messages ready to send.
*   **Manual Control**: You decide when to analyze. Use the **"✨ Analyze Saved"** button to process your synced messages on demand, or trigger a full analysis automatically when you **App Sync**.

### ⚡ Smart Navigation
*   **Direct Thread Access**: Smartly constructs URLs to open specific message threads directly.
*   **Fallback Strategies**: Falls back to profile pages or search if direct links are unavailable, ensuring you always land on relevant content.
*   **Overlay Support**: Correctly extracts data even from chat overlays.

### 📅 Reminders & Tracking
*   **Action Items**: A dedicated view for conversations requiring attention.
*   **Reminders**: Set custom notes and dates for any conversation.
*   **Status Tracking**: Dismiss items designed to keep your focus clear.

---

## 🛠️ Installation & Setup

### 1. Prerequisites
*   Node.js & npm
*   A Google Gemini API Key ([Get your key here](https://ai.google.dev/gemini-api/docs/api-key))

### 2. Build the Extension
This project uses **React**, **TypeScript**, and **Vite**.

```bash
# Clone the repository
git clone <repo-url>
cd LinkedinFollowups

# Install dependencies
npm install

# Build for production
npm run build
```
This will create a `dist` folder containing the compiled extension.

### 3. Load into Chrome
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (top right toggle).
3.  Click **Load unpacked**.
4.  Select the `dist` folder from your project directory.

---

## ⚙️ Configuration

1.  Click the **LinkBee** icon in your toolbar.
2.  **Sync (🔄)**: Click this to scan your LinkedIn inbox. This **automatically triggers** an AI analysis of new messages.
3.  **Analyze Saved (✨)**: In the "Action Items" tab, click this to manually re-analyze your stored conversations.
4.  **Settings (⚙️)**:
    *   Enter your **Gemini API Key**.
    *   Customize analysis thresholds.

---

## 💻 Tech Stack
*   **Frontend**: React, TypeScript, TailwindCSS, Shadcn UI.
*   **Backend**: Chrome Extension Service Worker (`background.js`).
*   **AI**: Google Gemini (via SDK).
*   **Build Tool**: Vite + CRXJS.

## 🤝 Contributing
1.  The UI is built with React components in `src/ui`.
2.  Always run `npm run build` to update the `dist/` folder before testing.
