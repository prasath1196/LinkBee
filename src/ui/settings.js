// Settings Logic
document.addEventListener('DOMContentLoaded', initSettings);

async function initSettings() {
    // 1. Load Settings
    const data = await chrome.storage.local.get(['apiKey', 'aiProvider', 'analysisThreshold', 'syncDays']);

    if (data.apiKey) document.getElementById('api-key').value = data.apiKey;
    if (data.aiProvider) document.getElementById('provider-select').value = data.aiProvider;
    document.getElementById('analysisThreshold').value = data.analysisThreshold || 24;
    document.getElementById('syncDays').value = data.syncDays || 30;

    // 2. Attach Listeners
    document.getElementById('save-btn').addEventListener('click', saveSettings);
    document.getElementById('runDailyJob').addEventListener('click', forceDailyJob);
    document.getElementById('toggle-visibility').addEventListener('click', toggleVisibility);

    // Back Button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'popup.html';
        });
    }
}

async function saveSettings() {
    const provider = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('api-key').value.trim();
    const threshold = parseInt(document.getElementById('analysisThreshold').value) || 24;
    const syncDays = parseInt(document.getElementById('syncDays').value) || 30;

    if (!apiKey) {
        showStatus("Please enter an API Key.", "text-red-500");
        return;
    }

    await chrome.storage.local.set({
        aiProvider: provider,
        apiKey: apiKey,
        analysisThreshold: threshold,
        syncDays: syncDays
    });

    showStatus("Settings saved!", "text-green-600");

    // Update inputs to show sanitized values
    document.getElementById('analysisThreshold').value = threshold;
}

function forceDailyJob() {
    chrome.runtime.sendMessage({ type: 'FORCE_DAILY_CHECK' }, (response) => {
        if (chrome.runtime.lastError) {
            showStatus('Error: ' + chrome.runtime.lastError.message, 'text-red-500');
        } else {
            showStatus('Daily Job Triggered!', 'text-green-600');
        }
    });
}

function toggleVisibility() {
    const input = document.getElementById('api-key');
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function showStatus(msg, colorClass) {
    const status = document.getElementById('status-msg');
    status.innerText = msg;
    status.className = "text-center text-sm font-medium h-4 " + colorClass;
    setTimeout(() => {
        status.innerText = "";
    }, 3000);
}
