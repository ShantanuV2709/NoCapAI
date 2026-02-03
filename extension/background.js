// Background Service Worker

// Create Context Menu on Install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "verify-nocap",
        title: "Verify with NoCap AI",
        contexts: ["selection"]
    });
});

// Helper to safely send message, injecting script if needed
async function sendMessageToContentScript(tabId, message) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
        console.log("Content script not ready. Injecting now...", err);
        try {
            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            // Retry sending message
            try {
                await chrome.tabs.sendMessage(tabId, message);
            } catch (retryErr) {
                console.warn("Could not send message even after injection:", retryErr);
                throw retryErr;
            }
        } catch (injectErr) {
            console.error("Failed to inject content script (might be a restricted page):", injectErr);
            throw injectErr;
        }
    }
}

// Handle Context Menu Click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "verify-nocap" && info.selectionText) {

        try {
            // Notify Content Script to show loading state
            await sendMessageToContentScript(tab.id, {
                action: "SHOW_LOADING",
                text: info.selectionText
            });

            // Call API
            const data = await verifyText(info.selectionText);
            await sendMessageToContentScript(tab.id, {
                action: "SHOW_RESULT",
                data: data
            });
        } catch (err) {
            console.error("Verification error:", err);
            try {
                await sendMessageToContentScript(tab.id, {
                    action: "SHOW_ERROR",
                    error: err.toString()
                });
            } catch (msgErr) {
                console.error("Could not send error message:", msgErr);
            }
        }
    }
});

// Function to call NoCap AI Backend
async function verifyText(text) {
    try {
        const response = await fetch('http://localhost:8000/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: text,
                session_id: "extension-" + Date.now()
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Verification failed", error);
        throw error;
    }
}
