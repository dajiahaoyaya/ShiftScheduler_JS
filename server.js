const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const port = 8000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function sendError(res, statusCode, message, contentType = 'text/plain') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(message, 'utf-8');
}

function getFilePath(pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  return `.${normalized}`;
}

function getOpenCommand(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    return `start ${url}`;
  }
  if (platform === 'darwin') {
    return `open ${url}`;
  }
  return `xdg-open ${url}`;
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // 解析URL
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname || '/';
  
  // 处理 URL 编码的路径（如空格等）
  pathname = decodeURIComponent(pathname);
  
  // 安全性检查：防止目录遍历
  if (pathname.includes('..')) {
    sendError(res, 403, 'Forbidden');
    return;
  }
  
  const filePath = getFilePath(pathname);

  // 调试日志：显示尝试读取的文件路径
  console.log(`尝试读取文件: ${path.resolve(filePath)}`);

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error(`读取文件失败: ${filePath}`, error);
      if (error.code === 'ENOENT') {
        sendError(res, 404, `<h1>404 - File Not Found</h1><p>${filePath}</p>`, 'text/html');
      } else {
        sendError(res, 500, `Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}/`);
  console.log('按 Ctrl+C 停止服务器');
  
  // 自动打开浏览器
  const url = `http://localhost:${port}/index.html`;
  console.log(`正在打开浏览器: ${url}`);
  
  const command = getOpenCommand(url);
  
  exec(command, (error) => {
    if (error) {
      console.log('无法自动打开浏览器，请手动访问:', url);
    }
  });
});

