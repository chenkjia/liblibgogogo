// Sidepanel Logic

const $ = (id) => document.getElementById(id);
const logBox = $('log-box');

// State
let tasks = [];
let isDoubaoRunning = false;
let isLiblibRunning = false;

// Init
document.addEventListener('DOMContentLoaded', () => {
  restoreState();
  updateCounts();
  
  // Tabs
  $('tab-tasks').onclick = () => switchTab('tasks');
  $('tab-doubao').onclick = () => switchTab('doubao');
  $('tab-liblib').onclick = () => switchTab('liblib');

  // Task Management
  $('btn-parse').onclick = parseTasks;
  $('btn-clear').onclick = clearTasks;
  $('btn-export-json').onclick = exportJson;
  $('btn-import-json').onclick = () => $('file-input').click();
  $('file-input').onchange = importJson;

  // Doubao Controls
  $('btn-run-doubao').onclick = startDoubaoLoop;
  $('btn-stop-doubao').onclick = () => stopLoop('doubao');

  // Liblib Controls
  $('btn-run-liblib').onclick = startLiblibLoop;
  $('btn-stop-liblib').onclick = () => stopLoop('liblib');
});

function switchTab(tab) {
  ['tasks', 'doubao', 'liblib'].forEach(t => {
    $(`view-${t}`).style.display = t === tab ? 'block' : 'none';
    $(`tab-${t}`).classList.toggle('active', t === tab);
  });
}

function addLog(msg) {
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.textContent = `[${time}] ${msg}`;
  logBox.prepend(div);
}

// --- Task Management ---

function parseTasks() {
  const text = $('source-text').value;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  if (lines.length === 0) {
    addLog('Error: 请输入内容');
    return;
  }

  const newTasks = lines.map((line) => ({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    originalText: line,
    doubaoPrompt: '',
    imageUrl: '',
    status: 'pending', // pending -> doubao_completed -> completed
    error: ''
  }));

  tasks = [...tasks, ...newTasks];
  saveState();
  renderTasks();
  updateCounts();
  addLog(`新增 ${newTasks.length} 个任务`);
  $('source-text').value = '';
}

function clearTasks() {
  if (confirm('确定要清空所有任务吗？')) {
    tasks = [];
    saveState();
    renderTasks();
    updateCounts();
    addLog('已清空所有任务');
  }
}

function exportJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "tasks_" + new Date().toISOString().slice(0,10) + ".json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  addLog('已导出 JSON 文件');
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        tasks = imported; // Replace or merge? "Override" as implied by clear behavior logic often used
        saveState();
        renderTasks();
        updateCounts();
        addLog(`成功导入 ${tasks.length} 个任务`);
      } else {
        alert('JSON 格式错误: 必须是数组');
      }
    } catch (err) {
      alert('解析 JSON 失败: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset input
}

function renderTasks() {
  const container = $('task-list');
  container.innerHTML = '';
  $('task-count').textContent = tasks.length;

  if (tasks.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:20px;">暂无任务</div>';
    return;
  }

  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = `task-item task-${task.status}`;
    
    let statusLabel = task.status;
    let statusColor = '#9ca3af';
    
    if (task.status === 'pending') { statusLabel = '待处理'; statusColor = '#9ca3af'; }
    if (task.status === 'doubao_completed') { statusLabel = '待生图'; statusColor = '#3b82f6'; }
    if (task.status === 'completed') { statusLabel = '完成'; statusColor = '#10b981'; }
    if (task.status === 'failed') { statusLabel = '失败'; statusColor = '#ef4444'; }

    div.innerHTML = `
      <div style="margin-bottom:4px; font-size:12px; display:flex; justify-content:space-between;">
        <span style="font-weight:bold; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;" title="${task.originalText}">${task.originalText}</span>
        <span class="status-badge" style="background:${statusColor}; color:white;">${statusLabel}</span>
      </div>
      ${task.doubaoPrompt ? `<div style="font-size:10px; color:#666; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${task.doubaoPrompt}">Prompt: ${task.doubaoPrompt}</div>` : ''}
      ${task.imageUrl ? `<a href="${task.imageUrl}" target="_blank" class="link" style="font-size:11px;">查看结果图片</a>` : ''}
      ${task.error ? `<div style="color:red; font-size:10px;">${task.error}</div>` : ''}
    `;
    container.appendChild(div);
  });
}

