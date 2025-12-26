# Liblib 自动化工作台 (Liblib Automation Tool)

这是一个基于 Next.js 开发的前端自动化工具，用于串联 **豆包 (Doubao)** 和 **Liblib.ai** 的工作流。

## 核心功能
1.  **批量任务管理**：输入多行原始需求，自动解析为任务队列。
2.  **智能提示词生成**：自动将需求发送给豆包，获取专业的英文绘画提示词。
3.  **自动化生图**：将提示词自动填入 Liblib 并触发生成。
4.  **结果归档**：自动抓取生成的图片链接并存入本地 MongoDB 数据库。

## ⚠️ 重要：启动前的安全配置

由于浏览器同源策略 (Same-Origin Policy) 的限制，网页无法直接操作 iframe 内的第三方网站。因此，**必须**使用特殊的参数启动 Chrome 浏览器以禁用 Web 安全策略。

### macOS 启动方式

1.  **完全关闭**当前运行的所有 Chrome 窗口（确保 Dock 栏下方没有小黑点，或使用 `Command + Q`）。
2.  打开终端 (Terminal)，运行以下命令启动 Chrome：

```bash
open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --user-data-dir="/tmp/chrome_dev_test" --disable-web-security
```

*注意：这会启动一个新的 Chrome 实例，顶部会提示"您使用的是不受支持的命令行标记"。这是正常现象。*

### Windows 启动方式

1.  关闭所有 Chrome 窗口。
2.  按 `Win + R`，输入 `cmd` 打开终端。
3.  运行：

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\tmp\chrome_dev_test" --disable-web-security
```

## 开发环境设置

### 1. 启动 MongoDB
确保本地安装了 MongoDB 并已启动服务：
```bash
brew services start mongodb-community
# 或手动运行 mongod
```
数据库连接地址默认为：`mongodb://localhost:27017/ai-workflow`

### 2. 安装依赖
```bash
npm install
```

### 3. 启动项目
```bash
npm run dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)。

## 使用流程

1.  **登录账号**：在右侧的 "豆包" 和 "Liblib" 标签页中，分别**手动登录**您的账号。
2.  **配置前缀**：在左侧设置发送给豆包的提示词前缀（默认为翻译指令）。
3.  **输入需求**：在"原始需求"框中输入想要生成的画面描述，每行一个。
4.  **解析与运行**：点击"解析为任务清单"，确认无误后点击"开始自动化"。
5.  **监控**：观察下方的日志窗口，等待任务逐个完成。

## 常见问题

*   **无法操作 Iframe？**
    请检查是否严格按照上述"启动方式"禁用了 web-security。如果控制台报错 `Blocked a frame with origin "http://localhost:3000" from accessing a cross-origin frame`，说明安全策略未关闭。

*   **豆包/Liblib 界面变了？**
    自动化脚本依赖于网页的 DOM 结构。如果官方更新了类名或 ID，需要在 `components/ControlPanel.js` 中更新选择器逻辑。
