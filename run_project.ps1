$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendPort = 5003
$frontendPort = 5175
$mongoPort = 27017
$mongoLogPath = Join-Path $root 'qa-artifacts\mongo-manual\mongod-run-project.log'
$mongoDataCandidates = @(
    (Join-Path $root '.local-mongo\data'),
    (Join-Path $root '.mongo-local\data')
)
$mongoBinCandidates = @(
    'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe'
)

function Write-Step([string]$message) {
    Write-Host ''
    Write-Host ('[CampusWay] ' + $message) -ForegroundColor Cyan
}

function Test-PortListening([int]$port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Stop-ProcessTree([int]$processId) {
    try {
        & taskkill.exe /PID $processId /T /F *> $null
    } catch {
    }
}

function Stop-CampusWayProcesses() {
    $targets = New-Object System.Collections.Generic.HashSet[int]
    foreach ($port in @($backendPort, $frontendPort)) {
        $connections = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        foreach ($connection in $connections) {
            [void]$targets.Add([int]$connection.OwningProcess)
        }
    }

    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $commandLine = [string]$_.CommandLine
        $commandLine -match [regex]::Escape($backendDir) -or
        $commandLine -match [regex]::Escape($frontendDir) -or
        $commandLine -match 'title CampusWay Backend' -or
        $commandLine -match 'title CampusWay Frontend'
    })

    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if (
            $commandLine -match 'title CampusWay Backend' -or
            $commandLine -match 'title CampusWay Frontend' -or
            $commandLine -match 'tsx(\.cmd)?\s+watch\s+src\\server\.ts' -or
            $commandLine -match 'vite(\.js)?\s+--host\s+127\.0\.0\.1\s+--port\s+5175' -or
            $commandLine -match 'vite(\.js)?\s+--port\s+5175' -or
            $commandLine -match 'npm(\.cmd)?\s+run\s+dev\s+--\s+--host\s+127\.0\.0\.1\s+--port\s+5175' -or
            $commandLine -match 'npm(\.cmd)?\s+run\s+dev\s+--\s+--port\s+5175'
        ) {
            [void]$targets.Add([int]$process.ProcessId)
        }
    }

    foreach ($processId in $targets) {
        Stop-ProcessTree -processId $processId
    }
}

function Wait-ForPort([int]$port, [int]$timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -port $port) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Wait-ForHttp([string]$url, [int]$timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Start-TerminalWindow([string]$title, [string]$workingDir, [string]$command) {
    $inner = "title $title && cd /d `"$workingDir`" && $command"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $inner -WorkingDirectory $workingDir | Out-Null
}

function Ensure-NodeModules([string]$name, [string]$path) {
    if (-not (Test-Path (Join-Path $path 'node_modules'))) {
        throw "$name dependencies are missing. Run npm install inside $path first."
    }
}

function Ensure-Mongo() {
    if (Test-PortListening -port $mongoPort) {
        Write-Host '[OK] MongoDB is already running on port 27017.' -ForegroundColor Green
        return
    }

    $mongoBin = $mongoBinCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    $mongoDataPath = $mongoDataCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $mongoBin) {
        throw 'MongoDB is not running and mongod.exe was not found in the standard install path.'
    }
    if (-not $mongoDataPath) {
        throw 'MongoDB data folder was not found. Expected .local-mongo\data or .mongo-local\data.'
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $mongoLogPath) | Out-Null
    $mongoArgs = @(
        '--dbpath', $mongoDataPath,
        '--bind_ip', '127.0.0.1',
        '--port', "$mongoPort",
        '--logpath', $mongoLogPath,
        '--setParameter', 'diagnosticDataCollectionEnabled=false'
    )
    $proc = Start-Process -FilePath $mongoBin -ArgumentList $mongoArgs -WindowStyle Hidden -PassThru

    if (-not (Wait-ForPort -port $mongoPort -timeoutSeconds 20)) {
        throw "MongoDB failed to start. Check $mongoLogPath"
    }

    Write-Host ("[OK] MongoDB started (PID " + $proc.Id + ').') -ForegroundColor Green
}

Clear-Host
Write-Host '==========================================' -ForegroundColor DarkCyan
Write-Host '   CampusWay Local Server Starting...' -ForegroundColor White
Write-Host '==========================================' -ForegroundColor DarkCyan

Write-Step 'Checking project dependencies'
Ensure-NodeModules -name 'Backend' -path $backendDir
Ensure-NodeModules -name 'Frontend' -path $frontendDir

Write-Step 'Preparing MongoDB'
Ensure-Mongo

Write-Step 'Stopping old CampusWay dev processes'
Stop-CampusWayProcesses
Start-Sleep -Seconds 2

Write-Step 'Starting backend window'
Start-TerminalWindow -title 'CampusWay Backend' -workingDir $backendDir -command "set `"PORT=$backendPort`" && npm run dev"

Write-Step 'Starting frontend window'
Start-TerminalWindow -title 'CampusWay Frontend' -workingDir $frontendDir -command "npm run dev -- --host 127.0.0.1 --port $frontendPort"

Write-Step 'Waiting for backend readiness'
if (-not (Wait-ForHttp -url "http://127.0.0.1:$backendPort/api/health" -timeoutSeconds 90)) {
    throw "Backend did not become ready on http://127.0.0.1:$backendPort/api/health"
}

Write-Step 'Waiting for frontend readiness'
if (-not (Wait-ForHttp -url "http://127.0.0.1:$frontendPort" -timeoutSeconds 60)) {
    throw "Frontend did not become ready on http://127.0.0.1:$frontendPort"
}

Write-Host ''
Write-Host '[OK] CampusWay is ready.' -ForegroundColor Green
Write-Host ''
Write-Host 'Frontend   : http://localhost:5175' -ForegroundColor White
Write-Host 'Backend API: http://localhost:5003/api' -ForegroundColor White
Write-Host 'Admin Login: http://localhost:5175/__cw_admin__/login' -ForegroundColor White
Write-Host ''

Start-Process "http://127.0.0.1:$frontendPort" | Out-Null

Write-Host 'The app opened in your browser. You can close this window now.' -ForegroundColor Yellow
Write-Host ''
pause
