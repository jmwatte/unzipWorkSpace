<#
.SYNOPSIS
    Decompresses .gz files from pipeline input
.DESCRIPTION
    Accepts file objects from Get-ChildItem pipeline and decompresses all .gz files found.
    Removes the original .gz files after successful decompression.
.PARAMETER InputObject
    File objects from pipeline (typically from Get-ChildItem)
.PARAMETER KeepOriginal
    Keep the original .gz files after decompression (don't delete them)
.EXAMPLE
    Get-ChildItem -Path "C:\Music" -Filter "*.gz" -Recurse | .\Expand-GzipFiles.ps1
.EXAMPLE
    Get-ChildItem -Path "C:\Music" -Filter "*.gz" -Recurse | .\Expand-GzipFiles.ps1 -KeepOriginal
.EXAMPLE
    ls *.gz | .\Expand-GzipFiles.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
    [System.IO.FileInfo[]]$InputObject,
    
    [Parameter(Mandatory = $false)]
    [switch]$KeepOriginal
)

begin {
    Write-Host "Gzip File Decompressor" -ForegroundColor Cyan
    Write-Host "=====================" -ForegroundColor Cyan
    
    $processedCount = 0
    $successCount = 0
    $errorCount = 0
    
    # Load System.IO.Compression assembly if not already loaded
    try {
        Add-Type -AssemblyName System.IO.Compression
        Write-Host "✓ System.IO.Compression assembly loaded" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to load compression assembly: $($_.Exception.Message)" -ForegroundColor Red
        return
    }
}

process {
    foreach ($gzFile in $InputObject) {
        # Skip if not a .gz file
        if ($gzFile.Extension -ne ".gz") {
            Write-Host "⚠️ Skipping non-gz file: $($gzFile.Name)" -ForegroundColor Yellow
            continue
        }
        
        $processedCount++
        Write-Host "`nProcessing: $($gzFile.FullName)" -ForegroundColor Cyan
        
        try {
            # Construct the output filename by removing the .gz extension
            $outputFilePath = [System.IO.Path]::Combine($gzFile.DirectoryName, [System.IO.Path]::GetFileNameWithoutExtension($gzFile.Name))
            
            # Check if output file already exists
            if (Test-Path $outputFilePath) {
                Write-Host "⚠️ Output file already exists: $outputFilePath" -ForegroundColor Yellow
                $choice = Read-Host "Overwrite? (y/N)"
                if ($choice -ne 'y' -and $choice -ne 'Y') {
                    Write-Host "⏭️ Skipped: $($gzFile.Name)" -ForegroundColor Gray
                    continue
                }
            }
            
            # Use a .NET stream to decompress the file
            $sourceStream = [System.IO.File]::OpenRead($gzFile.FullName)
            $gzipStream = New-Object System.IO.Compression.GZipStream($sourceStream, [System.IO.Compression.CompressionMode]::Decompress)
            $destinationStream = [System.IO.File]::Create($outputFilePath)
            
            # Copy the decompressed data
            $gzipStream.CopyTo($destinationStream)
            
            # Close the streams
            $gzipStream.Close()
            $sourceStream.Close()
            $destinationStream.Close()
            
            # Verify the output file was created and has content
            if (Test-Path $outputFilePath) {
                $outputSize = (Get-Item $outputFilePath).Length
                if ($outputSize -gt 0) {
                    Write-Host "✓ Decompressed successfully to: $outputFilePath" -ForegroundColor Green
                    Write-Host "  Original size: $($gzFile.Length) bytes, Decompressed size: $outputSize bytes" -ForegroundColor Gray
                    
                    # Delete the original .gz file after successful decompression (unless KeepOriginal is specified)
                    if (-not $KeepOriginal) {
                        Remove-Item -Path $gzFile.FullName -Force
                        Write-Host "  🗑️ Removed original .gz file" -ForegroundColor Gray
                    }
                    
                    $successCount++
                }
                else {
                    Write-Host "✗ Decompressed file is empty: $outputFilePath" -ForegroundColor Red
                    Remove-Item -Path $outputFilePath -Force -ErrorAction SilentlyContinue
                    $errorCount++
                }
            }
            else {
                Write-Host "✗ Failed to create output file: $outputFilePath" -ForegroundColor Red
                $errorCount++
            }
        }
        catch {
            Write-Host "✗ Error decompressing $($gzFile.Name): $($_.Exception.Message)" -ForegroundColor Red
            $errorCount++
            
            # Clean up any partially created files
            if (Test-Path $outputFilePath) {
                Remove-Item -Path $outputFilePath -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

end {
    Write-Host "`n" -NoNewline
    Write-Host "Decompression Summary" -ForegroundColor Cyan
    Write-Host "====================" -ForegroundColor Cyan
    Write-Host "📁 Files processed: $processedCount" -ForegroundColor Gray
    Write-Host "✓ Successfully decompressed: $successCount" -ForegroundColor Green
    if ($errorCount -gt 0) {
        Write-Host "✗ Errors: $errorCount" -ForegroundColor Red
    }
    
    if ($successCount -gt 0) {
        Write-Host "`n🎉 Decompression completed!" -ForegroundColor Green
        if (-not $KeepOriginal) {
            Write-Host "💡 Original .gz files have been removed" -ForegroundColor Yellow
        }
        else {
            Write-Host "💡 Original .gz files have been preserved" -ForegroundColor Yellow
        }
    }
}
