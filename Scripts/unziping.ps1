<#
.SYNOPSIS
    Robust universal archive extractor with tar/7-Zip support and nested decompression.
.DESCRIPTION
    - Uses safe argument handling (array args) and robust error/encoding handling.
    - Supports: .zip, .rar, .7z, .tar, .gz, .bz2, .xz, .tar.gz, .tar.bz2, .tar.xz, .tgz, .tbz2, .txz
    - Tries native tar first for tar-based archives, falls back to 7-Zip.
    - For .zip uses Expand-Archive; for single-file .gz uses GZipStream.
    - Loops to decompress nested .gz/.zip files under the extraction root.
    - Honors -WhatIf and -Verbose; returns consistent results.
.PARAMETER SourcePath
    The path to a compressed file or a directory containing compressed files.
.PARAMETER DestinationPath
    Destination directory for extraction (defaults to the source's directory).
.PARAMETER Recursive
    When SourcePath is a directory, search subdirectories recursively.
.EXAMPLE
    .\unziping.ps1 -SourcePath "C:\file.zip" -DestinationPath "C:\Out"
.EXAMPLE
    .\unziping.ps1 -SourcePath "C:\Archives" -Recursive -Verbose
#>

[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [Parameter(Mandatory=$false)]
    [string]$SourcePath,

    [Parameter(Mandatory=$false)]
    [string]$DestinationPath,

    [Parameter(Mandatory=$false)]
    [switch]$Recursive
)

#Requires -Version 5.0

$SupportedExtensions = @(
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
    '.tar.gz', '.tar.bz2', '.tar.xz', '.tgz', '.tbz2', '.txz'
)

function Use-LongPath {
    param([string]$Path)
    if (-not $Path) { return $Path }
    if ($Path -match '^[a-zA-Z]:\\' -and $Path.Length -ge 248) {
        return "\\\\?\$Path"
    }
    return $Path
}

function Test-7ZipInstalled {
    $candidates = @(
        "$env:ProgramFiles\7-Zip\7z.exe",
        "$env:ProgramFiles(x86)\7-Zip\7z.exe",
        "$env:ProgramW6432\7-Zip\7z.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    try { $null = Get-Command 7z -ErrorAction Stop; return '7z' } catch { return $null }
}

function Read-FileBestEffortUtf8 {
    param([string]$TempFile)
    if (-not (Test-Path $TempFile)) { return '' }
    try {
        # Try raw bytes -> UTF8 first
        $bytes = [System.IO.File]::ReadAllBytes($TempFile)
        if ($bytes.Length -eq 0) { return '' }
        $utf8 = [System.Text.Encoding]::UTF8.GetString($bytes)
        return $utf8
    } catch {
        try { return Get-Content -LiteralPath $TempFile -Raw } catch { return '' }
    }
}

function Invoke-External {
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][string]$Exe,
        [Parameter(Mandatory)][string[]]$Args
    )
    $out = [System.IO.Path]::GetTempFileName()
    $err = [System.IO.Path]::GetTempFileName()
    try {
        Write-Verbose ("Invoking: {0} {1}" -f $Exe, ($Args -join ' '))
        $p = Start-Process -FilePath $Exe -ArgumentList $Args -Wait -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
        $stdout = Read-FileBestEffortUtf8 -TempFile $out
        $stderr = Read-FileBestEffortUtf8 -TempFile $err
        return @{ ExitCode = $p.ExitCode; Stdout = $stdout; Stderr = $stderr }
    }
    finally {
        Remove-Item $out,$err -ErrorAction SilentlyContinue
    }
}

function Get-DirectorySnapshot {
    param([string]$Root)
    if (-not (Test-Path -LiteralPath $Root)) { return @{} }
    $map = @{}
    Get-ChildItem -LiteralPath $Root -Recurse -File -Force | ForEach-Object {
        $map[$_.FullName] = $true
    }
    return $map
}

