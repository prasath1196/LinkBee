# LinkBee Verification Walkthrough

## 1. Installation
1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer Mode** (toggle in top right).
3.  Click **Load unpacked**.
4.  Select the project directory: `/Users/prasath/PortfolioProjects/LinkedinFollowups`.
5.  *Note:* If you see an error, click "Retry" now that icons are fixed.

## 2. Configuration
1.  Click the **LinkBee** extension icon (the Bee).
2.  Click the **Settings** gear icon in the top right.
3.  Select your AI Provider (OpenAI or Gemini).
4.  Enter your API Key.
5.  Click **Save Settings**.

## 3. Testing "Smart Monitoring"
1.  Go to [LinkedIn Messaging](https://www.linkedin.com/messaging/).
2.  Open a chat where you were the last person to send a message (or send a new test message).
3.  Wait a moment (the observer runs every few seconds).
4.  Open the LinkBee extension popup.
    *   *Result*: You should see that person listed in "Today's Follow-ups" (since we set the threshold to check immediately for testing/demo purposes, or you can verify the logic is tracking it).
    *   *Note*: The current logic checks for >4 days. To test immediately, you might need to find an old conversation!

## 4. Testing AI Drafts
1.  In the popup, find a card.
2.  Click **✨ Draft Reply**.
3.  Verify that a text box appears with a polite follow-up message.
4.  Click **Copy to Clipboard**.

## 5. Debugging & Error Monitoring
If you encounter issues (e.g., `net::ERR_FAILED` or buttons not working), follow these steps to see what's happening under the hood.

### A. Global Extension Errors
1.  Go to `chrome://extensions`.
2.  Find **LinkBee**.
3.  If there is an **Errors** button, click it to see log of failed network requests or manifest issues.
4.  **Important**: Always click the refresh icon (circular arrow) on the card after code changes.

### B. Debugging the Background Script (Logic)
The "Brain" of the extension where data is stored and logic runs.
1.  Go to `chrome://extensions`.
2.  Find **LinkBee**.
3.  Click the blue link: **service worker**.
4.  A DevTools window will open.
5.  Go to the **Console** tab.
    *   *Look for:* "LinkBee: Observer started", "LinkBee: Saving new conversation", etc.

### C. Debugging the Popup (UI)
If specific buttons (Dismiss, Draft) aren't working.
1.  Click the **LinkBee** extension icon to open the popup.
2.  **Right-click** anywhere on the popup white space.
3.  Select **Inspect**.
4.  A separate DevTools window will open for the popup.
5.  Check the **Console** for errors like `Refused to execute inline script` or `cannot read properties of null`.

### D. Debugging the Content Script (Scraper)
If it's not detecting messages.
1.  Open [LinkedIn Messaging](https://www.linkedin.com/messaging/).
2.  Standard right-click -> **Inspect** (or F12).
3.  Go to the **Console**.
4.  Filter logs for "LinkBee". You should see "LinkBee: Observer started" and "LinkBee: Sending update" when you click chats.
