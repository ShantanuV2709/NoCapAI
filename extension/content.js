/* content.js */

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SHOW_LOADING") {
        showModal(request.text, "LOADING");
    } else if (request.action === "SHOW_RESULT") {
        updateModal(request.data);
    } else if (request.action === "SHOW_ERROR") {
        showError(request.error);
    }
});

let shadowRoot = null;
let modalContainer = null;

function createModal() {
    if (document.getElementById('nocap-extension-root')) return;

    modalContainer = document.createElement('div');
    modalContainer.id = 'nocap-extension-root';
    modalContainer.style.position = 'fixed';
    modalContainer.style.top = '20px';
    modalContainer.style.right = '20px';
    modalContainer.style.zIndex = '999999';
    document.body.appendChild(modalContainer);

    shadowRoot = modalContainer.attachShadow({ mode: 'open' });

    // Inject Styles
    const style = document.createElement('style');
    style.textContent = `
        .card {
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
            backdrop-filter: blur(20px);
            border: 1px solid rgba(148, 163, 184, 0.2);
            color: white;
            padding: 24px;
            border-radius: 20px;
            width: 380px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideIn {
            from { transform: translateX(120%) scale(0.95); opacity: 0; }
            to { transform: translateX(0) scale(1); opacity: 1; }
        }
        .header { 
            display: flex; 
            align-items: center; 
            justify-content: space-between;
            margin-bottom: 20px; 
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        .logo-section {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .logo-img {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .title { 
            font-weight: 700; 
            font-size: 20px; 
            background: linear-gradient(135deg, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .close { 
            cursor: pointer; 
            color: #64748b; 
            font-size: 24px;
            line-height: 1;
            transition: all 0.2s;
            padding: 4px;
            border-radius: 8px;
        }
        .close:hover {
            color: #f1f5f9;
            background: rgba(255,255,255,0.1);
        }
        .content { 
            font-size: 15px; 
            line-height: 1.6; 
            color: #cbd5e1; 
            margin-bottom: 20px;
            max-height: 200px;
            overflow-y: auto;
        }
        .content::-webkit-scrollbar {
            width: 6px;
        }
        .content::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.3);
            border-radius: 3px;
        }
        .verdict { 
            text-align: center; 
            padding: 14px 20px; 
            border-radius: 12px; 
            font-weight: 700; 
            font-size: 18px; 
            margin-top: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .verdict.FAKE { 
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.25)); 
            color: #fca5a5; 
            border: 2px solid rgba(239, 68, 68, 0.4);
        }
        .verdict.CREDIBLE { 
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(21, 128, 61, 0.25)); 
            color: #86efac; 
            border: 2px solid rgba(34, 197, 94, 0.4);
        }
        .verdict.MISLEADING { 
            background: linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(161, 98, 7, 0.25)); 
            color: #fde047; 
            border: 2px solid rgba(234, 179, 8, 0.4);
        }
        .loading-spinner {
            border: 3px solid rgba(255,255,255,0.1);
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            animation: spin 0.8s linear infinite;
            margin: 30px auto;
        }
        @keyframes spin { 
            0% { transform: rotate(0deg); } 
            100% { transform: rotate(360deg); } 
        }
        .confidence {
            text-align: center;
            margin-top: 12px;
            font-size: 13px;
            color: #64748b;
            font-weight: 500;
        }
    `;
    shadowRoot.appendChild(style);
}

function showModal(text, state) {
    if (!shadowRoot) createModal();

    // Reset content
    const existingCard = shadowRoot.querySelector('.card');
    if (existingCard) existingCard.remove();

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
        <div class="header">
            <div class="logo-section">
                <img src="${chrome.runtime.getURL('icon48.png')}" alt="NoCap" class="logo-img" />
                <div class="title">NoCap AI</div>
            </div>
            <div class="close">✕</div>
        </div>
        <div class="content">
            Analyzing selection...
        </div>
        <div class="loading-spinner"></div>
    `;

    card.querySelector('.close').onclick = () => modalContainer.remove();
    shadowRoot.appendChild(card);
}

function updateModal(data) {
    const card = shadowRoot.querySelector('.card');
    if (!card) return;

    const verdictClass = data.answer.includes("FAKE") ? "FAKE" :
        data.answer.includes("CREDIBLE") ? "CREDIBLE" :
            data.answer.includes("MISLEADING") ? "MISLEADING" : "MISLEADING";

    // Simple extraction of Verdict word logic since API returns full text
    // Assuming backend returns struct { verdict: "FAKE" ... } if updated, 
    // or standard /ask returns { answer: "VERDICT: FAKE..." }
    // My previous backend code returns { answer: "...", verdict: "..." } ?
    // Let's check main.py response model. 
    // It returns CheckResponse containing 'result' which has 'verdict'.
    // Wait, main.py /ask returns CheckResponse(answer=..., confidence=..., sources=...).
    // It does NOT return 'verdict' field clean. It embeds it in 'answer'.
    // BUT in ChatBox.jsx I had 'extractVerdict' helper.
    // I should implement similar extraction here.

    const verdict = extractVerdict(data.answer);

    card.innerHTML = `
        <div class="header">
            <div class="logo-section">
                <img src="${chrome.runtime.getURL('icon48.png')}" alt="NoCap" class="logo-img" />
                <div class="title">NoCap AI</div>
            </div>
            <div class="close">✕</div>
        </div>
        <div class="content">
            ${data.answer.split('\n\n')[1] || data.answer.substring(0, 150) + "..."} 
        </div>
        <div class="verdict ${verdict}">${verdict}</div>
        <div class="confidence">
            Confidence: ${data.confidence}%
        </div>
    `;
    card.querySelector('.close').onclick = () => {
        modalContainer.remove();
        shadowRoot = null; // Reset
    };
}

function extractVerdict(text) {
    if (text.includes("FAKE")) return "FAKE";
    if (text.includes("CREDIBLE") || text.includes("TRUE")) return "CREDIBLE";
    if (text.includes("MISLEADING")) return "MISLEADING";
    return "UNCERTAIN";
}

function showError(msg) {
    const card = shadowRoot.querySelector('.card');
    if (card) {
        card.innerHTML = `
            <div class="header"><div class="logo">Error</div><div class="close">✕</div></div>
            <div style="color: #fca5a5;">${msg}</div>
        `;
        card.querySelector('.close').onclick = () => modalContainer.remove();
    }
}
