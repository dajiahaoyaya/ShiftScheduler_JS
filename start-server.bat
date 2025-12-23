@echo off
chcp 65001 >nul
echo 正在启动HTTP服务器在端口8000...
start /B python -m http.server 8000
timeout /t 2 /nobreak >nul
echo 服务器已启动！
echo 正在打开浏览器...
start http://localhost:8000/index.html
echo.
echo 服务器正在运行中...
echo 按 Ctrl+C 停止服务器
python -m http.server 8000

