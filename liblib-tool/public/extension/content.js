// Listen for messages from the Next.js app (via window.postMessage from parent frame)
window.addEventListener('message', async function(event) {
  // We only accept messages from our known parent (localhost:3000)
  // But since we are inside an iframe, event.source is the parent window.
  // We need to verify the origin if possible, but for local tool it's okay.
  
  const data = event.data;
  if (!data || !data.action || data.target !== 'extension_content_script') return;

  console.log('[Extension] Received command:', data);

  if (data.action === 'fill_doubao') {
    handleDoubaoFill(data.payload);
  }
});

function handleDoubaoFill(text) {
  try {
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
      console.error('[Extension] Doubao input not found. Selectors checked:', selectors);
      // Try to dump some debug info
      const textareas = document.querySelectorAll('textarea');
      console.log('[Extension] Found textareas:', textareas);
      
      window.parent.postMessage({ type: 'EXTENSION_RESPONSE', status: 'error', message: 'Input not found (Extension)' }, '*');
      return;
    }

    // React value setter hack
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeTextAreaValueSetter.call(inputEl, text);
    
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Attempt to trigger enter key if needed later, but for now just log
    console.log('[Extension] Filled Doubao input with:', text);
    
    // Explicitly send back to parent
    window.parent.postMessage({ type: 'EXTENSION_RESPONSE', status: 'success', action: 'fill_doubao' }, '*');
    
  } catch (e) {
    console.error('[Extension] Error:', e);
    window.parent.postMessage({ type: 'EXTENSION_RESPONSE', status: 'error', message: e.message }, '*');
  }
}
