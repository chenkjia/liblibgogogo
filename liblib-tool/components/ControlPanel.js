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

  // 1. Send to Doubao via PostMessage (Extension)
  const processDoubao = async (task) => {
    addLog(`[Doubao] 开始处理: ${task.originalText.slice(0, 10)}...`);
    
    const iframe = doubaoRef.current;
    if (!iframe) throw new Error('Doubao iframe not found');
    
    // Construct prompt
    const fullPrompt = `${prefix}\n${task.originalText}`;

    // Send message to iframe (caught by content script)
    iframe.contentWindow.postMessage({
        target: 'extension_content_script',
        action: 'fill_doubao',
        payload: fullPrompt
    }, '*');

    // Wait for response from extension
    return new Promise((resolve, reject) => {
        const handler = (event) => {
            if (event.data && event.data.type === 'EXTENSION_RESPONSE') {
                if (event.data.status === 'success') {
                    window.removeEventListener('message', handler);
                    addLog(`[Doubao] Extension 反馈: 填充成功`);
                    resolve(true);
                } else if (event.data.status === 'error') {
                    window.removeEventListener('message', handler);
                    reject(new Error(event.data.message));
                }
            }
        };
        
        window.addEventListener('message', handler);
        
        // Timeout
        setTimeout(() => {
            window.removeEventListener('message', handler);
            // Don't reject, just log warning to allow debugging if extension is slow or not loaded
            console.warn('等待 Extension 响应超时，可能是插件未加载或未匹配到页面。');
            reject(new Error('等待 Extension 响应超时 (请检查插件是否加载且刷新页面)'));
        }, 8000); // Increase timeout to 8s
    });
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
    addLog('自动化流程已启动 (仅填充模式)...');
    
    const taskList = tasksRef.current;
    
    // Only process the first pending task
    const task = taskList.find(t => t.status === 'pending');
    
    if (task) {
        updateTaskStatus(task.id, 'processing_doubao');
        try {
            await processDoubao(task);
            updateTaskStatus(task.id, 'completed'); // Mark as done for this step
            addLog(`任务 ${task.id} 填充完成`);
        } catch (error) {
            console.error(error);
            addLog(`[Error] 任务失败: ${error.message}`);
            updateTaskStatus(task.id, 'failed', error.message);
        }
    } else {
        addLog('没有待处理的任务');
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
