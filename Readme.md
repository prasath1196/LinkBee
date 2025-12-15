# LinkBee - AI LinkedIn Follow-up Agent

LinkBee is a powerful Chrome Extension that acts as your personal technical career coach and executive assistant for LinkedIn. It scans your messaging inbox, analyzes conversations using Google Gemini AI, and identifies high-value opportunities to follow up—ensuring you never drop the ball on a recruiter, peer, or lead.

## 🚀 Key Features

### 🧠 Intelligent Analysis (Gemini AI)
LinkBee doesn't just look at timestamps. It reads the conversation context to assist with:
*   **7 Strategic Scenarios**: Automatically classifies interactions into specific playbooks:
    *   *Recruiter Recovery* (Reviving dead threads)
    *   *Strategic Pivot* (Turning social chats into business asks)
    *   *Senior Ask* (Following through on referrals)
    *   *Timed Deferral* (Respecting "talk to me in Q3")
*   **Confidence Scoring**: Tells you *why* you should follow up (e.g., "High Priority: Warm connection dormant for >90 days").
*   **Draft Suggestions**: Generates context-aware follow-up messages you can copy with one click.

### ⚡ Smart Navigation "Go to Chat"
Stop searching manually. LinkBee’s "Go to Chat" button:
*   **Auto-Scrolls**: Finds the conversation in your sidebar even if it's months old.
*   **Name Matching**: Uses fuzzy matching to locate the correct person.
*   **Robust Interaction**: Handles LinkedIn's SPA behavior to open the chat instantly without reloading.

### 📅 Reminders & Tracking
*   **Reminders**: Set custom date/time reminders for specific conversations.
*   **Status Tracking**: Mark items as "Done" to clear your queue.
*   **Badges**: See a count of action items right on the extension icon.

---

## 🛠️ Installation & Setup

### 1. Prerequisites
*   Node.js & npm
*   A Google Gemini API Key ([Get your key here](https://ai.google.dev/gemini-api/docs/api-key))

### 2. Build the Extension
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
2.  **Sync Icon (🔄)**: Click this on the popup to force a manual scan of your LinkedIn inbox immediately.
3.  Click the **Settings (Gear)** icon.
4.  Enter your **Gemini API Key**.
5.  (Optional) Adjust the "Re-analyze after" interval.

---

## 💻 Tech Stack
*   **Frontend**: Vanilla JavaScript, HTML, TailwindCSS (via Vite).
*   **Backend**: Chrome Extension Service Worker (`background.js`).
*   **AI**: Google Gemini **2.5 Flash** (via SDK).
*   **Build Tool**: Vite.

## 🤝 Contributing
1.  Make your changes in `src/`.
2.  Always run `npm run build` to update the `dist/` folder before testing in Chrome.
