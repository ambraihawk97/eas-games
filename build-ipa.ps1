<#
.SYNOPSIS
    Builds the eas-games (solve9) iOS app and uses GitHub Actions to produce
    the unsigned .ipa, then downloads and extracts it locally.

.DESCRIPTION
    Steps performed:
      1. Local validation: pnpm install + "npx expo export --platform ios"
         (skipped with -SkipLocalBuild).
      2. Commit all changes and push to origin/<Branch>, which triggers the
         "Build Expo IPA" workflow.
      3. Poll the GitHub Actions run for the pushed commit until it completes.
      4. Download the Solve9.ipa artifact (double-zipped by GitHub), extract
         the inner .ipa and place it in -OutDir.

    Authentication uses the stored git credential for github.com
    (via "git credential fill"); fall back to the GH_TOKEN environment
    variable if you set one.

.PARAMETER RepoRoot
    Path to the git repository. Defaults to the directory of this script.

.PARAMETER Branch
    Branch to push and build. Defaults to "main".

.PARAMETER CommitMessage
    Commit message used when there are local changes. Defaults to
    "build: trigger iOS ipa build".

.PARAMETER SkipLocalBuild
    Skip the pnpm install + expo export validation.

.PARAMETER OutDir
    Directory for the final .ipa. Defaults to "<RepoRoot>\artifacts".

.PARAMETER PollIntervalSec
    Seconds between CI status polls. Defaults to 20.

.PARAMETER TimeoutMin
    Maximum minutes to wait for the CI run. Defaults to 90.

.PARAMETER ArtifactName
    GitHub Actions artifact name. Defaults to "Solve9.ipa".

.EXAMPLE
    .\build-ipa.ps1

.EXAMPLE
    .\build-ipa.ps1 -SkipLocalBuild -CommitMessage "chore: try new build"
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = $PSScriptRoot,
    [string]$Branch = "main",
    [string]$CommitMessage = "build: trigger iOS ipa build",
    [switch]$SkipLocalBuild,
    [string]$OutDir = (Join-Path $PSScriptRoot "artifacts"),
    [int]$PollIntervalSec = 20,
    [int]$TimeoutMin = 90,
    [string]$ArtifactName = "Solve9.ipa"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
    Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

function Get-GitHubToken {
    if ($env:GH_TOKEN) { return $env:GH_TOKEN }
    $lines = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
    $pwdLine = $lines | Where-Object { $_ -like "password=*" } | Select-Object -First 1
    if (-not $pwdLine) {
        throw "No GitHub credential available. Set GH_TOKEN or a stored git credential for github.com."
    }
    return $pwdLine.Substring("password=".Length).Trim()
}

if (-not (Test-Path -LiteralPath $RepoRoot)) { throw "RepoRoot does not exist: $RepoRoot" }
Push-Location $RepoRoot
try {
    git rev-parse --is-inside-work-tree | Out-Null
    $origin = git remote get-url origin
    if ($LASTEXITCODE -ne 0) { throw "No origin remote configured." }
} finally {
    Pop-Location
}

if ($origin -notmatch "github\.com[:/]([^/]+)/([^/\.]+?)(\.git)?$") {
    throw "Cannot parse GitHub owner/repo from origin: $origin"
}
$owner = $Matches[1]
$repo = $Matches[2]

Write-Step "Building, pushing and polling for $owner/$repo ($Branch)"

$token = Get-GitHubToken
$headers = @{
    Authorization = "Bearer $token"
    "User-Agent"  = "$repo-build-script"
}
$apiBase = "https://api.github.com/repos/$owner/$repo"

if (-not $SkipLocalBuild) {
    Write-Step "Local build (pnpm install + expo export)"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js not found. Install Node 20+ and retry." }
    $pnpmExe = $null
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm --version *> $null
        if ($LASTEXITCODE -eq 0) { $pnpmExe = 'pnpm' } else { $pnpmExe = $null }
    }
    if (-not $pnpmExe) {
        $npmPrefix = Join-Path $HOME '.pnpm-global'
        $pnpmExe = Join-Path $npmPrefix 'pnpm.cmd'
        $pnpmValid = $false
        if (Test-Path -LiteralPath $pnpmExe) {
            $null = & $pnpmExe --version 2>$null
            if ($LASTEXITCODE -eq 0) { $pnpmValid = $true }
        }
        if (-not $pnpmValid) {
            Write-Host "pnpm not working - reinstalling to $npmPrefix (no admin required)"
            Remove-Item -Recurse -Force $npmPrefix -ErrorAction SilentlyContinue
            npm install -g --allow-scripts=pnpm --prefix $npmPrefix pnpm
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pnpmExe)) {
                throw "Installing pnpm via npm -g failed."
            }
        }
        $env:Path = "$npmPrefix;$env:Path"
    }
    Push-Location $RepoRoot
    try {
        & $pnpmExe install --node-linker=hoisted
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
        $env:CI = "1"
        npx expo export --platform ios
        if ($LASTEXITCODE -ne 0) { throw "expo export failed." }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".github\workflows\build-expo-ipa.yml"))) {
    throw "Missing .github/workflows/build-expo-ipa.yml - commit it in the repo so CI runs on push."
}

