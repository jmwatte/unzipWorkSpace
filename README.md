# PowerShell Project

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

## Requirements

- PowerShell 5.1+ or PowerShell 7+
- Pester (for testing)
