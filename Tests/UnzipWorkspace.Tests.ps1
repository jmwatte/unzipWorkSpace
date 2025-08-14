$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..')
$modulePath = Join-Path $root 'Modules/UnzipWorkspace/UnzipWorkspace.psd1'

Describe 'UnzipWorkspace module' {
    It 'imports and expands a simple .gz' {
        Import-Module $modulePath -Force
        $tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("uw-" + [guid]::NewGuid()))
        try {
            $sourceTxt = Join-Path $tmp.FullName 'hello.txt'
            'hi' | Set-Content -LiteralPath $sourceTxt -Encoding ascii
            # Create a .gz of that file
            $gzPath = Join-Path $tmp.FullName 'hello.txt.gz'
            $fs = [IO.File]::OpenRead($sourceTxt)
            $gz = New-Object IO.Compression.GZipStream([IO.File]::Create($gzPath), [IO.Compression.CompressionMode]::Compress)
            try { $fs.CopyTo($gz) } finally { $gz.Close(); $fs.Close() }
            Remove-Item -LiteralPath $sourceTxt
            # Expand via pipeline
            $out = Get-Item -LiteralPath $gzPath | Expand-GzipFiles | Select-Object -First 1
            Test-Path -LiteralPath (Join-Path $tmp.FullName 'hello.txt') | Should -BeTrue
        }
        finally { Remove-Item -LiteralPath $tmp.FullName -Recurse -Force }
    }
}