Write-Step "Commit and push"
Push-Location $RepoRoot
try {
    git add -A
    $staged = git diff --cached --name-only
    if ($staged) {
        git commit -m $CommitMessage
        if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
    } else {
        Write-Host "Working tree clean - nothing to commit."
    }
    git push origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git push failed. Check credentials for github.com." }
    $sha = (git rev-parse HEAD).Trim()
} finally {
    Pop-Location
}

Write-Step "Waiting for CI run for commit $sha"
$deadline = (Get-Date).AddMinutes($TimeoutMin)
$run = $null
do {
    $runs = Invoke-RestMethod -Headers $headers -Uri "$apiBase/actions/runs?head_sha=$sha&per_page=5"
    $run = $runs.workflow_runs | Where-Object { $_.head_sha -eq $sha } | Select-Object -First 1
    if ($run) {
        Write-Host ("CI status: {0} ({1})" -f $run.status, $run.createdAt)
        if ($run.status -ne "queued" -and $run.status -ne "in_progress") { break }
    } else {
        Write-Host "Run not found yet..."
    }
    Start-Sleep -Seconds $PollIntervalSec
} while ((Get-Date) -lt $deadline)

if (-not $run) { throw "Timed out waiting for a workflow run for commit $sha. See $apiBase/actions" }

if ($run.status -ne "completed") {
    throw "Timed out after $TimeoutMin min; run is still $($run.status). See $($run.html_url)"
}

Write-Host ("CI completed: conclusion = {0} ({1})" -f $run.conclusion, $run.html_url)
if ($run.conclusion -ne "success") {
    throw "CI run failed with conclusion '$($run.conclusion)'. See $($run.html_url)"
}

Write-Step "Downloading artifact '$ArtifactName'"
$artResult = Invoke-RestMethod -Headers $headers -Uri "$apiBase/actions/runs/$($run.id)/artifacts"
$artifact = $artResult.artifacts | Where-Object { $_.name -eq $ArtifactName } | Select-Object -First 1
if (-not $artifact) { throw "Artifact '$ArtifactName' not found on run $($run.id)." }
if ($artifact.archived) { throw "Artifact '$ArtifactName' is archived; downloads limited." }

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) ("sgd-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpDir | Out-Null
try {
    $zipPath = Join-Path $tmpDir "artifact.zip"
    $innerDir = Join-Path $tmpDir "inner"
    New-Item -ItemType Directory -Path $innerDir | Out-Null

    & curl.exe -sS -L -H "Authorization: Bearer $token" -H "User-Agent: $repo-build-script" `
        -o $zipPath "$apiBase/actions/artifacts/$($artifact.id)/zip"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zipPath)) {
        throw "Failed to download artifact zip."
    }

    Expand-Archive -Path $zipPath -DestinationPath $innerDir
    $innerIpa = Get-ChildItem -Path $innerDir -Recurse -Filter *.ipa | Select-Object -First 1
    if (-not $innerIpa) { throw "No .ipa found inside the artifact zip." }

    if (-not (Test-Path -LiteralPath $OutDir)) {
        New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    }
    $finalPath = Join-Path $OutDir $innerIpa.Name
    Copy-Item -Force -LiteralPath $innerIpa.FullName -Destination $finalPath
    $sizeMB = "{0:N1}" -f ((Get-Item -LiteralPath $finalPath).Length / 1MB)

    Write-Host ""
    Write-Host "SUCCESS: $finalPath ($sizeMB MB)" -ForegroundColor Green
    Write-Host "Sideload with Sideloadly using this .ipa" -ForegroundColor Green
} finally {
    Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}