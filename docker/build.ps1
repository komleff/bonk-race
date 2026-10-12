<#
.SYNOPSIS
    Slime Arena Docker Build Script for Windows
.DESCRIPTION
    Universal PowerShell script for building Slime Arena Docker containers.
    Supports monolith, app-db, and db-only modes.
.PARAMETER Mode
    Build mode: monolith, app-db, or db-only (default: monolith)
.PARAMETER Version
    Version tag for the images (default: from version.json)
.PARAMETER Registry
    Container registry (default: ghcr.io/komleff)
.PARAMETER Push
    Push images to registry after build
.PARAMETER Seed
    Seed initial data (first player)
.PARAMETER Platform
    Target platform (linux/amd64, linux/arm64)
.EXAMPLE
    .\build.ps1 monolith
.EXAMPLE
    .\build.ps1 app-db -Push
.EXAMPLE
    .\build.ps1 monolith -Seed -Version 0.7.3
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("monolith", "app-db", "db-only")]
    [string]$Mode = "monolith",

    [string]$Version = "",

    [string]$Registry = "ghcr.io/komleff",

    [switch]$Push,

    [switch]$Seed,

    [string]$Platform = ""
)

$ErrorActionPreference = "Stop"

# =============================================================================
# Configuration
# =============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Get version from version.json if not specified
if (-not $Version) {
    $VersionFile = Join-Path $ProjectRoot "version.json"
    if (Test-Path $VersionFile) {
        $VersionJson = Get-Content $VersionFile | ConvertFrom-Json
        $Version = $VersionJson.version
    } else {
        $Version = "0.7.3"
    }
}

# Detect platform if not specified
if (-not $Platform) {
    $Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($Arch) {
        "X64"   { $Platform = "linux/amd64" }
        "Arm64" { $Platform = "linux/arm64" }
        default { $Platform = "linux/amd64" }
    }
}

# =============================================================================
# Functions
# =============================================================================

function Write-Banner {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║           Slime Arena Docker Build Script v$Version           ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Test-Docker {
    try {
        $null = docker info 2>&1
        Write-Host "Docker is ready" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Error: Docker is not running or not installed" -ForegroundColor Red
        return $false
    }
}

function Build-Monolith {
    Write-Host "Building Monolith container..." -ForegroundColor Yellow

    $Tag = "$Registry/slime-arena-monolith:$Version"
    $LatestTag = "$Registry/slime-arena-monolith:latest"
    $Dockerfile = "docker/monolith-full.Dockerfile"

    Push-Location $ProjectRoot
    try {
        docker build `
            --platform $Platform `
            -f $Dockerfile `
            -t $Tag `
            -t $LatestTag `
            .

        if ($LASTEXITCODE -ne 0) { throw "Build failed" }

        if ($Push) {
            Write-Host "Pushing to registry..." -ForegroundColor Yellow
            docker push $Tag
            docker push $LatestTag
        }

        Write-Host "Monolith build complete: $Tag" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

function Build-AppDb {
    Write-Host "Building App + DB containers..." -ForegroundColor Yellow

    $AppTag = "$Registry/bonk-race-app:$Version"
    $DbTag = "$Registry/bonk-race-db:$Version"

    Push-Location $ProjectRoot
    try {
        # Build DB
        Write-Host "Building DB container..." -ForegroundColor Cyan
        docker build `
            --platform $Platform `
            -f docker/db.Dockerfile `
            -t $DbTag `
            -t "$Registry/bonk-race-db:latest" `
            .

        if ($LASTEXITCODE -ne 0) { throw "DB build failed" }

        # Build App
        Write-Host "Building App container..." -ForegroundColor Cyan
        docker build `
            --platform $Platform `
            -f docker/app.Dockerfile `
            -t $AppTag `
            -t "$Registry/bonk-race-app:latest" `
            .

        if ($LASTEXITCODE -ne 0) { throw "App build failed" }

        if ($Push) {
            Write-Host "Pushing to registry..." -ForegroundColor Yellow
            docker push $AppTag
            docker push "$Registry/bonk-race-app:latest"
            docker push $DbTag
            docker push "$Registry/bonk-race-db:latest"
        }

        Write-Host "App + DB build complete" -ForegroundColor Green
        Write-Host "  App: $AppTag"
        Write-Host "  DB:  $DbTag"
    } finally {
        Pop-Location
    }
}

function Build-DbOnly {
    Write-Host "Building DB-only container..." -ForegroundColor Yellow

    $Tag = "$Registry/bonk-race-db:$Version"

    Push-Location $ProjectRoot
    try {
        docker build `
            --platform $Platform `
            -f docker/db.Dockerfile `
            -t $Tag `
            -t "$Registry/bonk-race-db:latest" `
            .

        if ($LASTEXITCODE -ne 0) { throw "Build failed" }

        if ($Push) {
            docker push $Tag
            docker push "$Registry/bonk-race-db:latest"
        }

        Write-Host "DB build complete: $Tag" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

function Invoke-SeedData {
    Write-Host "Seeding initial data..." -ForegroundColor Yellow

    $SeedFile = Join-Path $ScriptDir "seed-data.sql"
    if (-not (Test-Path $SeedFile)) {
        Write-Host "Error: seed-data.sql not found" -ForegroundColor Red
        return
    }

    Write-Host "Waiting for database to be ready..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5

    Get-Content $SeedFile | docker exec -i slime-arena-postgres psql -U slime -d slime_arena

    Write-Host "Data seeding complete" -ForegroundColor Green
}

# =============================================================================
# Main
# =============================================================================

Write-Banner

Write-Host "Build Mode:     $Mode" -ForegroundColor Cyan
Write-Host "Version:        $Version" -ForegroundColor Cyan
Write-Host "Registry:       $Registry" -ForegroundColor Cyan
Write-Host "Platform:       $Platform" -ForegroundColor Cyan
Write-Host "Push:           $Push" -ForegroundColor Cyan
Write-Host "Seed:           $Seed" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Docker)) {
    exit 1
}

switch ($Mode) {
    "monolith" { Build-Monolith }
    "app-db"   { Build-AppDb }
    "db-only"  { Build-DbOnly }
}

if ($Seed) {
    Invoke-SeedData
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    Build completed!                           ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "To run the container:" -ForegroundColor Yellow
switch ($Mode) {
    "monolith" { Write-Host "  docker-compose -f docker/docker-compose.monolith-full.yml up" }
    "app-db"   { Write-Host "  docker-compose -f docker/docker-compose.app-db.yml up" }
    "db-only"  { Write-Host "  docker-compose -f docker/docker-compose-db-only.yml up" }
}
