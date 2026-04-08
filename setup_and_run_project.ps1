$ErrorActionPreference = 'Stop'

function Write-Step([string]$message) {
    Write-Host ''
    Write-Host ("[CampusWay Setup] " + $message) -ForegroundColor Cyan
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host '[CampusWay Setup] Requesting Administrator permission...' -ForegroundColor Yellow
    $args = @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`""
    )
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args | Out-Null
    exit
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendEnv = Join-Path $backendDir '.env'
$backendEnvExample = Join-Path $backendDir '.env.example'
$frontendEnv = Join-Path $frontendDir '.env'
$frontendEnvExample = Join-Path $frontendDir '.env.example'
$backendPort = 5003
$frontendPort = 5175
$mongoPort = 27017
$mongoLogPath = Join-Path $root 'qa-artifacts\mongo-manual\mongod-one-click.log'
$mongoDataCandidates = @(
    (Join-Path $root '.local-mongo\data'),
    (Join-Path $root '.mongo-local\data')
)
$mongoBinCandidates = @(
    'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe'
)

function Get-CommandPathOrNull([string]$name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

function Refresh-PathFromRegistry {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ([string]::IsNullOrWhiteSpace($machinePath)) { $machinePath = '' }
    if ([string]::IsNullOrWhiteSpace($userPath)) { $userPath = '' }
    $env:Path = ($machinePath.TrimEnd(';') + ';' + $userPath.TrimStart(';')).Trim(';')
}

function Test-PortListening([int]$port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
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

function Start-TerminalWindow([string]$title, [string]$workingDir, [string]$command) {
    $inner = "title $title && cd /d `"$workingDir`" && $command"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $inner -WorkingDirectory $workingDir | Out-Null
}