function updateCounts() {
  const doubaoPending = tasks.filter(t => t.status === 'pending' || t.status === 'failed').length;
  const liblibPending = tasks.filter(t => t.status === 'doubao_completed').length;
  
  $('doubao-pending-count').textContent = doubaoPending;
  $('liblib-pending-count').textContent = liblibPending;
}

function updateTask(id, updates) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    tasks[idx] = { ...tasks[idx], ...updates };
    saveState();
    renderTasks();
    updateCounts();
  }
}

// --- Doubao Loop ---

async function startDoubaoLoop() {
  if (isDoubaoRunning) return;
  
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'failed');
  if (pendingTasks.length === 0) {
    addLog('[Doubao] 没有待处理的任务');
    return;
  }

  isDoubaoRunning = true;
  $('btn-run-doubao').style.display = 'none';
  $('btn-stop-doubao').style.display = 'inline-block';
  addLog(`[Doubao] 开始批处理 ${pendingTasks.length} 个任务...`);

  const prefix = $('doubao-prefix').value;

  for (const task of pendingTasks) {
    if (!isDoubaoRunning) break;

    try {
      addLog(`[Doubao] 处理: ${task.originalText.substring(0, 15)}...`);
      
      // Send to Active Tab (Doubao)
      const res = await chrome.runtime.sendMessage({
        action: 'execute_doubao',
        text: `${prefix}\n${task.originalText}`
      });

      if (!res.success) throw new Error(res.error);

      updateTask(task.id, { 
        doubaoPrompt: res.result, 
        status: 'doubao_completed',
        error: '' 
      });
      addLog(`[Doubao] 成功 -> 待生图`);

    } catch (e) {
      console.error(e);
      updateTask(task.id, { status: 'failed', error: e.message });
      addLog(`[Doubao] 失败: ${e.message}`);
    }

    // Wait random time to be safe
    await new Promise(r => setTimeout(r, 2000));
  }

  stopLoop('doubao');
}

// --- Liblib Loop ---

async function startLiblibLoop() {
  if (isLiblibRunning) return;

  const pendingTasks = tasks.filter(t => t.status === 'doubao_completed');
  if (pendingTasks.length === 0) {
    addLog('[Liblib] 没有待处理的任务');
    return;
  }

  isLiblibRunning = true;
  $('btn-run-liblib').style.display = 'none';
  $('btn-stop-liblib').style.display = 'inline-block';
  addLog(`[Liblib] 开始批处理 ${pendingTasks.length} 个任务...`);

  for (const task of pendingTasks) {
    if (!isLiblibRunning) break;

    try {
      addLog(`[Liblib] 生成中: ${task.doubaoPrompt.substring(0, 15)}...`);

      const res = await chrome.runtime.sendMessage({
        action: 'execute_liblib',
        prompt: task.doubaoPrompt
      });

      if (!res.success) throw new Error(res.error);

      updateTask(task.id, { 
        imageUrl: res.imageUrl, 
        status: 'completed',
        error: '' 
      });
      addLog(`[Liblib] 完成！`);

    } catch (e) {
      console.error(e);
      // For Liblib, if failed, maybe keep as doubao_completed to retry? Or mark failed.
      updateTask(task.id, { status: 'failed', error: e.message }); 
      addLog(`[Liblib] 失败: ${e.message}`);
    }

    // Wait longer for Liblib to cool down? 
    // The content script waits for generation, so we just need a small buffer here.
    await new Promise(r => setTimeout(r, 3000));
  }

  stopLoop('liblib');
}

function stopLoop(type) {
  if (type === 'doubao') {
    isDoubaoRunning = false;
    $('btn-run-doubao').style.display = 'inline-block';
    $('btn-stop-doubao').style.display = 'none';
    addLog('[Doubao] 任务停止/完成');
  } else {
    isLiblibRunning = false;
    $('btn-run-liblib').style.display = 'inline-block';
    $('btn-stop-liblib').style.display = 'none';
    addLog('[Liblib] 任务停止/完成');
  }
}

// --- Persistence ---

function saveState() {
  chrome.storage.local.set({ 
    tasks: tasks,
    doubaoPrefix: $('doubao-prefix').value
  });
}

function restoreState() {
  chrome.storage.local.get(['tasks', 'doubaoPrefix'], (res) => {
    if (res.tasks) {
      tasks = res.tasks;
      renderTasks();
      updateCounts();
    }
    if (res.doubaoPrefix) $('doubao-prefix').value = res.doubaoPrefix;
  });
}
