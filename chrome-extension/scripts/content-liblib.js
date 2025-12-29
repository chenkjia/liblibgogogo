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
    // Update selectors based on user provided HTML
    const inputSelectors = [
        'textarea.input_inputStyle__jxWuX', // Specific class from user HTML
        'textarea[placeholder*="输入图片生成的提示词"]', // Exact placeholder from user HTML
        'textarea[placeholder*="Prompt"]', 
        '#prompt-input'
    ];
    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = document.querySelector(sel);
      if (inputEl) break;
    }
    
    if (!inputEl) {
      // Fallback: try finding any textarea that looks like the main input
      const textareas = Array.from(document.querySelectorAll('textarea'));
      inputEl = textareas.find(t => t.placeholder && t.placeholder.includes('提示词'));
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
    // Capture state BEFORE clicking to detect changes
    // User instruction: Locate based on #watermarkcontainer
    // Structure: #watermarkcontainer + div > div (main list)
    const getTaskContainer = () => {
        const watermark = document.getElementById('watermarkcontainer');
        if (!watermark) return null;
        
        // The container is the sibling immediately after watermarkcontainer?
        // Or deeper?
        // User screenshot: 
        // <div id="watermarkcontainer">...</div>
        // <div class="px-4 relative flex flex-col...">   <-- Sibling
        //    <div class="max-w-[976px] mx-auto ...">     <-- The List Container
        //       <div class="flex flex-col gap-3">...</div> <-- The Items
        
        const sibling = watermark.nextElementSibling;
        if (!sibling) return null;
        
        // Find the inner list container
        // It has class "max-w-[976px]"
        // Let's use querySelector on the sibling to be safe
        // Or just find the first div child?
        // Let's stick to the class user pointed out implicitly "max-w-[976px]" inside the sibling.
        const listContainer = sibling.querySelector('div[class*="max-w-"][class*="mx-auto"]');
        return listContainer;
    };
    
    const container = getTaskContainer();
    
    const prevCount = container ? container.children.length : 0;
    let prevLastItemText = '';
    if (prevCount > 0) {
        prevLastItemText = container.children[prevCount - 1].innerText;
    }
    
    console.log(`[LiblibExt] Before Gen - Count: ${prevCount}, LastTextLen: ${prevLastItemText.length}`);

    // Try multiple strategies to find the Generate button
    const generateBtnSelectors = [
        'button[data-testid="generate-btn"]',
        '.generate-btn', // Common class
        'div[class*="generate"] button' 
    ];

    let generateBtn = null;
    
    // Strategy A: Selectors
    for (const sel of generateBtnSelectors) {
        generateBtn = document.querySelector(sel);
        if (generateBtn) break;
    }

    // Strategy B: Text Content (Most reliable for Liblib)
    if (!generateBtn) {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        generateBtn = buttons.find(b => {
            const text = b.innerText || '';
            // Match "立即生成", "生成", "Generate" and ensure it's not "Stop"
            // Also user provided snippet shows the button has text "1" and an SVG.
            // But the wrapper div has `aria-controls` for dropdown? Wait, no.
            // The button provided: <button ...><span ...>1</span>...</button> 
            // This looks like the "Generate" button which shows the cost "1" (point).
            // It has a gradient background.
            
            // Heuristic for gradient button (common for main action)
            const style = window.getComputedStyle(b);
            const isGradient = style.backgroundImage.includes('linear-gradient');
            
            // If it's the main gradient button and has a number (cost) inside, it's likely the one.
            if (isGradient && /\d/.test(text) && b.querySelector('svg')) {
                 return true;
            }

            return (text.includes('生成') || text.includes('Generate')) && !text.includes('停止');
        });
    }

    if (!generateBtn) {
        // Strategy C: Match by specific class structure from user snippet
        // Look for button with specific gradient class
        const gradientBtn = document.querySelector('button[class*="bg-[linear-gradient"]');
        if (gradientBtn) {
            generateBtn = gradientBtn;
        }
    }

    if (!generateBtn) {
        // Strategy C: Look for the specific icon class mentioned in logs/HTML if available, 
        // or the big primary button usually at the bottom right or top right.
        // Based on user snippet, there is a button with `icon-proenlarge` but that is "Add".
        // The generate button is usually floating or distinct.
        console.warn('[LiblibExt] Generate button not found by text. Trying heuristic...');
    }
    
    if (!generateBtn) {
        sendResponse({ success: false, error: 'Cannot find Generate button' });
        return;
    }
    
    console.log('[LiblibExt] Clicking Generate button:', generateBtn);
    generateBtn.click();

    // 4. Wait for Image
    // Use the new DOM monitoring logic for the task list
    const imageUrl = await waitForImage(prevCount, prevLastItemText);
    sendResponse({ success: true, imageUrl: imageUrl });

  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function waitForImage(prevCount, prevLastItemText) {
    console.log('[LiblibExt] Starting monitoring loop...');
    const MAX_WAIT = 300000; // 5 mins
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT) {
        await new Promise(r => setTimeout(r, 2000));
        
        const watermark = document.getElementById('watermarkcontainer');
        if (!watermark) {
            console.log('[LiblibExt] watermarkcontainer not found');
            continue;
        }

        const nextSibling = watermark.nextElementSibling;
        if (!nextSibling) {
            console.log('[LiblibExt] No next sibling found');
            continue;
        }

        // Find all DIRECT children with class "flex flex-col gap-3" inside the sibling
        // User pointed out querySelectorAll finds descendants (grandchildren).
        // We need direct children of the container inside nextSibling.
        // Wait, nextSibling IS the container wrapper (px-4 relative...), but inside it is another div (max-w-[976px]).
        // Let's find that inner container first.
        
        const listContainer = nextSibling.querySelector('div[class*="max-w-"][class*="mx-auto"]');
        if (!listContainer) {
             console.log('[LiblibExt] Inner list container (max-w-...) not found');
             continue;
        }
        
        // Now get direct children of listContainer that match the class
        // Use :scope > .class if supported, or just filter children
        const items = Array.from(listContainer.children).filter(child => 
            child.className.includes('flex') && 
            child.className.includes('flex-col') && 
            child.className.includes('gap-3')
        );
        
        if (items.length === 0) {
            console.log('[LiblibExt] No .flex.flex-col.gap-3 items found');
            continue;
        }

        // Get the LAST item
        const lastItem = items[items.length - 1];
        console.log(lastItem)
        // Find UL -> First LI
        const ul = lastItem.querySelector('ul');
        if (!ul) {
            console.log('[LiblibExt] No UL found in last item');
            continue;
        }

        const firstLi = ul.querySelector('li');
        if (!firstLi) {
            console.log('[LiblibExt] No LI found in UL');
            continue;
        }

        const className = firstLi.className;
        console.log('[LiblibExt] LI Class:', className);

        // Check if generating
        // User instruction: check if class has "editor-historyList_loadingImageList"
        const isGenerating = className.includes('editor-historyList_loadingImageList');

        if (isGenerating) {
            console.log('[LiblibExt] Status: Generating...');
        } else {
            // Not generating -> Completed
            console.log('[LiblibExt] Status: Completed (No loading class). Finding image...');
            
            // Extract image
            const imgs = Array.from(firstLi.querySelectorAll('img'));
            // Filter valid images (http, size)
            const validImg = imgs.find(img => img.src && img.src.startsWith('http') && img.width > 50);

            if (validImg) {
                console.log('[LiblibExt] Image found:', validImg.src);
                return validImg.src;
            } else {
                console.log('[LiblibExt] No valid image found yet (waiting for render)...');
                
                // Check for failure text just in case
                if (firstLi.innerText.includes('失败') || firstLi.innerText.includes('Failed')) {
                    throw new Error('Image generation failed');
                }
            }
        }
    }
    throw new Error('Timeout waiting for image');
}