function Install-WithWinget([string]$packageId) {
    & winget install `
        --id $packageId `
        --exact `
        --silent `
        --accept-package-agreements `
        --accept-source-agreements
    return $LASTEXITCODE -eq 0
}

function Ensure-Winget {
    if (-not (Get-CommandPathOrNull 'winget')) {
        throw 'winget is required for one-click install. Please install App Installer from Microsoft Store, then rerun this script.'
    }
}

function Ensure-Node {
    $nodePath = Get-CommandPathOrNull 'node'
    $needsInstall = $true

    if ($nodePath) {
        try {
            $rawVersion = (& node -v).Trim()
            $major = [int](($rawVersion -replace '^v', '').Split('.')[0])
            if ($major -ge 20) {
                $needsInstall = $false
                Write-Host ("[OK] Node.js found: " + $rawVersion) -ForegroundColor Green
            } else {
                Write-Host ("[WARN] Node.js " + $rawVersion + ' found. Upgrading to LTS...') -ForegroundColor Yellow
            }
        } catch {
            $needsInstall = $true
        }
    }

    if ($needsInstall) {
        Ensure-Winget
        Write-Step 'Installing Node.js LTS (this may take a few minutes)'
        if (-not (Install-WithWinget -packageId 'OpenJS.NodeJS.LTS')) {
            throw 'Failed to install Node.js via winget.'
        }
        Refresh-PathFromRegistry
        if (-not (Get-CommandPathOrNull 'node')) {
            throw 'Node.js install finished but command is still unavailable. Please reopen terminal and rerun.'
        }
        Write-Host ("[OK] Node.js installed: " + (& node -v)) -ForegroundColor Green
    }
}

function Find-MongodPath {
    foreach ($candidate in $mongoBinCandidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    $cmdPath = Get-CommandPathOrNull 'mongod'
    if ($cmdPath) {
        return $cmdPath
    }
    return $null
}

function Ensure-MongoBinary {
    $mongodPath = Find-MongodPath
    if ($mongodPath) {
        Write-Host ("[OK] MongoDB binary found: " + $mongodPath) -ForegroundColor Green
        return $mongodPath
    }

    Ensure-Winget
    Write-Step 'Installing MongoDB Server (this may take a few minutes)'

    $installed = $false
    foreach ($id in @('MongoDB.Server', 'MongoDB.DatabaseServer', 'MongoDB.MongoDBServer')) {
        if (Install-WithWinget -packageId $id) {
            $installed = $true
            break
        }
    }

    if (-not $installed) {
        throw 'Failed to install MongoDB Server via winget.'
    }

    Refresh-PathFromRegistry
    $mongodPath = Find-MongodPath
    if (-not $mongodPath) {
        throw 'MongoDB installation finished but mongod.exe was not found.'
    }

    Write-Host ("[OK] MongoDB installed: " + $mongodPath) -ForegroundColor Green
    return $mongodPath
}

function Ensure-Directory([string]$path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

function Ensure-EnvFile([string]$targetPath, [string]$examplePath) {
    if (Test-Path $targetPath) {
        return
    }
    if (-not (Test-Path $examplePath)) {
        throw ("Missing env example file: " + $examplePath)
    }
    Copy-Item -Path $examplePath -Destination $targetPath -Force
    Write-Host ("[OK] Created " + $targetPath) -ForegroundColor Green
}

function Set-OrAddEnvValue([string]$filePath, [string]$key, [string]$value) {
    $lines = @()
    if (Test-Path $filePath) {
        $lines = @(Get-Content $filePath)
    }

    $pattern = '^\s*' + [regex]::Escape($key) + '\s*='
    $replaced = $false

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) {
            $lines[$i] = "$key=$value"
            $replaced = $true
        }
    }

    if (-not $replaced) {
        $lines += "$key=$value"
    }

    Set-Content -Path $filePath -Value $lines -Encoding UTF8
}

function Ensure-NpmDependencies([string]$projectDir, [string]$label) {
    $nodeModulesPath = Join-Path $projectDir 'node_modules'
    if (Test-Path $nodeModulesPath) {
        Write-Host ("[OK] " + $label + ' dependencies already installed.') -ForegroundColor Green
        return
    }

    Write-Step ("Installing " + $label + ' dependencies')
    Push-Location $projectDir
    try {
        if (Test-Path (Join-Path $projectDir 'package-lock.json')) {
            npm ci
            if ($LASTEXITCODE -ne 0) {
                Write-Host '[WARN] npm ci failed, retrying with npm install...' -ForegroundColor Yellow
                npm install
            }
        } else {
            npm install
        }

        if ($LASTEXITCODE -ne 0) {
            throw ("Failed to install dependencies for " + $label)
        }
    } finally {
        Pop-Location
    }
    Write-Host ("[OK] " + $label + ' dependencies installed.') -ForegroundColor Green
}

function Start-MongoIfNeeded([string]$mongodPath) {
    if (Test-PortListening -port $mongoPort) {
        Write-Host '[OK] MongoDB already running on port 27017.' -ForegroundColor Green
        return
    }

    $mongoDataPath = $mongoDataCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $mongoDataPath) {
        $mongoDataPath = $mongoDataCandidates[0]
        Ensure-Directory $mongoDataPath
    }

    Ensure-Directory (Split-Path $mongoLogPath -Parent)

    $mongoArgs = @(
        '--dbpath', $mongoDataPath,
        '--bind_ip', '127.0.0.1',
        '--port', "$mongoPort",
        '--logpath', $mongoLogPath,
        '--setParameter', 'diagnosticDataCollectionEnabled=false'
    )

    $proc = Start-Process -FilePath $mongodPath -ArgumentList $mongoArgs -WindowStyle Hidden -PassThru
    if (-not (Wait-ForPort -port $mongoPort -timeoutSeconds 25)) {
        throw ("MongoDB failed to start. Check log: " + $mongoLogPath)
    }

    Write-Host ("[OK] MongoDB started (PID " + $proc.Id + ').') -ForegroundColor Green
}

if (-not (Test-Path $backendDir) -or -not (Test-Path $frontendDir)) {
    throw 'Run this script from the CampusWay project root folder.'
}

Clear-Host
Write-Host '=============================================' -ForegroundColor DarkCyan
Write-Host '    CampusWay One-Click Setup + Run' -ForegroundColor White
Write-Host '=============================================' -ForegroundColor DarkCyan

Write-Step 'Checking and installing prerequisites'
Ensure-Node
$mongodPath = Ensure-MongoBinary

Write-Step 'Preparing environment files'
Ensure-EnvFile -targetPath $backendEnv -examplePath $backendEnvExample
Ensure-EnvFile -targetPath $frontendEnv -examplePath $frontendEnvExample

Set-OrAddEnvValue -filePath $backendEnv -key 'PORT' -value '5003'
Set-OrAddEnvValue -filePath $backendEnv -key 'MONGODB_URI' -value 'mongodb://127.0.0.1:27017/campusway'
Set-OrAddEnvValue -filePath $backendEnv -key 'MONGO_URI' -value 'mongodb://127.0.0.1:27017/campusway'
Set-OrAddEnvValue -filePath $backendEnv -key 'FRONTEND_URL' -value 'http://localhost:5175'
Set-OrAddEnvValue -filePath $backendEnv -key 'ADMIN_ORIGIN' -value 'http://localhost:5175'
Set-OrAddEnvValue -filePath $backendEnv -key 'CORS_ORIGIN' -value 'http://localhost:5175,http://localhost:3000'
Set-OrAddEnvValue -filePath $backendEnv -key 'APP_DOMAIN' -value 'http://localhost:5175'

Set-OrAddEnvValue -filePath $frontendEnv -key 'VITE_API_BASE_URL' -value 'http://localhost:5003/api'
Set-OrAddEnvValue -filePath $frontendEnv -key 'VITE_API_PROXY_TARGET' -value 'http://localhost:5003'

Write-Step 'Installing project dependencies (first run only)'
Ensure-NpmDependencies -projectDir $backendDir -label 'Backend'
Ensure-NpmDependencies -projectDir $frontendDir -label 'Frontend'

Write-Step 'Starting MongoDB (if not already running)'
Start-MongoIfNeeded -mongodPath $mongodPath

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