function Get-NewFilesSince {
    param(
        [string]$Root,
        [hashtable]$Before
    )
    if (-not (Test-Path -LiteralPath $Root)) { return @() }
    $added = @()
    Get-ChildItem -LiteralPath $Root -Recurse -File -Force | ForEach-Object {
        if (-not $Before.ContainsKey($_.FullName)) { $added += $_.FullName }
    }
    return $added
}

function Get-CompressionFlagForTar {
    param([string]$FilePath)
    if ($FilePath -match '\\.(tar\\.gz|tgz)$') { return '-z' }
    if ($FilePath -match '\\.(tar\\.bz2|tbz2)$') { return '-j' }
    if ($FilePath -match '\\.(tar\\.xz|txz)$') { return '-J' }
    return ''
}

function Expand-GZipSingleFile {
    [OutputType([hashtable])]
    param(
        [string]$FilePath,
        [string]$DestinationPath
    )
    $destFile = Join-Path $DestinationPath ([System.IO.Path]::GetFileNameWithoutExtension($FilePath))
    if ($PSCmdlet.ShouldProcess($FilePath, "Decompress to $destFile")) {
        try {
            $in = [System.IO.File]::OpenRead($FilePath)
            try {
                $gz = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
                $out = [System.IO.File]::Create($destFile)
                try { $gz.CopyTo($out) } finally { $out.Dispose() }
                $gz.Dispose()
            } finally { $in.Dispose() }
            # Preserve timestamps
            try { (Get-Item $destFile).LastWriteTime = (Get-Item $FilePath).LastWriteTime } catch {}
            return @{ Success=$true; ExtractedFiles=@($destFile) }
        }
        catch {
            Write-Error ("GZip decompress failed: {0}" -f $_.Exception.Message)
            return @{ Success=$false; ExtractedFiles=@() }
        }
    }
}

function Extract-WithTar {
    [OutputType([hashtable])]
    param(
        [string]$FilePath,
        [string]$DestinationPath
    )
    if ($WhatIfPreference) { return @{ Success=$true; ExtractedFiles=@() } }
    $compression = Get-CompressionFlagForTar -FilePath $FilePath

    # Optional integrity test
    $testArgs = @('-t')
    if ($compression) { $testArgs += $compression }
    $testArgs += @('-f', $FilePath)
    $test = Invoke-External -Exe 'tar' -Args $testArgs
    if ($test.ExitCode -ne 0) {
        Write-Warning "tar integrity test failed (code $($test.ExitCode))."
        if ($test.Stderr) { Write-Verbose $test.Stderr }
        return @{ Success=$false; ExtractedFiles=@(); Reason='TarTestFailed' }
    }

    # Snapshot and extract
    $before = Get-DirectorySnapshot -Root $DestinationPath
    $args = @('-x')
    if ($compression) { $args += $compression }
    $args += @('-f', $FilePath, '-C', $DestinationPath, '-v')
    $res = Invoke-External -Exe 'tar' -Args $args
    if ($res.ExitCode -ne 0) {
        Write-Error "tar extraction failed with code $($res.ExitCode)"
        if ($res.Stderr) { Write-Verbose $res.Stderr }
        return @{ Success=$false; ExtractedFiles=@(); Reason='TarExtractFailed' }
    }
    $newFiles = Get-NewFilesSince -Root $DestinationPath -Before $before
    return @{ Success=$true; ExtractedFiles=$newFiles }
}

function Extract-With7Zip {
    [OutputType([hashtable])]
    param(
        [string]$SevenZipExe,
        [string]$FilePath,
        [string]$DestinationPath
    )
    if ($WhatIfPreference) { return @{ Success=$true; ExtractedFiles=@() } }
    $before = Get-DirectorySnapshot -Root $DestinationPath
    $args = @('x', $FilePath, "-o$DestinationPath", '-y', '-aoa', '-bb1', '-sccUTF-8')
    $res = Invoke-External -Exe $SevenZipExe -Args $args
    if ($res.ExitCode -notin 0,1) {
        Write-Error "7-Zip extraction failed with code $($res.ExitCode)"
        if ($res.Stderr) { Write-Verbose $res.Stderr }
        return @{ Success=$false; ExtractedFiles=@() }
    }
    if ($res.ExitCode -eq 1) {
        Write-Warning "7-Zip reported warnings during extraction."
    }
    $newFiles = Get-NewFilesSince -Root $DestinationPath -Before $before
    return @{ Success=$true; ExtractedFiles=$newFiles }
}

