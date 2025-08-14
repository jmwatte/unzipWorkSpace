# UnzipWorkspace PowerShell module

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-BatchUnzip {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [string[]]$Files,
        [string]$ListPath,
        [string]$DestinationRoot,
        [string]$ExtractorScriptPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'Scripts\unziping.ps1')
    )

    # Collect all inputs
    $all = @()
    if ($Files)    { $all += $Files }
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

    function Get-ArchiveBaseName([string]$p) {
        $file = [IO.Path]::GetFileName($p)
        if ($file -match '\.tar\.(gz|bz2|xz)$') { return ($file -replace '\.tar\.(gz|bz2|xz)$','') }
        return [IO.Path]::GetFileNameWithoutExtension($file)
    }

    if (-not (Test-Path -LiteralPath $ExtractorScriptPath)) {
        throw "Required extractor not found: $ExtractorScriptPath"
    }

    $results = @()
    foreach ($f in $all) {
        $exists = Test-Path -LiteralPath $f
        $name = Get-ArchiveBaseName $f
        $dest = Join-Path $DestinationRoot $name
        if ($PSCmdlet.ShouldProcess($dest, 'Create per-archive destination')) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        }

        $status = 'FAILED'
        try {
            if (-not $exists) {
                $status = 'NOT FOUND'
            } else {
                # Pass through WhatIf/Verbose if specified
                $splat = @{ SourcePath = $f; DestinationPath = $dest }
                if ($PSBoundParameters.ContainsKey('WhatIf')) { $splat['WhatIf'] = $true }
                if ($PSBoundParameters.ContainsKey('Verbose')) { $splat['Verbose'] = $true }
                & $ExtractorScriptPath @splat | Out-Null
                # We don't try to count files here; leave success to extractor
                $status = 'OK'
            }
        }
        catch {
            Write-Warning ("Extraction error for {0}: {1}" -f $f, $_.Exception.Message)
            $status = 'FAILED'
        }
        $results += [pscustomobject]@{ File=$f; Exists=$exists; Dest=$dest; Status=$status }
    }

    return $results
}

function Expand-GzipFiles {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [System.IO.FileInfo[]]$InputObject,

        [Parameter(Mandatory = $false)]
        [switch]$KeepOriginal
    )

    begin {
        try { Add-Type -AssemblyName System.IO.Compression | Out-Null } catch {}
    }
    process {
        foreach ($gzFile in $InputObject) {
            if ($gzFile.Extension -ne '.gz') { continue }

            $outPath = [IO.Path]::Combine($gzFile.DirectoryName, [IO.Path]::GetFileNameWithoutExtension($gzFile.Name))
            if (Test-Path -LiteralPath $outPath) {
                # Overwrite silently to allow automation; callers can pre-clean or handle as needed
                Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
            }
            try {
                $src = [IO.File]::OpenRead($gzFile.FullName)
                try {
                    $gz  = New-Object IO.Compression.GZipStream($src, [IO.Compression.CompressionMode]::Decompress)
                    try {
                        $dst = [IO.File]::Create($outPath)
                        try { $gz.CopyTo($dst) } finally { $dst.Close() }
                    } finally { $gz.Close() }
                } finally { $src.Close() }

                if (-not $KeepOriginal) { Remove-Item -LiteralPath $gzFile.FullName -Force }
                [pscustomobject]@{ Path=$outPath; From=$gzFile.FullName; KeptOriginal=$KeepOriginal.IsPresent }
            }
            catch {
                Write-Error ("Failed to decompress {0}: {1}" -f $gzFile.FullName, $_.Exception.Message)
            }
        }
    }
}

Export-ModuleMember -Function Invoke-BatchUnzip, Expand-GzipFiles
