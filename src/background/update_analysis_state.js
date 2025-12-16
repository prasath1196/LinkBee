
let activeAnalysisCount = 0;

export function updateAnalysisState(change) {
    activeAnalysisCount += change;
    if (activeAnalysisCount < 0) activeAnalysisCount = 0;

    const isAnalyzing = activeAnalysisCount > 0;
    chrome.storage.local.set({ isAnalyzing });
}
