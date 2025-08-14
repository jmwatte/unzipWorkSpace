# PowerShell Project

[![Verify submodules & test](https://github.com/jmwatte/unzipWorkSpace/actions/workflows/submodules.yml/badge.svg)](https://github.com/jmwatte/unzipWorkSpace/actions/workflows/submodules.yml)

A PowerShell project workspace for script development and automation.

## Project Structure

```
├── Scripts/           # PowerShell scripts
├── Modules/          # PowerShell modules
├── Tests/            # Pester tests
├── Docs/             # Documentation
└── README.md         # This file
```

## Getting Started

1. Place your PowerShell scripts in the `Scripts/` directory
2. Create reusable modules in the `Modules/` directory
3. Write tests using Pester in the `Tests/` directory
4. Document your project in the `Docs/` directory

## Development

- Use PowerShell 5.1+ or PowerShell 7+
- Follow PowerShell best practices and coding standards
- Use approved verbs for function names
- Include help documentation for functions

## Testing

Run tests using Pester:
```powershell
Invoke-Pester
```

## UnzipWorkspace module

Import the module and use helpers:
```powershell
Import-Module ./Modules/UnzipWorkspace/UnzipWorkspace.psd1

# Expand all .gz files under a folder
Get-ChildItem -Path . -Recurse -Filter *.gz | Expand-GzipFiles

# Batch unzip a list of archives into a temp root
Invoke-BatchUnzip -Files @('I:\A.tar.gz','I:\B.zip') -Verbose
```

Install the module to your user Modules path and import by name:
```powershell
./Scripts/Install-LocalModule.ps1 -Force
Import-Module UnzipWorkspace
```

## Requirements

- PowerShell 5.1+ or PowerShell 7+
- Pester (for testing)

## KeyMotion Trainer submodule

This workspace includes the VS Code extension project `keymotion-trainer` as a Git submodule.

- First-time clone (or when CI needs submodules):
	```powershell
	git submodule update --init --recursive
	```
- Pull latest submodule commits (when upstream `keymotion-trainer` has moved):
	```powershell
	git submodule update --remote --recursive
	```
- Working inside the submodule (commits go to its own repo):
	```powershell
	Set-Location keymotion-trainer
	# make changes, test, then
	git add -A
	git commit -m "feat: ..."
	git push
	Set-Location ..
	# record new submodule pointer in this repo
	git add keymotion-trainer
	git commit -m "chore(submodule): bump keymotion-trainer"
	git push
	```
