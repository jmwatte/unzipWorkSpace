<#
.SYNOPSIS
    Batch-extract multiple archives into a temp or chosen destination using unziping.ps1.
.DESCRIPTION
    - Accepts a list of file paths via -Files or -ListPath (one per line).
    - Creates a per-archive subfolder under DestinationRoot.
    - Uses Scripts\unziping.ps1 for robust extraction.
    - Summarizes results (OK/FAILED/NOT FOUND).
.PARAMETER Files
    Array of archive file paths to extract.
.PARAMETER ListPath
    Text file with one archive path per line.
.PARAMETER DestinationRoot
    Root directory to extract into. Defaults to %TEMP%\unz-batch-<timestamp>.
.PARAMETER Verbose
    Show detailed output.
.PARAMETER WhatIf
    Preview actions without changes.
.EXAMPLE
    .\BatchUnzip.ps1 -Files @('I:\A.tar.gz','I:\B.zip')
.EXAMPLE
    .\BatchUnzip.ps1 -ListPath .\archives.txt -DestinationRoot D:\Extracted -Verbose
.EXAMPLE
    # Pipe per-file to unziping.ps1
    Get-ChildItem -Path . -Filter *.gz -File | ForEach-Object {
        & .\Scripts\unziping.ps1 -SourcePath $_.FullName -DestinationPath "$env:TEMP\unz" -Verbose
    }
.EXAMPLE
    # Use BatchUnzip with a collected list
    & .\Scripts\BatchUnzip.ps1 -Files (Get-ChildItem -Path . -Filter *.gz -File | Select-Object -Expand FullName) -Verbose
.EXAMPLE
    # Search recursively and include multiple types
    & .\Scripts\BatchUnzip.ps1 -Files (Get-ChildItem -Path I:\ -Recurse -File -Include *.tar.gz,*.tgz,*.zip,*.gz | Select-Object -Expand FullName)
#>
[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [string[]]$Files,
    [string]$ListPath,
    [string]$DestinationRoot
)

$ErrorActionPreference = 'Stop'

# Resolve input list
$all = @()
if ($Files) { $all += $Files }
if ($ListPath) {
    if (-not (Test-Path -LiteralPath $ListPath)) { throw "ListPath not found: $ListPath" }
    $list = Get-Content -LiteralPath $ListPath | Where-Object { $_ -and $_.Trim() -ne '' }
    $all += $list
}
if (-not $all -or $all.Count -eq 0) { throw 'No input files provided. Use -Files or -ListPath.' }

# Destination root
if (-not $DestinationRoot) {
    $DestinationRoot = Join-Path $env:TEMP ("unz-batch-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
if ($PSCmdlet.ShouldProcess($DestinationRoot, 'Create destination root')) {
    New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
}

# Helper: compute subfolder name (handle .tar.gz, etc.)
function Get-ArchiveBaseName([string]$p) {
    $file = [IO.Path]::GetFileName($p)
    if ($file -match '\\.tar\\.(gz|bz2|xz)$') { return ($file -replace '\\.tar\\.(gz|bz2|xz)$','') }
    return [IO.Path]::GetFileNameWithoutExtension($file)
}

$scriptPath = Join-Path $PSScriptRoot 'unziping.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Required script not found: $scriptPath" }

$results = @()
foreach ($f in $all) {
    $exists = Test-Path -LiteralPath $f
    $name = Get-ArchiveBaseName $f
    $dest = Join-Path $DestinationRoot $name
    if ($PSCmdlet.ShouldProcess($dest, 'Create per-archive destination')) {
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
    }

    $before = @(Get-ChildItem -LiteralPath $dest -Recurse -File -ErrorAction SilentlyContinue).Count
    $status = 'FAILED'
    try {
        if (-not $exists) {
            $status = 'NOT FOUND'
        } else {
            # Invoke robust extractor with WhatIf/Verbose pass-through (common parameters)
            & $scriptPath -SourcePath $f -DestinationPath $dest @PSBoundParameters | Out-Null
            $after = @(Get-ChildItem -LiteralPath $dest -Recurse -File -ErrorAction SilentlyContinue).Count
            $added = [int]($after - $before)
            if ($added -gt 0) { $status = 'OK' } else { $status = 'FAILED' }
        }
    }
    catch {
        Write-Warning ("Extraction error for {0}: {1}" -f $f, $_.Exception.Message)
        $status = 'FAILED'
    }
    $results += [pscustomobject]@{ File=$f; Exists=$exists; Dest=$dest; Status=$status }
}

Write-Host ("=== Extraction Results (root: {0}) ===" -f $DestinationRoot) -ForegroundColor Cyan
foreach ($r in $results) {
    $color = switch ($r.Status) { 'OK' {'Green'} 'NOT FOUND' {'Yellow'} default {'Red'} }
    Write-Host ("* {0} -> {1} : {2}" -f $r.File, $r.Dest, $r.Status) -ForegroundColor $color
}
