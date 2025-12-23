const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const port = 8000;

const mimeTypes = {
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

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // 解析URL
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;
  
  // 处理 URL 编码的路径（如空格等）
  pathname = decodeURIComponent(pathname);
  
  // 安全性检查：防止目录遍历
  if (pathname.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  let filePath = '.' + pathname;
  if (filePath === './') {
    filePath = './index.html';
  }

  // 调试日志：显示尝试读取的文件路径
  console.log(`尝试读取文件: ${path.resolve(filePath)}`);

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error(`读取文件失败: ${filePath}`, error);
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1><p>' + filePath + '</p>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
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
  
  // 根据操作系统选择不同的命令
  const platform = process.platform;
  let command;
  
  if (platform === 'win32') {
    // Windows系统
    command = `start ${url}`;
  } else if (platform === 'darwin') {
    // macOS系统
    command = `open ${url}`;
  } else {
    // Linux系统
    command = `xdg-open ${url}`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.log('无法自动打开浏览器，请手动访问:', url);
    }
  });
});

