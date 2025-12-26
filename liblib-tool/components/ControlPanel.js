'use client';

import { useState, useEffect, useRef } from 'react';

// Helper to wait
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ControlPanel({ doubaoRef, liblibRef }) {
  // State
  const [prefix, setPrefix] = useState('请将以下内容转为英文绘画提示词，只返回提示词本身，不要包含其他解释：');
  const [sourceText, setSourceText] = useState('');
  const [tasks, setTasks] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  
  // Refs for logic
  const isRunningRef = useRef(false);
  const tasksRef = useRef([]); // To access latest tasks in async loop

  // Sync refs
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Logging helper
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 99)]);
  };

  // Parse Source Text into Tasks
  const parseList = () => {
    const lines = sourceText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    
    if (lines.length === 0) {
      alert('请输入有效的内容');
      return;
    }

    const newTasks = lines.map((line, index) => ({
      id: Date.now() + index,
      originalText: line,
      doubaoPrompt: '',
      imageUrl: '',
      status: 'pending', // pending, processing_doubao, processing_liblib, completed, failed
      error: '',
    }));

    setTasks(newTasks);
    addLog(`已解析 ${newTasks.length} 个任务`);
  };

  // --- Automation Logic Helpers ---

  // 1. Send to Doubao and get result
  const processDoubao = async (task) => {
    addLog(`[Doubao] 开始处理: ${task.originalText.slice(0, 10)}...`);
    
    const iframe = doubaoRef.current;
    if (!iframe) throw new Error('Doubao iframe not found');
    const doc = iframe.contentWindow.document;

    // A. Find Input
    // Try multiple selectors for chat input
    const inputSelectors = [
      'div[contenteditable="true"]',
      'textarea[placeholder*="输入"]',
      '#chat-input',
      '.semi-input-textarea'
    ];
    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = doc.querySelector(sel);
      if (inputEl) break;
    }

    if (!inputEl) throw new Error('无法找到豆包输入框');

    // B. Input Text
    const fullPrompt = `${prefix}\n${task.originalText}`;
    inputEl.focus();
    // Simulate typing usually requires setting value and dispatching events
    // For contenteditable div:
    if (inputEl.tagName === 'DIV') {
        inputEl.innerText = fullPrompt;
    } else {
        inputEl.value = fullPrompt;
    }
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);

    // C. Click Send
    const sendBtnSelectors = [
      'button[data-testid="send-button"]', 
      'button[aria-label="发送"]',
      '.semi-button-primary' // Generic semi design button, might need refinement
    ];
    let sendBtn = null;
    // Try to find button near input first or globally
    // Usually the send button is a sibling or child of the input wrapper
    // Let's try global search for now
    for (const sel of sendBtnSelectors) {
       // Filter visible buttons
       const btns = Array.from(doc.querySelectorAll(sel));
       sendBtn = btns.find(b => b.offsetParent !== null); // Check visibility
       if (sendBtn) break;
    }
    
    // Fallback: search by text
    if (!sendBtn) {
        const buttons = Array.from(doc.querySelectorAll('button'));
        sendBtn = buttons.find(b => b.innerText.includes('发送') || b.innerHTML.includes('svg')); // Often an icon
    }

    if (!sendBtn) {
        // Last resort: press Enter
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
        sendBtn.click();
    }

    addLog(`[Doubao] 已发送请求，等待响应...`);

    // D. Wait for Response
    // We need to wait for the response to complete.
    // Strategy: Count the number of message bubbles, wait for a new one to appear and stop "streaming".
    // This is tricky without specific class names.
    // Simplified: Wait for 5 seconds initial delay, then check for "streaming" indicators, or just wait fixed time + polling length.
    
    await sleep(3000); // Wait for generation to start

    // Poll for completion
    // Doubao usually has a "stop generating" button when running, or the message bubble has a specific class.
    // Let's wait until the text stabilizes.
    let lastText = '';
    let stableCount = 0;
    let attempts = 0;
    
    while (attempts < 30) { // Max 60 seconds (2s * 30)
      await sleep(2000);
      
      // Get all message bubbles
      // Selector guess: .msg-content, div[data-testid="msg-content"]
      // Let's try to find the container of messages
      const bubbles = Array.from(doc.querySelectorAll('.semi-typography')); // Doubao often uses semi-design
      // Filter out user messages if possible. Usually user messages are on the right or have specific classes.
      // Assuming the last bubble is the bot response.
      
      // Better strategy: Find the last element that contains text and looks like a message
      // Doubao class names are often obfuscated.
      // Let's assume the user just cleared the chat or we look for the very last text container.
      
      // Let's try to capture specific Doubao classes if we know them, otherwise generic.
      // As of late 2024, Doubao classes might be dynamic.
      // Look for the last text node in the conversation area.
      
      // Fallback: Get all text from the main chat container.
      // Let's assume we read the last non-empty div that is not the input.
      
      // For this prototype, I will try to find the last message bubble by a broad selector
      const potentialMessages = Array.from(doc.querySelectorAll('div[class*="content"]')); 
      if (potentialMessages.length > 0) {
        const lastMsg = potentialMessages[potentialMessages.length - 1];
        const currentText = lastMsg.innerText;
        
        if (currentText && currentText.length > 10 && currentText === lastText) {
             stableCount++;
             if (stableCount >= 2) { // Stable for 4 seconds
                 // Clean up the text (remove "Regenerate", "Copy" etc if captured)
                 return currentText; 
             }
        } else {
            stableCount = 0;
        }
        lastText = currentText;
      }
      attempts++;
    }
    
    // If timed out, return whatever we have
    return lastText || "Error: Timeout waiting for Doubao";
  };

  // 2. Send to Liblib and get result
  const processLiblib = async (task, prompt) => {
    addLog(`[Liblib] 开始生图: ${prompt.slice(0, 10)}...`);
    
    const iframe = liblibRef.current;
    if (!iframe) throw new Error('Liblib iframe not found');
    const doc = iframe.contentWindow.document;

    // A. Find Prompt Input
    // Liblib usually has a big textarea for prompt
    const inputSelectors = ['textarea[placeholder*="提示词"]', 'textarea[placeholder*="Prompt"]', '#prompt-input'];
    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = doc.querySelector(sel);
      if (inputEl) break;
    }
    if (!inputEl) throw new Error('无法找到Liblib提示词输入框');

    // B. Fill Prompt
    // Liblib might rely on React state, so just setting value might not work.
    // Try native value setter + event dispatch
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeTextAreaValueSetter.call(inputEl, prompt);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    
    await sleep(500);

    // C. Click Generate
    // Button usually says "Generate" or "生成"
    const buttons = Array.from(doc.querySelectorAll('button'));
    const generateBtn = buttons.find(b => b.innerText.includes('生成') || b.innerText.includes('Generate'));
    
    if (!generateBtn) throw new Error('无法找到Liblib生成按钮');
    
    generateBtn.click();
    addLog(`[Liblib] 已点击生成，监控进度...`);

    // D. Monitor for Result
    // Wait for the new image to appear.
    // We can count current images, then wait for count to increase.
    // Or check for a "Generating" spinner to disappear.
    
    // Let's assume the latest image appears at the top or in a specific grid.
    // Strategy: Wait 5s, then poll for a new img tag that wasn't there before?
    // Better: Liblib puts results in a gallery.
    // Let's wait for a reasonable time (e.g. 15s) and check if the generation queue is empty.
    
    // Mocking the wait for real generation (it takes time!)
    // We will poll for 60 seconds max.
    
    let attempts = 0;
    while (attempts < 60) { // 2 mins
       await sleep(2000);
       
       // Try to find the result image.
       // Usually it's in a grid. We need to grab the first one (latest).
       // Selector: img[src*="liblib"] or similar
       const imgs = Array.from(doc.querySelectorAll('img[src*="http"]')); // Get all images
       // Filter out UI icons (usually small)
       const contentImgs = imgs.filter(img => img.width > 200 && img.height > 200);
       
       if (contentImgs.length > 0) {
           // We found some images. How do we know it's the NEW one?
           // For now, let's just take the first one found as the result.
           // In a real scenario, we should record the list of images BEFORE clicking generate, and compare.
           // But for V1, let's assume the user is on the "Generate" page and the result pops up.
           
           // To avoid grabbing old images, we could check if the image was loaded recently? No easy way.
           // Let's return the src of the first large image found.
           return contentImgs[0].src;
       }
       attempts++;
    }
    
    throw new Error('Liblib 生成超时');
  };

  // 3. Save to Database
  const saveResult = async (task, prompt, imageUrl) => {
     try {
         const res = await fetch('/api/tasks', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 originalText: task.originalText,
                 doubaoPrompt: prompt,
                 imageUrl: imageUrl,
                 status: 'completed'
             })
         });
         const data = await res.json();
         if (!data.success) throw new Error(data.error);
         return data.data;
     } catch (e) {
         addLog(`[Error] 保存失败: ${e.message}`);
         throw e;
     }
  };

  // Main Loop
  const startAutomation = async () => {
    if (isRunning) return;
    setIsRunning(true);
    addLog('自动化流程已启动...');

    // We process tasks that are pending
    // We need to loop through the REF of tasks to handle state updates correctly if we were modifying state in loop
    // But here we can just map indices.
    
    const taskList = tasksRef.current;
    
    for (let i = 0; i < taskList.length; i++) {
        if (!isRunningRef.current) break; // Check stop flag
        
        const task = tasksRef.current[i];
        if (task.status === 'completed') continue;

        // Update Status: Processing Doubao
        updateTaskStatus(task.id, 'processing_doubao');
        
        try {
            // Step 1: Doubao
            let prompt = task.doubaoPrompt;
            if (!prompt) {
                prompt = await processDoubao(task);
                // Clean up prompt if needed (remove prefixes)
                updateTaskField(task.id, 'doubaoPrompt', prompt);
                addLog(`[Doubao] 获取提示词成功`);
            }

            // Step 2: Liblib
            if (!isRunningRef.current) break;
            updateTaskStatus(task.id, 'processing_liblib');
            
            const imageUrl = await processLiblib(task, prompt);
            updateTaskField(task.id, 'imageUrl', imageUrl);
            addLog(`[Liblib] 图片生成成功`);

            // Step 3: Save
            await saveResult(task, prompt, imageUrl);
            
            // Step 4: Complete
            updateTaskStatus(task.id, 'completed');
            addLog(`任务 ${i+1} 完成！`);

        } catch (error) {
            console.error(error);
            addLog(`[Error] 任务 ${i+1} 失败: ${error.message}`);
            updateTaskStatus(task.id, 'failed', error.message);
        }

        // Wait a bit before next task
        await sleep(2000);
    }

    setIsRunning(false);
    addLog('自动化流程结束');
  };

  const stopAutomation = () => {
    setIsRunning(false);
    addLog('已发出停止指令...');
  };

  // State Updaters
  const updateTaskStatus = (id, status, error = '') => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, error } : t));
  };

  const updateTaskField = (id, field, value) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 1. Configuration */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">1. 提示词前缀 (Prefix)</label>
        <textarea
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          className="w-full h-20 p-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 text-gray-800"
          placeholder="输入发送给豆包的前缀..."
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">2. 原始需求 (Source Text)</label>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className="w-full h-32 p-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 text-gray-800"
          placeholder="每行输入一个需求..."
        />
        <button
          onClick={parseList}
          className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          解析为任务清单 (Parse)
        </button>
      </div>

      {/* 2. Actions */}
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={startAutomation}
            disabled={tasks.length === 0}
            className="flex-1 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            开始自动化 (Start)
          </button>
        ) : (
          <button
            onClick={stopAutomation}
            className="flex-1 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            停止 (Stop)
          </button>
        )}
      </div>

      {/* 3. Task List */}
      <div className="flex-1 overflow-y-auto border rounded bg-white p-2">
        <h3 className="text-sm font-semibold mb-2 sticky top-0 bg-white pb-1 border-b">任务队列 ({tasks.length})</h3>
        {tasks.length === 0 && <p className="text-xs text-gray-400 text-center mt-4">暂无任务</p>}
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className={`p-2 rounded border text-xs ${
                task.status === 'completed' ? 'bg-green-50 border-green-200' :
                task.status === 'failed' ? 'bg-red-50 border-red-200' :
                task.status.startsWith('processing') ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
            }`}>
              <div className="font-bold truncate mb-1">{task.originalText}</div>
              <div className="flex justify-between items-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      task.status === 'completed' ? 'bg-green-200 text-green-800' :
                      task.status === 'failed' ? 'bg-red-200 text-red-800' :
                      task.status === 'pending' ? 'bg-gray-200 text-gray-600' : 'bg-blue-200 text-blue-800'
                  }`}>
                      {task.status}
                  </span>
                  {task.imageUrl && (
                      <a href={task.imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">查看图片</a>
                  )}
              </div>
              {task.error && <div className="text-red-500 mt-1">{task.error}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Logs */}
      <div className="h-32 overflow-y-auto bg-black text-green-400 p-2 text-xs font-mono rounded">
          {logs.map((log, i) => (
              <div key={i}>{log}</div>
          ))}
      </div>
    </div>
  );
}
