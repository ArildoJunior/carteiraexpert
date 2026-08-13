[CmdletBinding()]
param(
    [string]$Commit = "c44106cc",
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $ReportPath = "auditoria-segredo-$Commit.txt"
}

function Invoke-GitSafe {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $result = @(& git @Arguments 2>$null)

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao consultar o repositório Git."
    }

    return $result
}

function Remove-Quotes {
    param(
        [string]$Value
    )

    if ($null -eq $Value) {
        return ""
    }

    $clean = $Value.Trim()

    if (
        $clean.Length -ge 2 -and
        (
            (
                $clean.StartsWith('"') -and
                $clean.EndsWith('"')
            ) -or
            (
                $clean.StartsWith("'") -and
                $clean.EndsWith("'")
            )
        )
    ) {
        return $clean.Substring(1, $clean.Length - 2)
    }

    return $clean
}

function Test-Placeholder {
    param(
        [string]$Value
    )

    $clean = Remove-Quotes $Value

    if ([string]::IsNullOrWhiteSpace($clean)) {
        return $true
    }

    $placeholderPatterns = @(
        '(?i)^PUBLIC$',
        '(?i)^NONE$',
        '(?i)^NULL$',
        '(?i)^N/?A$',
        '(?i)^TODO$',
        '(?i)^TBD$',
        '(?i)^CHANGE[-_ ]?ME$',
        '(?i)^REPLACE[-_ ]?WITH[-_ ]?',
        '(?i)^YOUR[-_ ]?',
        '(?i)^EXAMPLE[-_ ]?',
        '(?i)^DUMMY[-_ ]?',
        '(?i)^FAKE[-_ ]?',
        '(?i)^TEST[-_ ]?',
        '(?i)^SAMPLE[-_ ]?',
        '(?i)^USER$',
        '(?i)^PASSWORD$',
        '(?i)^HOST$',
        '(?i)^PORT$',
        '(?i)^DATABASE$',
        '(?i)^DATABASE[_-]TEST$',
        '(?i)^LOCALHOST$',
        '(?i)USER:PASSWORD',
        '(?i)HOST:\d+',
        '(?i)LOCALHOST:\d+',
        '(?i)REPLACE[-_ ]?WITH',
        '(?i)YOUR[-_ ]?(SECRET|PASSWORD|TOKEN|KEY)',
        '(?i)LONG[-_ ]?RANDOM[-_ ]?(SECRET|VALUE|TOKEN)',
        '(?i)RANDOM[-_ ]?(SECRET|VALUE|TOKEN)',
        '(?i)API[-_ ]?KEY',
        '(?i)SECRET[-_ ]?HERE',
        '(?i)TOKEN[-_ ]?HERE'
    )

    foreach ($pattern in $placeholderPatterns) {
        if ($clean -match $pattern) {
            return $true
        }
    }

    return $false
}

function Add-Finding {
    param(
        [string]$File,
        [int]$Line,
        [string]$Variable,
        [string]$Category
    )

    $key = "$File|$Line|$Variable|$Category"

    if (-not $script:Seen.ContainsKey($key)) {
        $script:Seen[$key] = $true

        $script:Findings.Add(
            [PSCustomObject]@{
                Arquivo   = $File
                Linha     = $Line
                Variavel  = $Variable
                Categoria = $Category
            }
        )
    }
}

function Test-ChangedLine {
    param(
        [string]$File,
        [int]$LineNumber,
        [string]$Content
    )

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return
    }

    $trimmed = $Content.Trim()

    if (
        $trimmed.StartsWith("#") -or
        $trimmed.StartsWith("//") -or
        $trimmed.StartsWith("/*") -or
        $trimmed.StartsWith("*")
    ) {
        return
    }

    # Detecta variáveis de ambiente sensíveis com nomes comuns.
    $assignmentPattern =
        '(?i)^\s*([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CLIENT_SECRET|ENCRYPTION_KEY|SIGNING_KEY|DATABASE_URL)[A-Z0-9_]*)\s*=\s*(.*?)\s*$'

    if ($trimmed -match $assignmentPattern) {
        $variable = $Matches[1]
        $value = Remove-Quotes $Matches[2]

        if (-not (Test-Placeholder $value)) {
            Add-Finding `
                -File $File `
                -Line $LineNumber `
                -Variable $variable `
                -Category "Valor sensível não identificado como placeholder"
        }

        return
    }

    # Detecta URLs de banco somente quando usuário e senha parecem reais.
    $databaseUrlPattern =
        '(?i)^(?:[A-Z][A-Z0-9_]*\s*=\s*)?["'']?(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://([^:/\s]+):([^@\s/]+)@'

    if ($trimmed -match $databaseUrlPattern) {
        $databaseUser = $Matches[2]
        $databasePassword = $Matches[3]

        if (
            -not (Test-Placeholder $databaseUser) -and
            -not (Test-Placeholder $databasePassword)
        ) {
            Add-Finding `
                -File $File `
                -Line $LineNumber `
                -Variable "DATABASE_URL" `
                -Category "URL de banco com credenciais não fictícias"
        }

        return
    }

    # Detecta chaves privadas.
    if (
        $Content -match '(?i)BEGIN\s+(RSA|OPENSSH|EC|PGP)\s+PRIVATE KEY'
    ) {
        Add-Finding `
            -File $File `
            -Line $LineNumber `
            -Variable "PRIVATE_KEY" `
            -Category "Chave privada"
    }

    # Detecta padrões conhecidos de tokens.
    if ($Content -match '(?i)\bAKIA[0-9A-Z]{16}\b') {
        Add-Finding `
            -File $File `
            -Line $LineNumber `
            -Variable "API_KEY" `
            -Category "Chave AWS"
    }

    if ($Content -match '(?i)\bgh[pousr]_[A-Za-z0-9_]{20,}\b') {
        Add-Finding `
            -File $File `
            -Line $LineNumber `
            -Variable "TOKEN" `
            -Category "Token GitHub"
    }

    if ($Content -match '(?i)\bsk-[A-Za-z0-9_-]{20,}\b') {
        Add-Finding `
            -File $File `
            -Line $LineNumber `
            -Variable "API_KEY" `
            -Category "Chave de API"
    }
}

