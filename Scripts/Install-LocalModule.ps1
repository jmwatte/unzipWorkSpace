# Installs the UnzipWorkspace module into the current user's PowerShell Modules directory
[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [string]$Name = 'UnzipWorkspace',
    [string]$SourcePath = (Join-Path $PSScriptRoot '..\Modules\UnzipWorkspace'),
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-UserModuleRoot {
    $docs = [Environment]::GetFolderPath('MyDocuments')
    $psRoot  = Join-Path $docs 'PowerShell\Modules'
    $winRoot = Join-Path $docs 'WindowsPowerShell\Modules'
    if (-not (Test-Path $psRoot) -and -not (Test-Path $winRoot)) {
        # Prefer modern path
        New-Item -ItemType Directory -Path $psRoot -Force | Out-Null
    }
    return (Test-Path $psRoot) ? $psRoot : $winRoot
}

$src = Resolve-Path -LiteralPath $SourcePath
if (-not (Test-Path -LiteralPath $src)) { throw "SourcePath not found: $SourcePath" }
if (-not (Test-Path -LiteralPath (Join-Path $src 'UnzipWorkspace.psd1'))) {
    throw "Expected module manifest not found in: $src"
}

$destRoot = Get-UserModuleRoot
$destPath = Join-Path $destRoot $Name

if (Test-Path -LiteralPath $destPath) {
    if ($Force) {
        if ($PSCmdlet.ShouldProcess($destPath, 'Remove existing module folder')) {
            Remove-Item -LiteralPath $destPath -Recurse -Force
        }
    } else {
        Write-Verbose "Destination exists: $destPath (use -Force to overwrite)"
    }
}

if ($PSCmdlet.ShouldProcess($destPath, "Copy module from $src")) {
    New-Item -ItemType Directory -Path $destPath -Force | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $destPath -Recurse -Force
}

# Verify import by name
try {
    Import-Module $Name -Force -ErrorAction Stop
    Write-Host "Installed and imported module '$Name' from: $destPath" -ForegroundColor Green
}
catch {
    Write-Warning "Module copied to $destPath but failed to import by name: $($_.Exception.Message)"
}

@{ Name = $Name; InstalledTo = $destPath }
