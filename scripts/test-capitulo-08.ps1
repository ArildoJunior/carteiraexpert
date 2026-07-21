# Teste canonico do Capitulo 08 - 6 barreiras em ordem.
# Exit 0 somente se TODAS passarem.

$ErrorActionPreference = "Stop"
$results = @()

function Run-Step {
    param([int]$Num, [string]$Title, [scriptblock]$Cmd)
    Write-Host ""
    Write-Host "================================================================"
    Write-Host "  [$Num/6] $Title"
    Write-Host "================================================================"
    try {
        & $Cmd
        if ($LASTEXITCODE -ne 0) { throw "Exit code $LASTEXITCODE" }
        Write-Host "[OK]   $Title"
        $script:results += @{ N = $Num; Title = $Title; Status = "OK" }
    } catch {
        Write-Host "[FAIL] $Title  --  $($_.Exception.Message)"
        $script:results += @{ N = $Num; Title = $Title; Status = "FAIL" }
        throw
    }
}

# Libera porta 3000
Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "next dev" } |
    ForEach-Object { Stop-Process -Id $_.Id -Force }
Start-Sleep -Seconds 1

try {
    Run-Step 1 "Biome (lint)"           { pnpm exec biome check }
    Run-Step 2 "TypeScript (tsc)"       { pnpm typecheck }
    Run-Step 3 "Drizzle migrate"        { pnpm drizzle-kit migrate }
    Run-Step 4 "Vitest + Coverage 80%"  { pnpm test:coverage }
    Run-Step 5 "Next build"             { pnpm build }
    Run-Step 6 "Playwright E2E"         { pnpm exec playwright test --reporter=line }
} catch {
    Write-Host ""
    Write-Host "================================================================"
    Write-Host "  CAPITULO 08 - FALHOU em alguma barreira"
    Write-Host "================================================================"
    $script:results | Format-Table -AutoSize
    exit 1
}

Write-Host ""
Write-Host "================================================================"
Write-Host "  CAPITULO 08 - 6/6 verde. Regra de ouro fechada."
Write-Host "================================================================"
$script:results | Format-Table -AutoSize
exit 0