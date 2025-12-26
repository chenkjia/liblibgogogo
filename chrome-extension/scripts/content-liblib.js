// Content Script for Liblib

console.log('[LiblibExt] Liblib Content Script Loaded');

chrome.runtime.sendMessage({ action: 'register_tab', site: 'liblib' });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'execute_liblib') {
    handleExecution(request.prompt, sendResponse);
    return true; // Async
  }
});

async function handleExecution(prompt, sendResponse) {
  try {
    // 1. Find Prompt Input
    const inputSelectors = ['textarea[placeholder*="提示词"]', 'textarea[placeholder*="Prompt"]', '#prompt-input'];
    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = document.querySelector(sel);
      if (inputEl) break;
    }
    
    if (!inputEl) {
      sendResponse({ success: false, error: 'Cannot find Liblib prompt input' });
      return;
    }

    // 2. Fill Prompt
    inputEl.focus();
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeTextAreaValueSetter.call(inputEl, prompt);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    
    await new Promise(r => setTimeout(r, 500));

    // 3. Click Generate
    const buttons = Array.from(document.querySelectorAll('button'));
    const generateBtn = buttons.find(b => b.innerText.includes('生成') || b.innerText.includes('Generate'));
    
    if (!generateBtn) {
        sendResponse({ success: false, error: 'Cannot find Generate button' });
        return;
    }
    
    generateBtn.click();

    // 4. Wait for Image
    const imageUrl = await waitForImage();
    sendResponse({ success: true, imageUrl: imageUrl });

  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function waitForImage() {
    // Poll for new image
    // Max 120s
    for (let i = 0; i < 60; i++) {
       await new Promise(r => setTimeout(r, 2000));
       
       // Heuristic: Find the first large image on the page (usually the result in the gallery or main view)
       // Liblib structure changes, but result images are usually `img` tags with `src` pointing to cloud storage.
       
       const imgs = Array.from(document.querySelectorAll('img[src*="http"]'));
       // Filter small icons
       const contentImgs = imgs.filter(img => img.width > 200 && img.height > 200);
       
       if (contentImgs.length > 0) {
           // Return the first one (assuming it's the latest or main one)
           // In a perfect world, we'd check timestamps or DOM insertion.
           return contentImgs[0].src;
       }
    }
    throw new Error('Timeout waiting for image generation');
}
