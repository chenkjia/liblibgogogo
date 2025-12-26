// Content Script for Doubao

console.log('[LiblibExt] Doubao Content Script Loaded');

// Notify background that we are here
chrome.runtime.sendMessage({ action: 'register_tab', site: 'doubao' });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'execute_doubao') {
    handleExecution(request.text, sendResponse);
    return true; // Async
  }
});

async function handleExecution(text, sendResponse) {
  try {
    // 1. Find Input
    const selectors = [
      'textarea[data-testid="chat_input_input"]',
      'textarea[placeholder*="输入"]',
      '.semi-input-textarea'
    ];
    let inputEl = null;
    for (const sel of selectors) {
      inputEl = document.querySelector(sel);
      if (inputEl) break;
    }

    if (!inputEl) {
      sendResponse({ success: false, error: 'Cannot find Doubao input box' });
      return;
    }

    // 2. Fill Input
    inputEl.focus();
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeTextAreaValueSetter.call(inputEl, text);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true })); // Important for React
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 500));

    // 3. Click Send
    // Try to find send button
    const sendBtnSelectors = [
      'button[data-testid="send-button"]', 
      'button[aria-label="发送"]',
      '.semi-button-primary'
    ];
    let sendBtn = null;
    for (const sel of sendBtnSelectors) {
       // Check for SVG or text inside button
       const btns = Array.from(document.querySelectorAll(sel));
       sendBtn = btns.find(b => !b.disabled && b.offsetParent !== null); // Visible and enabled
       if (sendBtn) break;
    }

    if (!sendBtn) {
         // Try enter key
         inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13 }));
    } else {
        sendBtn.click();
    }

    // 4. Wait for Response
    // Polling for the new message
    const result = await waitForResponse();
    sendResponse({ success: true, result: result });

  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function waitForResponse() {
    // Wait initial time
    await new Promise(r => setTimeout(r, 3000));
    
    let lastText = '';
    let stableCount = 0;
    
    // Max 30s
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        
        // Find last message
        const msgs = Array.from(document.querySelectorAll('.semi-typography')); // Common text class in Doubao
        // Better selector: The container of chat bubbles
        // Strategy: grab all text in the main view, find the last block.
        
        // Let's use a simpler heuristic for V1:
        // Assume the user isn't typing, so the last text block that isn't the input is the answer.
        // We can look for `div[data-testid="msg-content"]`
        
        const contentDivs = Array.from(document.querySelectorAll('div[class*="content"]')); 
        if (contentDivs.length > 0) {
            const lastMsg = contentDivs[contentDivs.length - 1];
            const currentText = lastMsg.innerText;
            
            if (currentText && currentText.length > 5 && currentText === lastText) {
                stableCount++;
                if (stableCount >= 1) return currentText;
            }
            lastText = currentText;
        }
    }
    return lastText || "Timeout getting response";
}
