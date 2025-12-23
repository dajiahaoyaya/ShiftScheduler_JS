# 启动本地HTTP服务器
$port = 8000
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# 尝试使用Python启动服务器
$pythonCommands = @('python', 'python3', 'py')
$serverStarted = $false

foreach ($cmd in $pythonCommands) {
    try {
        $pythonPath = Get-Command $cmd -ErrorAction Stop
        Write-Host "使用 $cmd 启动服务器在端口 $port..."
        Start-Process -FilePath $pythonPath.Path -ArgumentList "-m", "http.server", $port.ToString() -WindowStyle Hidden
        $serverStarted = $true
        Start-Sleep -Seconds 2
        Write-Host "服务器已启动！"
        Write-Host "正在打开浏览器..."
        Start-Process "http://localhost:$port/index.html"
        break
    } catch {
        continue
    }
}

if (-not $serverStarted) {
    Write-Host "错误：未找到Python，请安装Python或使用其他HTTP服务器。"
    Write-Host "或者手动运行: python -m http.server 8000"
    Write-Host ""
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