function Extract-Archive {
    [OutputType([hashtable])]
    param(
        [string]$FilePath,
        [string]$DestinationPath,
        [switch]$WhatIf
    )

    $FilePath = Use-LongPath $FilePath
    $DestinationPath = Use-LongPath $DestinationPath
    if (-not (Test-Path -LiteralPath $DestinationPath)) {
        if ($PSCmdlet.ShouldProcess($DestinationPath, 'Create directory')) {
            New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
        }
    }

    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    $base = $FilePath.ToLower()

    # Normalize tar family detection
    $isTarFamily = ($base -match '\\.(tar\\.(gz|bz2|xz))$') -or ($ext -in '.tar','.tgz','.tbz2','.txz')

    if ($PSCmdlet.ShouldProcess($FilePath, "Extract to $DestinationPath")) {
        try {
            if ($ext -eq '.zip') {
                $before = Get-DirectorySnapshot -Root $DestinationPath
                Expand-Archive -Path $FilePath -DestinationPath $DestinationPath -Force
                $newFiles = Get-NewFilesSince -Root $DestinationPath -Before $before
                return @{ Success=$true; ExtractedFiles=$newFiles }
            }
            elseif ($isTarFamily) {
                $tarResult = Extract-WithTar -FilePath $FilePath -DestinationPath $DestinationPath
                if (-not $tarResult.Success -and $tarResult.Reason -eq 'TarTestFailed') {
                    $seven = Test-7ZipInstalled
                    if ($seven) {
                        Write-Verbose 'Falling back to 7-Zip for tar archive.'
                        return Extract-With7Zip -SevenZipExe $seven -FilePath $FilePath -DestinationPath $DestinationPath
                    }
                }
                return $tarResult
            }
            elseif ($ext -eq '.gz' -and ($base -notmatch '\\.tar\\.gz$')) {
                return Expand-GZipSingleFile -FilePath $FilePath -DestinationPath $DestinationPath
            }
            else {
                $seven = Test-7ZipInstalled
                if ($seven) {
                    return Extract-With7Zip -SevenZipExe $seven -FilePath $FilePath -DestinationPath $DestinationPath
                } else {
                    Write-Error '7-Zip not installed; cannot extract this format.'
                    return @{ Success=$false; ExtractedFiles=@() }
                }
            }
        }
        catch {
            Write-Error ("Extraction error: {0}" -f $_.Exception.Message)
            return @{ Success=$false; ExtractedFiles=@() }
        }
    }
}

function Decompress-Nested {
    param(
        [string]$Root,
        [switch]$WhatIf,
        [int]$MaxPasses = 3
    )
    for ($pass=1; $pass -le $MaxPasses; $pass++) {
        $nested = Get-ChildItem -LiteralPath $Root -Recurse -File -Include *.gz,*.zip -ErrorAction SilentlyContinue
        if (-not $nested -or $nested.Count -eq 0) {
            Write-Verbose "No nested files found to decompress (pass $pass)."
            break
        }
    Write-Verbose "Nested decompress pass ${pass}: found $($nested.Count) candidates."
        foreach ($n in $nested) {
            try {
                if ($n.Extension -ieq '.gz') {
                    $res = Expand-GZipSingleFile -FilePath $n.FullName -DestinationPath $n.DirectoryName -WhatIf:$WhatIf
                    if ($res.Success -and -not $WhatIf) { Remove-Item -LiteralPath $n.FullName -Force -ErrorAction SilentlyContinue }
                }
                elseif ($n.Extension -ieq '.zip') {
                    if ($PSCmdlet.ShouldProcess($n.FullName, "Expand nested zip")) {
                        if (-not $WhatIf) {
                            $dest = Join-Path $n.DirectoryName ([IO.Path]::GetFileNameWithoutExtension($n.Name))
                            New-Item -ItemType Directory -Path $dest -Force | Out-Null
                            Expand-Archive -Path $n.FullName -DestinationPath $dest -Force
                            Remove-Item -LiteralPath $n.FullName -Force -ErrorAction SilentlyContinue
                        }
                    }
                }
            }
            catch {
                Write-Warning ("Nested decompress failed for {0}: {1}" -f $n.FullName, $_.Exception.Message)
            }
        }
    }
}

