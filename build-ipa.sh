#!/usr/bin/env bash
# Builds the eas-games (solve9) iOS app and uses GitHub Actions to produce
# the unsigned .ipa, then downloads and extracts it locally.
#
# Steps:
#   1. Local validation: pnpm install + "npx expo export --platform ios"
#      (skipped with --skip-local-build). If the repo is on a network
#      filesystem (this tree lives on CIFS), sources are mirrored to
#      ~/.cache/eas-games-ipa-build/worktree first. pnpm postinstall
#      scripts fail on network mounts. On non-x86 hosts the React Native
#      hermesc binary cannot execute, so the export runs with
#      --no-bytecode; CI still builds Hermes bytecode for the real app.
#   2. Commit local changes and push to origin/<branch>, which triggers
#      the "Build Expo IPA" workflow.
#   3. Poll the GitHub Actions run for the pushed commit until it completes.
#   4. Download the Solve9.ipa artifact and place the inner .ipa in --out-dir.
#
# Sideloadly is a Windows/macOS app, so this script does not launch it. The
# .ipa path is printed when the download finishes; open it from a Windows PC
# (the repo lives on the NAS share, so no copy is needed). Pass --no-deploy
# to skip that note.
#
# Authentication: GH_TOKEN or GITHUB_TOKEN, then "gh auth token", then the
# stored git credential for github.com.
#
# Usage:
#   ./build-ipa.sh
#   ./build-ipa.sh --skip-local-build --commit-message "chore: try new build"

set -euo pipefail

repo_root=""
branch="main"
commit_message="build: trigger iOS ipa build"
skip_local_build=0
out_dir=""
poll_interval_sec=20
timeout_min=90
artifact_name="Solve9.ipa"
no_deploy=0

usage() {
    cat <<'EOF'
Usage: build-ipa.sh [options]

  --repo-root PATH         Git repository (default: this script's directory)
  --branch NAME            Branch to push and build (default: main)
  --commit-message TEXT    Commit message when there are local changes
  --skip-local-build       Skip pnpm install and expo export
  --out-dir PATH           Directory for the final .ipa (default: <repo>/artifacts)
  --poll-interval SEC      Seconds between CI status polls (default: 20)
  --timeout-min MIN        Maximum minutes to wait for CI (default: 90)
  --artifact-name NAME     GitHub Actions artifact name (default: Solve9.ipa)
  --no-deploy              Skip the post-download sideload note
  -h, --help               Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo-root)
            repo_root=${2:-}
            shift 2
            ;;
        --branch)
            branch=${2:-}
            shift 2
            ;;
        --commit-message)
            commit_message=${2:-}
            shift 2
            ;;
        --skip-local-build)
            skip_local_build=1
            shift
            ;;
        --out-dir)
            out_dir=${2:-}
            shift 2
            ;;
        --poll-interval)
            poll_interval_sec=${2:-}
            shift 2
            ;;
        --timeout-min)
            timeout_min=${2:-}
            shift 2
            ;;
        --artifact-name)
            artifact_name=${2:-}
            shift 2
            ;;
        --no-deploy)
            no_deploy=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -t 1 ]]; then
    cyan=$'\033[36m'
    green=$'\033[32m'
    yellow=$'\033[33m'
    red=$'\033[31m'
    reset=$'\033[0m'
else
    cyan=""
    green=""
    yellow=""
    red=""
    reset=""
fi

step() {
    printf '\n%s=== %s ===%s\n' "$cyan" "$1" "$reset"
}

