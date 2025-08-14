@{
    RootModule        = 'UnzipWorkspace.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = '1f0f3b2a-1f0a-4a37-8d21-1aa6a30a5a3e'
    Author            = 'unzipWorkSpace'
    CompanyName       = 'Community'
    Description       = 'Helpers to batch-unzip archives and expand .gz files.'
    PowerShellVersion = '5.1'
    FunctionsToExport = @('Invoke-BatchUnzip','Expand-GzipFiles')
    CmdletsToExport   = @()
    VariablesToExport = '*'
    AliasesToExport   = @()
}