# Main
if (-not $SourcePath) {
    Write-Host "Usage: .\\unziping.ps1 -SourcePath <file|folder> [-DestinationPath <folder>] [-Recursive] [-WhatIf]" -ForegroundColor Cyan
    exit 1
}

$SourcePath = (Resolve-Path -LiteralPath $SourcePath -ErrorAction SilentlyContinue)?.Path ?? $SourcePath
if (-not (Test-Path -LiteralPath $SourcePath)) {
    Write-Error "SourcePath not found: $SourcePath"
    exit 1
}

if (-not $DestinationPath) {
    if (Test-Path -LiteralPath $SourcePath -PathType Leaf) {
        $DestinationPath = Split-Path -Parent $SourcePath
    } else {
        $DestinationPath = $SourcePath
    }
}

$DestinationPath = Use-LongPath $DestinationPath
if (-not (Test-Path -LiteralPath $DestinationPath)) {
    if ($PSCmdlet.ShouldProcess($DestinationPath, 'Create destination')) {
        if (-not $WhatIf) { New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null }
    }
}

$successCount = 0; $failCount = 0
$successFiles = @(); $failedFiles = @(); $allExtracted = @()

if (Test-Path -LiteralPath $SourcePath -PathType Leaf) {
    $res = Extract-Archive -FilePath $SourcePath -DestinationPath $DestinationPath
    if ($res.Success) { $successCount++; $successFiles += $SourcePath; $allExtracted += $res.ExtractedFiles }
    else { $failCount++; $failedFiles += $SourcePath }
    if ($res.Success) { Write-Host ("✓ Successfully extracted: {0}" -f (Split-Path $SourcePath -Leaf)) -ForegroundColor Green }
    else { Write-Host ("✗ Extraction failed: {0}" -f (Split-Path $SourcePath -Leaf)) -ForegroundColor Red }
    if ($res.Success) { Decompress-Nested -Root $DestinationPath }
}
else {
    $opt = if ($Recursive) { 'AllDirectories' } else { 'TopDirectoryOnly' }
    $pattern = ($SupportedExtensions | ForEach-Object { '*'+$_ })
    $files = Get-ChildItem -LiteralPath $SourcePath -Recurse:([bool]$Recursive) -File -ErrorAction SilentlyContinue |
             Where-Object { $SupportedExtensions -contains ([IO.Path]::GetExtension($_.FullName).ToLower()) }

    foreach ($f in $files) {
    $res = Extract-Archive -FilePath $f.FullName -DestinationPath $DestinationPath
        if ($res.Success) { $successCount++; $successFiles += $f.FullName; $allExtracted += $res.ExtractedFiles }
        else { $failCount++; $failedFiles += $f.FullName }
        if ($res.Success) { Write-Host ("✓ Successfully extracted: {0}" -f $f.Name) -ForegroundColor Green }
        else { Write-Host ("✗ Extraction failed: {0}" -f $f.Name) -ForegroundColor Red }
    }
    if ($successCount -gt 0) { Decompress-Nested -Root $DestinationPath }
}

# Summary
Write-Host ""; Write-Host ("Extraction Summary: {0} succeeded, {1} failed" -f $successCount, $failCount) -ForegroundColor Cyan
if ($successFiles.Count -gt 0) { Write-Verbose ("Succeeded: `n{0}" -f ($successFiles -join "`n")) }
if ($failedFiles.Count -gt 0)  { Write-Verbose ("Failed: `n{0}" -f ($failedFiles -join "`n")) }
