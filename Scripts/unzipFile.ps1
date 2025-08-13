<#
.SYNOPSIS
    Universal Compressed File Extractor
.DESCRIPTION
    Extracts compressed files from a specified location (file or folder) to a destination folder.
    Supports multiple compression formats and preserves directory structure.
    Can process individual files or recursively scan folders for compressed files.
.PARAMETER SourcePath
    The path to the compressed file or folder containing compressed files
.PARAMETER DestinationPath
    The destination folder where files will be extracted
.PARAMETER Recu            # Smart suggestion for compressed files
            if ($compressedFileCount -gt 0) {
                Write-Host "`n💡 Extracted folder contains compressed files!" -ForegroundColor Magenta
                
                if ($foldersWithCompressedFiles.Count -gt 0) {
                    foreach ($folder in $foldersWithCompressedFiles) {
                        $folderPath = Join-Path $DestinationPath $folder
                        Write-Host "📁 To extract all compressed files in '$folder':" -ForegroundColor Yellow
                        Write-Host "   .\unzipFile.ps1 -SourcePath `"$folderPath`" -Recursive" -ForegroundColor Cyan
					}
					catch {
						Write-Host "✗ Error extracting $FilePath : $($_.Exception.Message)" -ForegroundColor Red
						return @{
							Success        = $false
							ExtractedFiles = @()
						}
					}
                } else {
                    Write-Host "📁 To extract all compressed files:" -ForegroundColor Yellow
                    Write-Host "   .\unzipFile.ps1 -SourcePath `"$DestinationPath`" -Recursive" -ForegroundColor Cyan
                }
            } processing folders, recursively search subdirectories for compressed files
.EXAMPLE
    .\unzipFile.ps1 -SourcePath "C:\Archives\file.zip" -DestinationPath "C:\Extracted"
.EXAMPLE
    .\unzipFile.ps1 -SourcePath "C:\Archives" -DestinationPath "C:\Extracted" -Recursive
#>

param(
	[Parameter(Mandatory = $false)]
	[string]$SourcePath,
    
	[Parameter(Mandatory = $false)]
	[string]$DestinationPath,
    
	[Parameter(Mandatory = $false)]
	[switch]$Recursive,
    
	[Parameter(Mandatory = $false)]
	[switch]$WhatIf
)

# Requires PowerShell 5.0 or later
#Requires -Version 5.0

# Supported compressed file extensions
$SupportedExtensions = @('.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tgz', '.tbz2', '.txz')

function Show-Help {
	Write-Host @"
Universal Compressed File Extractor

Usage:
    .\unzipFile.ps1 [-SourcePath <path>] [-DestinationPath <path>] [-Recursive] [-WhatIf]

Parameters:
    -SourcePath      : Path to compressed file or folder containing compressed files
    -DestinationPath : Destination folder for extracted files (optional - defaults to source location)
    -Recursive       : Recursively search subfolders (when SourcePath is a folder)
    -WhatIf          : Preview what would be extracted without actually doing it

Supported formats: .zip, .rar, .7z, .tar, .gz, .bz2, .xz, .tar.gz, .tar.bz2, .tar.xz, .tgz, .tbz2, .txz

Examples:
    .\unzipFile.ps1 -SourcePath "C:\file.zip"                                    # Extracts to C:\
    .\unzipFile.ps1 -SourcePath "C:\file.zip" -DestinationPath "C:\Extracted"   # Extracts to C:\Extracted
    .\unzipFile.ps1 -SourcePath "C:\Archives" -Recursive                        # Extracts all to C:\Archives
    .\unzipFile.ps1 -SourcePath "C:\Archives" -DestinationPath "C:\Extracted" -WhatIf
"@ -ForegroundColor Cyan
}

function Test-7ZipInstalled {
	$7zipPaths = @(
		"${env:ProgramFiles}\7-Zip\7z.exe",
		"${env:ProgramFiles(x86)}\7-Zip\7z.exe",
		"${env:ProgramW6432}\7-Zip\7z.exe"
	)
    
	foreach ($path in $7zipPaths) {
		if (Test-Path $path) {
			return $path
		}
	}
    
	# Check if 7z is in PATH
	try {
		$null = Get-Command "7z" -ErrorAction Stop
		return "7z"
	}
	catch {
		return $null
	}
}

function Get-ArchiveContents {
	param(
		[string]$FilePath
	)
    
	$extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
	$contents = @()
    
	try {
		switch ($extension) {
			'.zip' {
				Add-Type -AssemblyName System.IO.Compression.FileSystem
				$archive = [System.IO.Compression.ZipFile]::OpenRead($FilePath)
				$contents = $archive.Entries | ForEach-Object {
					@{
						Name           = $_.FullName
						Size           = $_.Length
						CompressedSize = $_.CompressedLength
						IsDirectory    = $_.FullName.EndsWith('/')
					}
				}
				$archive.Dispose()
			}
            
			{ $_ -in @('.rar', '.7z', '.tar', '.bz2', '.xz', '.tgz', '.tbz2', '.txz') -or $FilePath -match '\.(tar\.(gz|bz2|xz))$' } {
				$7zipPath = Test-7ZipInstalled
				if ($7zipPath) {
					$arguments = "l `"$FilePath`""
					$process = Start-Process -FilePath $7zipPath -ArgumentList $arguments -Wait -NoNewWindow -PassThru -RedirectStandardOutput "temp_list.txt"
                    
					if ($process.ExitCode -eq 0 -and (Test-Path "temp_list.txt")) {
						$listOutput = Get-Content "temp_list.txt"
						Remove-Item "temp_list.txt" -ErrorAction SilentlyContinue
                        
						$inFileList = $false
						foreach ($line in $listOutput) {
							if ($line -match "^-+\s+-+\s+-+\s+-+\s+-+") {
								$inFileList = $true
								continue
							}
							if ($inFileList -and $line.Trim() -and $line -notmatch "^-+") {
								if ($line -match "^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+([D.])\w*\s+(\d+)\s+(\d*)\s+(.+)$") {
									$contents += @{
										Name           = $Matches[4].Trim()
										Size           = if ($Matches[2]) { [long]$Matches[2] } else { 0 }
										CompressedSize = if ($Matches[3]) { [long]$Matches[3] } else { 0 }
										IsDirectory    = $Matches[1] -eq 'D'
									}
								}
							}
						}
					}
				}
				else {
					$contents += @{
						Name           = "[Contents unavailable - 7-Zip not installed]"
						Size           = 0
						CompressedSize = 0
						IsDirectory    = $false
					}
				}
			}
            
			'.gz' {
				if ($FilePath -notmatch '\.tar\.gz$') {
					$fileName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
					$contents += @{
						Name           = $fileName
						Size           = (Get-Item $FilePath).Length
						CompressedSize = (Get-Item $FilePath).Length
						IsDirectory    = $false
					}
				}
			}
		}
	}
	catch {
		$contents += @{
			Name           = "[Error reading archive contents: $($_.Exception.Message)]"
			Size           = 0
			CompressedSize = 0
			IsDirectory    = $false
		}
	}
    
	return $contents
}

function Extract-Archive {
	param(
		[string]$FilePath,
		[string]$DestinationPath,
		[string]$RelativePath = "",
		[switch]$WhatIf
	)
    
	$extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
	$fileName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
    
	# Create destination subdirectory to preserve structure
	$extractPath = if ($RelativePath) {
		Join-Path $DestinationPath $RelativePath
	}
 else {
		$DestinationPath
	}
    
	if ($WhatIf) {
		Write-Host "WHAT IF: Would extract: $FilePath" -ForegroundColor Magenta
		Write-Host "WHAT IF: Would extract to: $extractPath" -ForegroundColor Magenta
        
		# Get and display archive contents
		$contents = Get-ArchiveContents -FilePath $FilePath
		if ($contents.Count -gt 0) {
			Write-Host "WHAT IF: Archive contents:" -ForegroundColor Magenta
			foreach ($item in $contents | Select-Object -First 10) {
				$sizeStr = if ($item.Size -gt 0) { " ({0:N0} bytes)" -f $item.Size } else { "" }
				$typeStr = if ($item.IsDirectory) { "[DIR]" } else { "[FILE]" }
				Write-Host "         $typeStr $($item.Name)$sizeStr" -ForegroundColor Gray
			}
			if ($contents.Count -gt 10) {
				Write-Host "         ... and $($contents.Count - 10) more items" -ForegroundColor Gray
			}
		}
        
		if (-not (Test-Path $extractPath)) {
			Write-Host "WHAT IF: Would create directory: $extractPath" -ForegroundColor Magenta
		}
		return @{
			Success        = $true
			ExtractedFiles = @()
		}
	}
    
	# Record timestamp before extraction
	$extractionStartTime = Get-Date
    
	if (-not (Test-Path $extractPath)) {
		New-Item -Path $extractPath -ItemType Directory -Force | Out-Null
	}
    
	Write-Host "Extracting: $FilePath" -ForegroundColor Yellow
	Write-Host "To: $extractPath" -ForegroundColor Gray
    
	try {
		switch ($extension) {
			'.zip' {
				Expand-Archive -Path $FilePath -DestinationPath $extractPath -Force
				Write-Host "✓ Successfully extracted ZIP file" -ForegroundColor Green
			}
            
			{ $_ -eq '.tar' -or $FilePath -match '\.(tar\.gz|tar\.bz2|tar\.xz|tgz|tbz2|txz)$' } {
				# Use native Windows tar command for tar files
				Write-Host "⏳ Extracting with native Windows tar command..." -ForegroundColor Yellow
                
				# Determine the correct tar flags based on file type
				$compressionFlag = ""
				if ($FilePath -match '\.(tar\.gz|tgz)$') {
					$compressionFlag = "-z"  # gzip compression
				}
				elseif ($FilePath -match '\.(tar\.bz2|tbz2)$') {
					$compressionFlag = "-j"  # bzip2 compression
				}
				elseif ($FilePath -match '\.(tar\.xz|txz)$') {
					$compressionFlag = "-J"  # xz compression
				}
                
				# Create output and error files for capturing tar output
				$outputFile = [System.IO.Path]::GetTempFileName()
				$errorFile = [System.IO.Path]::GetTempFileName()
                
				# Build arguments array for proper parsing
				$arguments = @("-x")
				if ($compressionFlag) { $arguments += $compressionFlag }
				$arguments += @("-f", "`"$FilePath`"", "-C", "`"$extractPath`"", "-v")
                
				$process = Start-Process -FilePath "tar" -ArgumentList $arguments -Wait -NoNewWindow -PassThru -RedirectStandardOutput $outputFile -RedirectStandardError $errorFile
                
				# Read the output
				$output = if (Test-Path $outputFile) { Get-Content $outputFile -Raw } else { "" }
				$errorOutput = if (Test-Path $errorFile) { Get-Content $errorFile -Raw } else { "" }
                
				# Clean up temp files
				Remove-Item $outputFile -ErrorAction SilentlyContinue
				Remove-Item $errorFile -ErrorAction SilentlyContinue
				# Check for tar failure (exit code 1)
				if ($process.ExitCode -eq 1) {
					Write-Host "✗ Tar extraction failed with exit code: $($process.ExitCode)" -ForegroundColor Red
					if ($errorOutput) {
						Write-Host "Tar Error Output:" -ForegroundColor Red
						Write-Host $errorOutput -ForegroundColor DarkRed
					}
					return @{
						Success        = $false
						ExtractedFiles = @()
					}
				}
				if ($process.ExitCode -eq 0) {
					Write-Host "✓ Successfully extracted with native tar" -ForegroundColor Green
                    
					# Parse tar verbose output to get extracted files list (tar -v outputs to stderr)
					$extractedFiles = @()
					if ($errorOutput) {
						# Write-Host "DEBUG: Parsing tar verbose output" -ForegroundColor Gray
						$outputLines = $errorOutput -split "`n" | Where-Object { $_.Trim() -ne "" }
						foreach ($line in $outputLines) {
							$trimmedLine = $line.Trim()
							if ($trimmedLine -and $trimmedLine.StartsWith("x ")) {
								# Remove the "x " prefix and get the file path
								$filePath = $trimmedLine.Substring(2).Trim()
								# Convert relative path to absolute path
								$fullPath = Join-Path $extractPath $filePath
								$extractedFiles += $fullPath
							}
						}
						# Write-Host "DEBUG: Tar extracted $($extractedFiles.Count) files" -ForegroundColor Gray



						# Step 2: Find and decompress all nested .gz files
						Write-Host "Searching for nested .gz files to decompress..."

						# Get a list of all .gz files in the destination folder and its subfolders
						# Use -LiteralPath to handle paths with special characters like brackets
						$gzFiles = Get-ChildItem -LiteralPath $extractedFiles[0] -Filter "*.gz" -Recurse
						$zipfiles = Get-ChildItem -LiteralPath $extractedFiles[0] -Filter "*.zip" -Recurse
						if ($gzFiles.Count -gt 0 -or $zipfiles.Count -gt 0) {
							if ($gzFiles.Count -gt 0) {
								Write-Host "Found $($gzFiles.Count) files to decompress."
								foreach ($gzFile in $gzFiles) {
									# Write-Host "Decompressing: $($gzFile.FullName)"
        
									try {
										# Construct the output filename by removing the .gz extension
										$outputFilePath = [System.IO.Path]::Combine($gzFile.DirectoryName, [System.IO.Path]::GetFileNameWithoutExtension($gzFile.Name))
            
										# Use a .NET stream to decompress the file
										$sourceStream = [System.IO.File]::OpenRead($gzFile.FullName)
										$gzipStream = New-Object System.IO.Compression.GZipStream($sourceStream, [System.IO.Compression.CompressionMode]::Decompress)
										$destinationStream = [System.IO.File]::Create($outputFilePath)
            
										$gzipStream.CopyTo($destinationStream)
            
										# Close the streams
										$gzipStream.Close()
										$sourceStream.Close()
										$destinationStream.Close()
            
										# Delete the original .gz file after successful decompression
										Remove-Item -Path $gzFile.FullName
										Write-Host "Decompressed successfully to: $outputFilePath" -ForegroundColor Green
									}
									catch {
										Write-Host "Error decompressing $($gzFile.Name): $($_.Exception.Message)" -ForegroundColor Red
									}
								}
							}
					
							if ($zipfiles.Count -gt 0) {
								Write-Host "Found $($zipfiles.Count) files to decompress."
								foreach ($zipFile in $zipfiles) {
									# Write-Host "Decompressing: $($zipFile.FullName)"
									try {
										$outputFilePath = [System.IO.Path]::Combine($zipFile.DirectoryName, [System.IO.Path]::GetFileNameWithoutExtension($zipFile.Name))
										Expand-Archive -Path $zipFile.FullName -DestinationPath $outputFilePath -Force
										Remove-Item -Path $zipFile.FullName
										Write-Host "Decompressed successfully to: $outputFilePath" -ForegroundColor Green
									}
									catch {
										Write-Host "Error decompressing $($zipFile.Name): $($_.Exception.Message)" -ForegroundColor Red
									}
								}

							}
						}
						else {
							Write-Host "No nested files found to decompress." -ForegroundColor Gray
						}
					}
				}
										
                  
				if ($output) {
					Write-Host "Tar stdout output:" -ForegroundColor Gray
					Write-Host $output -ForegroundColor DarkGray
				
					Write-Host "✗ Tar extraction failed with exit code: $($process.ExitCode)" -ForegroundColor Red
					if ($errorOutput) {
						Write-Host "Tar Error Output:" -ForegroundColor Red
						Write-Host $errorOutput -ForegroundColor DarkRed
					}
                    
					# Fallback to 7-Zip if tar fails
					Write-Host "⚠️ Falling back to 7-Zip..." -ForegroundColor Yellow
					$7zipPath = Test-7ZipInstalled
					if (-not $7zipPath) {
						Write-Host "✗ 7-Zip not found. Please install 7-Zip as fallback." -ForegroundColor Red
						Write-Host "Download from: https://www.7-zip.org/" -ForegroundColor Yellow
						return @{
							Success        = $false
							ExtractedFiles = @()
						}
					}
                    
					# Use 7-Zip as fallback
					$outputFile = [System.IO.Path]::GetTempFileName()
					$errorFile = [System.IO.Path]::GetTempFileName()
					$arguments = "x `"$FilePath`" -o`"$extractPath`" -y -ao"
					$process = Start-Process -FilePath $7zipPath -ArgumentList $arguments -Wait -NoNewWindow -PassThru -RedirectStandardOutput $outputFile -RedirectStandardError $errorFile
                    
					$output = if (Test-Path $outputFile) { Get-Content $outputFile -Raw } else { "" }
					$errorOutput = if (Test-Path $errorFile) { Get-Content $errorFile -Raw } else { "" }
                    
					Remove-Item $outputFile -ErrorAction SilentlyContinue
					Remove-Item $errorFile -ErrorAction SilentlyContinue
                    
					if ($process.ExitCode -eq 0) {
						Write-Host "✓ Successfully extracted with 7-Zip (fallback)" -ForegroundColor Green
					}
					else {
						Write-Host "✗ Both tar and 7-Zip extraction failed" -ForegroundColor Red
						return @{
							Success        = $false
							ExtractedFiles = @()
						}
					}
				}
			}
            
			{ $_ -in @('.rar', '.7z', '.bz2', '.xz') } {
				$7zipPath = Test-7ZipInstalled
				if (-not $7zipPath) {
					Write-Host "✗ 7-Zip not found. Please install 7-Zip to extract $extension files." -ForegroundColor Red
					Write-Host "Download from: https://www.7-zip.org/" -ForegroundColor Yellow
					return @{
						Success        = $false
						ExtractedFiles = @()
					}
				}
                
				Write-Host "⏳ Extracting with 7-Zip (this may take a while for large files)..." -ForegroundColor Yellow
				Write-Host "⏳ Please wait - processing in background..." -ForegroundColor Gray
                
				# Create temporary files for capturing 7-Zip output
				$outputFile = [System.IO.Path]::GetTempFileName()
				$errorFile = [System.IO.Path]::GetTempFileName()
                
				$arguments = "x `"$FilePath`" -o`"$extractPath`"  -aoa"
				$process = Start-Process -FilePath $7zipPath -ArgumentList $arguments -Wait -NoNewWindow -PassThru -RedirectStandardOutput $outputFile -RedirectStandardError $errorFile
                
				# Read the output
				$output = if (Test-Path $outputFile) { Get-Content $outputFile -Raw } else { "" }
				$errorOutput = if (Test-Path $errorFile) { Get-Content $errorFile -Raw } else { "" }
                
				# Clean up temp files
				Remove-Item $outputFile -ErrorAction SilentlyContinue
				Remove-Item $errorFile -ErrorAction SilentlyContinue
                
				if ($process.ExitCode -eq 0) {
					Write-Host "✓ Successfully extracted with 7-Zip" -ForegroundColor Green
					if ($output) {
						Write-Host "7-Zip Output:" -ForegroundColor Gray
						Write-Host $output -ForegroundColor DarkGray
					}
					Write-Host "📊 Creating extraction summary..." -ForegroundColor Cyan
				}
				else {
					Write-Host "✗ 7-Zip extraction failed with exit code: $($process.ExitCode)" -ForegroundColor Red
					if ($errorOutput) {
						Write-Host "7-Zip Error Output:" -ForegroundColor Red
						Write-Host $errorOutput -ForegroundColor DarkRed
					}
					if ($output) {
						Write-Host "7-Zip Standard Output:" -ForegroundColor Yellow
						Write-Host $output -ForegroundColor DarkYellow
					}
					return @{
						Success        = $false
						ExtractedFiles = @()
					}
				}
			}
            
			# '.gz' {
			#     # Handle .gz files (typically single files, not archives)
			#     if ($FilePath -notmatch '\.tar\.gz$') {
			#         $outputFile = Join-Path $extractPath $fileName
                    
			#         $sourceStream = New-Object System.IO.FileStream($FilePath, [System.IO.FileMode]::Open)
			#         $gzipStream = New-Object System.IO.Compression.GZipStream($sourceStream, [System.IO.Compression.CompressionMode]::Decompress)
			#         $destinationStream = New-Object System.IO.FileStream($outputFile, [System.IO.FileMode]::Create)
                    
			#         $gzipStream.CopyTo($destinationStream)
                    
			#         $gzipStream.Dispose()
			#         $sourceStream.Dispose()
			#         $destinationStream.Dispose()
                    
			#         Write-Host "✓ Successfully decompressed GZ file" -ForegroundColor Green
			#     }
			#     # Note: .tar.gz files are handled by the 7-Zip case above
			# }
            
			default {
				Write-Host "✗ Unsupported file extension: $extension" -ForegroundColor Red
				return @{
					Success        = $false
					ExtractedFiles = @()
				}
			}
		}
	}

	catch {
		Write-Host "✗ Error extracting $FilePath : $($_.Exception.Message)" -ForegroundColor Red
		return @{
			Success        = $false
			ExtractedFiles = @()
		}
	}
	# catch {
	# 	Write-Host "✗ Error extracting $FilePath : $($_.Exception.Message)" -ForegroundColor Red
	# 	return @{
	# 		Success        = $false
	# 		ExtractedFiles = @()
	# 	}
	# }

	# Find extracted files - use method appropriate for extraction type
	# if (-not $extractedFiles -or $extractedFiles.Count -eq 0) {
	# 	# Fallback to timestamp-based detection if no files list was captured
	# 	Write-Host "DEBUG: Using timestamp-based file detection as fallback" -ForegroundColor Gray
	# 	if (Test-Path $extractPath) {
	# 		$extractedFiles = Get-ChildItem $extractPath | 
	# 		Where-Object { $_.CreationTime -gt $extractionStartTime } | 
	# 		ForEach-Object { $_.FullName }
	# 	}
	# }
	# else {
	# 	Write-Host "DEBUG: Using extracted files list from extraction tool ($($extractedFiles.Count) files)" -ForegroundColor Gray
	# }
        
	return @{
		Success        = $true
		ExtractedFiles = $extractedFiles
	}
	
}
function Get-CompressedFiles {
	param(
		[string]$Path,
		[bool]$Recursive
	)
    
	if (Test-Path $Path -PathType Leaf) {
		# Single file
		$extension = [System.IO.Path]::GetExtension($Path).ToLower()
		if ($extension -in $SupportedExtensions -or $Path -match '\.(tar\.(gz|bz2|xz))$') {
			return @(@{
					FullName     = $Path
					RelativePath = ""
				})
		}
		else {
			Write-Host "✗ File $Path is not a supported compressed format" -ForegroundColor Red
			return @()
		}
	}
	elseif (Test-Path $Path -PathType Container) {
		# Directory
		$searchOption = if ($Recursive) { "AllDirectories" } else { "TopDirectoryOnly" }
        
		$files = Get-ChildItem -Path $Path -Recurse:$Recursive | Where-Object {
			-not $_.PSIsContainer -and (
				$_.Extension.ToLower() -in $SupportedExtensions -or
				$_.Name -match '\.(tar\.(gz|bz2|xz))$'
			)
		}
        
		return $files | ForEach-Object {
			$relativePath = $_.DirectoryName.Substring($Path.Length).TrimStart('\', '/')
			@{
				FullName     = $_.FullName
				RelativePath = $relativePath
			}
		}
	}
	else {
		Write-Host "✗ Path $Path does not exist" -ForegroundColor Red
		return @()
	}
}

# Main execution
function Main {
	Write-Host "Universal Compressed File Extractor" -ForegroundColor Cyan
	Write-Host "=====================================" -ForegroundColor Cyan
    
	if ($WhatIf) {
		Write-Host "*** WHAT-IF MODE: No files will be actually extracted ***" -ForegroundColor Magenta
		Write-Host ""
	}
    
	# Get parameters if not provided
	if (-not $SourcePath) {
		$SourcePath = Read-Host "Enter the path to compressed file or folder"
	}
    
	# Validate source path
	if (-not (Test-Path $SourcePath)) {
		Write-Host "✗ Source path does not exist: $SourcePath" -ForegroundColor Red
		return
	}
    
	# Set default destination path if not provided
	if (-not $DestinationPath) {
		if (Test-Path $SourcePath -PathType Leaf) {
			# If source is a file, use the directory containing the file
			$DestinationPath = Split-Path $SourcePath -Parent
			Write-Host "No destination specified. Using source file directory: $DestinationPath" -ForegroundColor Yellow
		}
		else {
			# If source is a directory, use the directory itself
			$DestinationPath = $SourcePath
			Write-Host "No destination specified. Using source directory: $DestinationPath" -ForegroundColor Yellow
		}
	}
	else {
		# User provided a destination, check if it needs to be created
		if (-not (Test-Path $DestinationPath)) {
			if ($WhatIf) {
				Write-Host "WHAT IF: Would create destination folder: $DestinationPath" -ForegroundColor Magenta
			}
			else {
				Write-Host "Creating destination folder: $DestinationPath" -ForegroundColor Yellow
				New-Item -Path $DestinationPath -ItemType Directory -Force | Out-Null
			}
		}
	}
    
	# Get all compressed files
	$compressedFiles = Get-CompressedFiles -Path $SourcePath -Recursive:$Recursive
    
	if ($compressedFiles.Count -eq 0) {
		Write-Host "✗ No supported compressed files found in: $SourcePath" -ForegroundColor Red
		Write-Host "Supported formats: $($SupportedExtensions -join ', ')" -ForegroundColor Yellow
		return
	}
    
	$actionWord = if ($WhatIf) { "Extracting" } else { "Extracting" }
	Write-Host "`n$actionWord compressed files...`n" -ForegroundColor Green
    
	$successCount = 0
	$failCount = 0
	$successFiles = @()
	$failedFiles = @()
	$allExtractedFiles = @()
    
	foreach ($file in $compressedFiles) {
		$result = Extract-Archive -FilePath $file.FullName -DestinationPath $DestinationPath -RelativePath $file.RelativePath -WhatIf:$WhatIf
		if ($result.Success) {
			$successCount++
			$successFiles += $file.FullName
			$allExtractedFiles += $result.ExtractedFiles
		}
		else {
			$failCount++
			$failedFiles += $file.FullName
		}
		Write-Host ""
	}
    
	# Summary
	$summaryWord = if ($WhatIf) { "What-If Summary:" } else { "Extraction Summary:" }
	Write-Host $summaryWord -ForegroundColor Cyan
	Write-Host "=================" -ForegroundColor Cyan
    
	if ($WhatIf) {
		Write-Host "✓ Would successfully extract: $successCount file(s)" -ForegroundColor Green
		if ($successFiles.Count -gt 0) {
			foreach ($file in $successFiles) {
				Write-Host "  • $file" -ForegroundColor Gray
			}
		}
		if ($failCount -gt 0) {
			Write-Host "✗ Would fail to extract: $failCount file(s)" -ForegroundColor Red
			foreach ($file in $failedFiles) {
				Write-Host "  • $file" -ForegroundColor Gray
			}
		}
		Write-Host "Would extract to: $DestinationPath" -ForegroundColor Gray
	}
	else {
		
		if ($result.Success) {

			Write-Host "✓ Successfully extracted: $(Split-Path $file.FullName -Leaf) to $($result.ExtractedFiles[0])" -ForegroundColor Green
		}
		else {
        
			Write-Host "✗ Extraction failed: $(Split-Path $file.FullName -Leaf)" -ForegroundColor Red
		}
		Write-Host ""
	}
	
}
# 	if ($successFiles.Count -gt 0) {
# 		foreach ($file in $successFiles) {
# 			Write-Host "  • $file" -ForegroundColor Gray
# 		}
# 	}
# 	if ($failCount -gt 0) {
# 		Write-Host "✗ Failed to extract: $failCount file(s)" -ForegroundColor Red
# 		foreach ($file in $failedFiles) {
# 			Write-Host "  • $file" -ForegroundColor Gray
# 		}
# 	}
        
# 	# Show what files were actually created
# 	if ($allExtractedFiles.Count -gt 0) {
# 		Write-Host "`nFiles created:" -ForegroundColor Yellow
# 		Write-Host "DEBUG: About to analyze extracted files..." -ForegroundColor Gray
            
# 		# Analyze what was extracted - separate folders from files
# 		$topLevelFolders = @()
# 		$compressedFileCount = 0
# 		$foldersWithCompressedFiles = @()
            
# 		Write-Host "DEBUG: Analyzing extracted items..." -ForegroundColor Gray
# 		foreach ($extractedItem in $allExtractedFiles) {
# 			if (Test-Path $extractedItem -PathType Container) {
# 				# It's a folder - get its name and check for compressed files inside
# 				$folderName = Split-Path $extractedItem -Leaf
# 				$topLevelFolders += $folderName
                    
# 				Write-Host "DEBUG: Checking folder '$folderName' for compressed files..." -ForegroundColor Gray
# 				try {
# 					$hasCompressedFiles = Get-ChildItem -Path $extractedItem -Recurse -File -ErrorAction SilentlyContinue | 
# 					Where-Object {
# 						$ext = $_.Extension.ToLower()
# 						$ext -in $SupportedExtensions -or $_.Name -match '\.(tar\.(gz|bz2|xz))$'
# 					} | Select-Object -First 1
                        
# 					if ($hasCompressedFiles) {
# 						$foldersWithCompressedFiles += $folderName
# 						$compressedFileCount = 1  # Just indicate we found some
# 						Write-Host "DEBUG: Found compressed files in '$folderName'" -ForegroundColor Gray
# 					}
# 				}
# 				catch {
# 					Write-Verbose "Could not scan folder $extractedItem for compressed files"
# 				}
# 			}
# 			elseif (Test-Path $extractedItem -PathType Leaf) {
# 				# It's a file - check if it's compressed
# 				$fileExt = [System.IO.Path]::GetExtension($extractedItem).ToLower()
# 				if ($fileExt -in $SupportedExtensions -or $extractedItem -match '\.(tar\.(gz|bz2|xz))$') {
# 					$compressedFileCount = 1
# 					Write-Host "DEBUG: Found compressed file: $(Split-Path $extractedItem -Leaf)" -ForegroundColor Gray
# 				}
# 			}
# 		}
# 		Write-Host "DEBUG: Found $($topLevelFolders.Count) folders, $($foldersWithCompressedFiles.Count) with compressed files" -ForegroundColor Gray
            
# 		# Show summary of created files (first few)
# 		$maxFilesToShow = 5
# 		$filesShown = 0
# 		foreach ($extractedFile in $allExtractedFiles | Sort-Object) {
# 			if ($filesShown -lt $maxFilesToShow) {
# 				$relativePath = $extractedFile.Replace($DestinationPath, "").TrimStart('\', '/')
# 				Write-Host "  → $relativePath" -ForegroundColor Cyan
# 				$filesShown++
# 			}
# 			else {
# 				Write-Host "  → ... and $($allExtractedFiles.Count - $filesShown) more files" -ForegroundColor Cyan
# 				break
# 			}
# 		}
            
# 		# Smart suggestion for compressed files
# 		if ($compressedFileCount -gt 0) {
# 			Write-Host "`n💡 Found $compressedFileCount compressed files that can be extracted!" -ForegroundColor Magenta
                
# 			if ($topLevelFolders.Count -gt 0) {
# 				foreach ($folder in $topLevelFolders) {
# 					$folderPath = Join-Path $DestinationPath $folder
# 					Write-Host "📁 To extract all compressed files in '$folder':" -ForegroundColor Yellow
# 					Write-Host "   .\unzipFile.ps1 -SourcePath `"$folderPath`" -Recursive" -ForegroundColor Cyan
# 				}
# 			}
# 			else {
# 				Write-Host "� To extract all compressed files:" -ForegroundColor Yellow
# 				Write-Host "   .\unzipFile.ps1 -SourcePath `"$DestinationPath`" -Recursive" -ForegroundColor Cyan
# 			}
# 		}
# 	}
        
# 	Write-Host "`nDestination: $DestinationPath" -ForegroundColor Gray
# }


# Show help if requested
if ($args -contains "-help" -or $args -contains "--help" -or $args -contains "/?" -or $args -contains "-h") {
	Show-Help
	return
}

# Run main function
Main