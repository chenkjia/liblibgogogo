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
    // User instruction: Directly use ID "flow-end-msg-send"
    const sendBtn = document.getElementById('flow-end-msg-send');

    if (sendBtn) {
        console.log('[Doubao] Clicking send button (ID match):', sendBtn);
        sendBtn.click();
    } else {
         console.log('[Doubao] Send button (flow-end-msg-send) not found!');
         // Try finding by ID inside shadow roots or if it's dynamic?
         // Maybe it's not an ID but a data-testid? 
         // User said "id flow-end-msg-send".
         // Let's try querySelector just in case
         const btn2 = document.querySelector('#flow-end-msg-send');
         if (btn2) {
             btn2.click();
         } else {
             throw new Error('Send button #flow-end-msg-send not found');
         }
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
    console.log('[Doubao] Waiting for response...');
    
    // 1. 强制等待，确保 UI 响应了发送操作
    await new Promise(r => setTimeout(r, 3000));
    
    const startTime = Date.now();
    const MAX_WAIT = 180000; // 3分钟超时
    let stableCount = 0;
    let lastText = '';
    let lastLength = 0;
    
    // 辅助函数：查找发送按钮
    const getSendBtn = () => {
        const sendBtnSelectors = [
          'button[data-testid="send-button"]', 
          'button[aria-label="发送"]',
          '.semi-button-primary' 
        ];
        for (const sel of sendBtnSelectors) {
           const btns = Array.from(document.querySelectorAll(sel));
           const btn = btns.find(b => !b.disabled && b.offsetParent !== null); // 只有可见且 enable 的才是“可发送”状态
           if (btn) return btn;
        }
        return null;
    };

    while (Date.now() - startTime < MAX_WAIT) {
        await new Promise(r => setTimeout(r, 1000));
        
        // --- 检查生成状态 ---
        
        // 1. 检查是否有“停止”按钮 (强信号)
        const stopBtn = document.querySelector('button[aria-label*="停止"], [data-testid*="stop"]');
        if (stopBtn) {
            console.log('[Doubao] Status: Generating (Stop button found)');
            stableCount = 0;
            continue;
        }

        // 2. 检查发送按钮是否不可用 (强信号)
        // 如果找不到可用的发送按钮，说明可能正在生成中（或者输入框为空，但我们刚填了字）
        // 这里逻辑要小心：输入框空时发送按钮也是禁用的。
        // 但我们主要靠文本变化来判断。这个作为一个重置 stableCount 的参考。
        // 实际上，豆包生成时，发送按钮通常会变成停止按钮。
        
        // --- 检查文本变化 ---

        // 优先使用用户提供的精确选择器：data-testid="message_content"
        const messageBlocks = Array.from(document.querySelectorAll('div[data-testid="message_content"]'));
        
        let lastEl = null;
        let currentText = '';

        if (messageBlocks.length > 0) {
             // 找到了明确的消息块，取最后一个
             const lastBlock = messageBlocks[messageBlocks.length - 1];
             // 尝试在消息块内找到文本容器，如果找不到就用整个块
             lastEl = lastBlock.querySelector('div[data-testid="message_text_content"]') || lastBlock;
             currentText = lastEl.innerText;
        } else {
             // Fallback: 如果页面结构变了，回退到之前的启发式搜索
             // 尝试定位最后一条消息气泡
             const contentDivs = Array.from(document.querySelectorAll('div'));
             const candidates = contentDivs.filter(div => {
                 if (!div.innerText) return false;
                 if (div.innerText.length < 5) return false;
                 if (div.getAttribute('contenteditable') === 'true') return false;
                 if (div.closest('div[class*="input"]')) return false; 
                 return true;
             });
             
             if (candidates.length > 0) {
                 lastEl = candidates[candidates.length - 1];
                 currentText = lastEl.innerText;
             }
        }

        if (!lastEl) {
             console.log('[Doubao] No content candidates found');
             continue;
        }

        const currentLength = currentText.length;

        if (currentLength !== lastLength) {
            console.log(`[Doubao] Text changing: ${lastLength} -> ${currentLength}`);
            lastLength = currentLength;
            lastText = currentText;
            stableCount = 0;
        } else {
            // 文本长度没变
            stableCount++;
            console.log(`[Doubao] Text stable: ${stableCount}/10`); // 增加到 10 秒
            
            // 必须连续稳定 10 秒
            if (stableCount >= 10) {
                console.log('[Doubao] Response complete (Stable).');
                return currentText;
            }
        }
    }
    
    return lastText || "Timeout getting response";
}