try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git não está disponível neste ambiente."
    }

    $commitObject = Invoke-GitSafe @(
        "rev-parse",
        "--verify",
        "$Commit^{commit}"
    )

    if (-not $commitObject) {
        throw "Commit não encontrado: $Commit"
    }

    $script:Findings = New-Object System.Collections.Generic.List[object]
    $script:Seen = @{}

    $diffLines = Invoke-GitSafe @(
        "--no-pager",
        "diff-tree",
        "--root",
        "--no-renames",
        "--unified=0",
        "--format=",
        $Commit
    )

    $currentFile = ""
    $currentNewLine = 0

    foreach ($diffLine in $diffLines) {
        if ($diffLine -match '^diff --git a/(.+) b/(.+)$') {
            $currentFile = $Matches[2]
            $currentNewLine = 0
            continue
        }

        if ($diffLine -match '^\+\+\+ b/(.+)$') {
            $currentFile = $Matches[1]
            continue
        }

        if ($diffLine -match '^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@') {
            $currentNewLine = [int]$Matches[1]
            continue
        }

        if (
            $diffLine.StartsWith("+") -and
            -not $diffLine.StartsWith("+++")
        ) {
            $content = $diffLine.Substring(1)

            Test-ChangedLine `
                -File $currentFile `
                -LineNumber $currentNewLine `
                -Content $content

            $currentNewLine++
            continue
        }
    }

    $remoteBranches = @(
        & git branch -r --contains $Commit 2>$null
    )

    $tags = @(
        & git tag --contains $Commit 2>$null
    )

    $commitDate = @(
        Invoke-GitSafe @(
            "show",
            "-s",
            "--format=%cI",
            $Commit
        )
    )[0]

    $commitSubject = @(
        Invoke-GitSafe @(
            "show",
            "-s",
            "--format=%s",
            $Commit
        )
    )[0]

    $report = New-Object System.Collections.Generic.List[string]

    $report.Add("RELATÓRIO SANITIZADO DE AUDITORIA DE SEGREDOS")
    $report.Add("")
    $report.Add("Commit analisado: $Commit")
    $report.Add("Data do commit: $commitDate")
    $report.Add("Título do commit: $commitSubject")
    $report.Add("")

    if ($Findings.Count -gt 0) {
        $report.Add("STATUS GERAL: BLOQUEADO")
        $report.Add("Possíveis exposições reais: $($Findings.Count)")
    } else {
        $report.Add("STATUS GERAL: NENHUMA EXPOSIÇÃO REAL DETECTADA")
        $report.Add("Possíveis exposições reais: 0")
    }

    $report.Add("")
    $report.Add("OCORRÊNCIAS SANITIZADAS:")

    if ($Findings.Count -gt 0) {
        foreach ($finding in $Findings) {
            $report.Add(
                "- Arquivo: $($finding.Arquivo) | Linha: $($finding.Linha) | Variável: $($finding.Variavel) | Categoria: $($finding.Categoria)"
            )
        }
    } else {
        $report.Add("- Nenhuma")
    }

    $report.Add("")

    if ($remoteBranches.Count -gt 0) {
        $report.Add("COMMIT PRESENTE EM REFERÊNCIAS REMOTAS: SIM")
        $report.Add("Quantidade de referências remotas: $($remoteBranches.Count)")
    } else {
        $report.Add("COMMIT PRESENTE EM REFERÊNCIAS REMOTAS: NÃO CONFIRMADO")
    }

    if ($tags.Count -gt 0) {
        $report.Add("COMMIT PRESENTE EM TAGS: SIM")
    } else {
        $report.Add("COMMIT PRESENTE EM TAGS: NÃO CONFIRMADO")
    }

    $report.Add("")
    $report.Add("SEGREDOS EXIBIDOS: NÃO")
    $report.Add("Valores, senhas, tokens, chaves, URLs completas e linhas de código não foram exibidos.")
    $report.Add("ALTERAÇÃO NO REPOSITÓRIO: NÃO")
    $report.Add("Nenhum commit, push, reset, checkout, rebase ou reescrita de histórico foi executado.")

    if ($Findings.Count -gt 0) {
        $report.Add("AÇÃO: revisar e rotacionar as credenciais apontadas antes de qualquer publicação.")
    } else {
        $report.Add("AÇÃO: nenhum segredo real foi confirmado pelo padrão utilizado.")
    }

    $report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

    $report | ForEach-Object {
        Write-Host $_
    }

    Write-Host ""
    Write-Host "Relatório salvo em: $ReportPath" -ForegroundColor Cyan

    if ($Findings.Count -gt 0) {
        Write-Host "ATENÇÃO: foram encontrados valores que não parecem placeholders." -ForegroundColor Yellow
    } else {
        Write-Host "Nenhuma credencial real foi detectada." -ForegroundColor Green
    }
}
catch {
    Write-Host ""
    Write-Host "AUDITORIA NÃO CONCLUÍDA" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Nenhuma alteração foi feita no repositório." -ForegroundColor Yellow
}
