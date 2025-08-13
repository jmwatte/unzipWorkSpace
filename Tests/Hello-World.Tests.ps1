Describe "Hello-World Script" {
    Context "When running the script" {
        It "Should execute without errors" {
            { & "$PSScriptRoot\..\Scripts\Hello-World.ps1" } | Should -Not -Throw
        }
        
        It "Should accept Name parameter" {
            { & "$PSScriptRoot\..\Scripts\Hello-World.ps1" -Name "Test" } | Should -Not -Throw
        }
    }
}
