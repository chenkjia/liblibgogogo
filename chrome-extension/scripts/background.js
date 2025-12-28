// Background Service Worker
// Orchestrates the communication between SidePanel and Content Scripts

// Store tab IDs
let doubaoTabId = null;
let liblibTabId = null;

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'register_tab') {
    if (request.site === 'doubao') {
      doubaoTabId = sender.tab.id;
      console.log('Registered Doubao Tab:', doubaoTabId);
    } else if (request.site === 'liblib') {
      liblibTabId = sender.tab.id;
      console.log('Registered Liblib Tab:', liblibTabId);
    }
    sendResponse({ success: true });
  }
  
  // Forwarding requests from SidePanel to Content Scripts
  if (request.action === 'execute_doubao') {
    // Helper to execute script
    const run = (tabId) => {
        chrome.tabs.sendMessage(tabId, request, (response) => {
           if (chrome.runtime.lastError) {
               console.error(chrome.runtime.lastError);
               sendResponse({ success: false, error: 'Failed to communicate with Doubao tab: ' + chrome.runtime.lastError.message });
           } else {
               sendResponse(response);
           }
        });
    };

    if (doubaoTabId) {
        run(doubaoTabId);
    } else {
         // Fallback: Query tabs
         chrome.tabs.query({ url: '*://*.doubao.com/*' }, (tabs) => {
            if (tabs && tabs.length > 0) {
                doubaoTabId = tabs[0].id; // Update cache
                run(doubaoTabId);
            } else {
                sendResponse({ success: false, error: 'Doubao tab not found. Please open Doubao.' });
            }
        });
    }
    return true; // Async response
  }

  if (request.action === 'execute_liblib') {
    // Helper to execute script
    const run = (tabId) => {
        chrome.tabs.sendMessage(tabId, request, (response) => {
           if (chrome.runtime.lastError) {
               console.error(chrome.runtime.lastError);
               sendResponse({ success: false, error: 'Failed to communicate with Liblib tab: ' + chrome.runtime.lastError.message });
           } else {
               sendResponse(response);
           }
        });
    };

    if (liblibTabId) {
        run(liblibTabId);
    } else {
        // Fallback: Query tabs
        chrome.tabs.query({ url: '*://*.liblib.art/*' }, (tabs) => {
            if (tabs && tabs.length > 0) {
                liblibTabId = tabs[0].id; // Update cache
                run(liblibTabId);
            } else {
                sendResponse({ success: false, error: 'Liblib tab not found. Please open Liblib.' });
            }
        });
    }
    return true; // Async response
  }
  
  // Check tab status for UI
  if (request.action === 'check_tabs') {
      sendResponse({ doubao: doubaoTabId, liblib: liblibTabId });
  }
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === doubaoTabId) doubaoTabId = null;
  if (tabId === liblibTabId) liblibTabId = null;
});