die() {
    printf '%s%s%s\n' "$red" "$*" "$reset" >&2
    exit 1
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [[ -z "$repo_root" ]]; then
    repo_root=$script_dir
fi
repo_root=$(cd "$repo_root" && pwd)
if [[ -z "$out_dir" ]]; then
    out_dir="$repo_root/artifacts"
fi

export PATH="$HOME/.local/bin:$PATH"

is_remote_path() {
    local path=$1 fstype source
    if [[ "$path" == //* ]]; then
        return 0
    fi
    if ! command -v findmnt >/dev/null 2>&1; then
        return 1
    fi
    fstype=$(findmnt -T "$path" -no FSTYPE 2>/dev/null | head -1 || true)
    source=$(findmnt -T "$path" -no SOURCE 2>/dev/null | head -1 || true)
    case "$fstype" in
        cifs|smb|smb3|smbfs|nfs|nfs4|fuse.sshfs|fuse.rclone|9p|afs)
            return 0
            ;;
    esac
    [[ "$source" == //* || "$source" == *:* ]]
}

sync_local_build_tree() {
    local source_root=$1 dest_root=$2
    mkdir -p "$dest_root"
    rsync -a --delete \
        --exclude node_modules \
        --exclude .git \
        --exclude dist \
        --exclude .expo \
        --exclude artifacts \
        --exclude website \
        --exclude .turbo \
        --exclude android \
        --exclude ios \
        "$source_root/" "$dest_root/"
}

pick_node() {
    local nvm_dir=${NVM_DIR:-$HOME/.nvm}
    local best_bin="" ver
    if [[ -d "$nvm_dir/versions/node" ]]; then
        best_bin=$(
            for dir in "$nvm_dir"/versions/node/v*; do
                [[ -x "$dir/bin/node" ]] || continue
                ver=${dir##*/v}
                case "$ver" in
                    2[0-9].*|[3-9][0-9].*) printf '%s %s\n' "$ver" "$dir/bin" ;;
                esac
            done | sort -V | awk 'END { print $2 }'
        )
    fi
    if [[ -n "$best_bin" ]]; then
        export PATH="$best_bin:$PATH"
        hash -r
    fi
    command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ and retry."
    ver=$(node -p "process.versions.node")
    case "$ver" in
        2[0-9].*|[3-9][0-9].*) ;;
        *) die "Node.js v$ver is too old. Install Node 20+ and retry." ;;
    esac
}

ensure_pnpm() {
    if command -v pnpm >/dev/null 2>&1 && pnpm --version >/dev/null 2>&1; then
        return 0
    fi
    if command -v corepack >/dev/null 2>&1; then
        corepack enable
        corepack prepare pnpm@10 --activate
        hash -r
        command -v pnpm >/dev/null 2>&1 && return 0
    fi
    local prefix="$HOME/.pnpm-global"
    echo "pnpm not working - installing to $prefix (no admin required)"
    rm -rf "$prefix"
    npm install -g --prefix "$prefix" pnpm
    export PATH="$prefix/bin:$PATH"
    hash -r
    command -v pnpm >/dev/null 2>&1 || die "Installing pnpm via npm -g failed."
}

get_github_token() {
    if [[ -n "${GH_TOKEN:-}" ]]; then
        printf '%s' "$GH_TOKEN"
        return 0
    fi
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        printf '%s' "$GITHUB_TOKEN"
        return 0
    fi
    if command -v gh >/dev/null 2>&1; then
        local gh_token
        gh_token=$(gh auth token 2>/dev/null || true)
        if [[ -n "$gh_token" ]]; then
            printf '%s' "$gh_token"
            return 0
        fi
    fi
    local cred password
    cred=$(printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null || true)
    password=$(printf '%s\n' "$cred" | sed -n 's/^password=//p' | head -1)
    if [[ -z "$password" ]]; then
        die "No GitHub credential available. Set GH_TOKEN, run 'gh auth login', or store a git credential for github.com."
    fi
    printf '%s' "$password"
}

api_get() {
    local url=$1
    curl -fsS \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -H "User-Agent: ${repo}-build-script" \
        "$url"
}

command -v git >/dev/null 2>&1 || die "git is not installed."
command -v curl >/dev/null 2>&1 || die "curl is not installed."
command -v jq >/dev/null 2>&1 || die "jq is not installed."

git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "RepoRoot is not a git work tree: $repo_root"
origin=$(git -C "$repo_root" remote get-url origin) \
    || die "No origin remote configured."

if [[ ! "$origin" =~ github\.com[:/]([^/]+)/([^/]+) ]]; then
    die "Cannot parse GitHub owner/repo from origin: $origin"
fi
owner=${BASH_REMATCH[1]}
repo=${BASH_REMATCH[2]}
repo=${repo%.git}

step "Building, pushing and polling for $owner/$repo ($branch)"
api_base="https://api.github.com/repos/$owner/$repo"

if [[ "$skip_local_build" -eq 0 ]]; then
    step "Local build (pnpm install + expo export)"
    pick_node
    ensure_pnpm
    command -v rsync >/dev/null 2>&1 || die "rsync is not installed."

    build_root=$repo_root
    if is_remote_path "$repo_root"; then
        cache_root=${XDG_CACHE_HOME:-$HOME/.cache}
        build_root="$cache_root/eas-games-ipa-build/worktree"
        echo "Repo is on a network filesystem; mirroring sources to local disk:"
        echo "  $build_root"
        sync_local_build_tree "$repo_root" "$build_root"
    fi

    (
        cd "$build_root"
        pnpm install --node-linker=hoisted

        export_args=(--platform ios)
        hermesc="node_modules/react-native/sdks/hermesc/linux64-bin/hermesc"
        if [[ -f "$hermesc" ]] && ! "$hermesc" -version >/dev/null 2>&1; then
            echo "Hermes compiler cannot run on $(uname -m); exporting without bytecode."
            echo "This only affects local validation - CI builds Hermes bytecode for iOS."
            export_args+=(--no-bytecode)
        fi
        CI=1 npx expo export "${export_args[@]}"
    )
fi

[[ -f "$repo_root/.github/workflows/build-expo-ipa.yml" ]] \
    || die "Missing .github/workflows/build-expo-ipa.yml - commit it in the repo so CI runs on push."

step "Resolving GitHub credentials"
token=$(get_github_token)

step "Commit and push"
(
    cd "$repo_root"
    git add -A
    if [[ -n "$(git diff --cached --name-only)" ]]; then
        git commit -m "$commit_message"
    else
        echo "Working tree clean - nothing to commit."
    fi
    git push origin "$branch"
)
sha=$(git -C "$repo_root" rev-parse HEAD)

step "Waiting for CI run for commit $sha"
deadline=$((SECONDS + timeout_min * 60))
run=""
while (( SECONDS < deadline )); do
    runs_json=$(api_get "$api_base/actions/runs?head_sha=$sha&per_page=5")
    run=$(jq -c --arg sha "$sha" 'first(.workflow_runs[] | select(.head_sha == $sha)) // empty' <<<"$runs_json")
    if [[ -n "$run" ]]; then
        printf 'CI status: %s (%s)\n' "$(jq -r '.status' <<<"$run")" "$(jq -r '.created_at' <<<"$run")"
        status=$(jq -r '.status' <<<"$run")
        if [[ "$status" != "queued" && "$status" != "in_progress" ]]; then
            break
        fi
    else
        echo "Run not found yet..."
    fi
    sleep "$poll_interval_sec"
done

[[ -n "$run" ]] || die "Timed out waiting for a workflow run for commit $sha. See $api_base/actions"

status=$(jq -r '.status' <<<"$run")
html_url=$(jq -r '.html_url' <<<"$run")
if [[ "$status" != "completed" ]]; then
    die "Timed out after $timeout_min min; run is still $status. See $html_url"
fi

conclusion=$(jq -r '.conclusion' <<<"$run")
printf 'CI completed: conclusion = %s (%s)\n' "$conclusion" "$html_url"
[[ "$conclusion" == "success" ]] || die "CI run failed with conclusion '$conclusion'. See $html_url"

step "Downloading artifact '$artifact_name'"
run_id=$(jq -r '.id' <<<"$run")
arts_json=$(api_get "$api_base/actions/runs/$run_id/artifacts")
artifact=$(jq -c --arg name "$artifact_name" 'first(.artifacts[] | select(.name == $name)) // empty' <<<"$arts_json")
[[ -n "$artifact" ]] || die "Artifact '$artifact_name' not found on run $run_id."
[[ "$(jq -r '.archived' <<<"$artifact")" == "true" ]] && die "Artifact '$artifact_name' is archived; downloads limited."
artifact_id=$(jq -r '.id' <<<"$artifact")

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/sgd-XXXXXX")
cleanup() {
    [[ -n "${tmp_dir:-}" && -d "$tmp_dir" ]] && rm -rf "$tmp_dir"
}
trap cleanup EXIT

zip_path="$tmp_dir/artifact.zip"
inner_dir="$tmp_dir/inner"
mkdir -p "$inner_dir"
headers_path="$tmp_dir/headers"

curl -sS -D "$headers_path" -o /dev/null \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "User-Agent: ${repo}-build-script" \
    "$api_base/actions/artifacts/$artifact_id/zip"
location=$(awk 'tolower($1)=="location:" { print $2 }' "$headers_path" | tr -d '\r' | tail -1)
if [[ -n "$location" ]]; then
    curl -fL -o "$zip_path" "$location"
else
    curl -fsS -L \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -H "User-Agent: ${repo}-build-script" \
        -o "$zip_path" \
        "$api_base/actions/artifacts/$artifact_id/zip"
fi
[[ -s "$zip_path" ]] || die "Failed to download artifact zip."

unzip -q "$zip_path" -d "$inner_dir"
inner_ipa=$(find "$inner_dir" -type f -name '*.ipa' -print -quit)
[[ -n "$inner_ipa" ]] || die "No .ipa found inside the artifact zip."

mkdir -p "$out_dir"
final_path="$out_dir/$(basename "$inner_ipa")"
cp -f "$inner_ipa" "$final_path"
size_mb=$(awk -v bytes="$(stat -c%s "$final_path")" 'BEGIN { printf "%.1f", bytes/1048576 }')

printf '\n'
printf '%sSUCCESS: %s (%s MB)%s\n' "$green" "$final_path" "$size_mb" "$reset"

if [[ "$no_deploy" -eq 0 ]]; then
    step "IPA ready"
    printf '%sSideloadly runs on Windows/macOS only, so it cannot be launched from this Pi.%s\n' "$yellow" "$reset"
    printf '%sOpen this file from a Windows PC and drag it into Sideloadly:%s\n' "$yellow" "$reset"
    printf '%s  %s%s\n' "$yellow" "$final_path" "$reset"
    printf '%sIt is already on the NAS share, so no copy is required.%s\n' "$yellow" "$reset"
    printf '%sPass --no-deploy to skip this note.%s\n' "$yellow" "$reset"
fi
