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
    if (!doubaoTabId) {
      sendResponse({ success: false, error: 'Doubao tab not found. Please open Doubao.' });
      return;
    }
    // Activate tab (optional, for better visibility)
    // chrome.tabs.update(doubaoTabId, { active: true });
    
    chrome.tabs.sendMessage(doubaoTabId, request, (response) => {
       if (chrome.runtime.lastError) {
           console.error(chrome.runtime.lastError);
           sendResponse({ success: false, error: 'Failed to communicate with Doubao tab: ' + chrome.runtime.lastError.message });
       } else {
           sendResponse(response);
       }
    });
    return true; // Async response
  }

  if (request.action === 'execute_liblib') {
    if (!liblibTabId) {
      sendResponse({ success: false, error: 'Liblib tab not found. Please open Liblib.' });
      return;
    }
    
    chrome.tabs.sendMessage(liblibTabId, request, (response) => {
       if (chrome.runtime.lastError) {
           console.error(chrome.runtime.lastError);
           sendResponse({ success: false, error: 'Failed to communicate with Liblib tab: ' + chrome.runtime.lastError.message });
       } else {
           sendResponse(response);
       }
    });
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
