#!/bin/sh
# setup.sh — build and install the codemeow extension from source. POSIX sh.
#
#   ./setup.sh                 build, install extension + default ~/.codemeowrc
#   ./setup.sh --list          show detected extension directories and exit
#   ./setup.sh --build-only    just compile into out/
#   ./setup.sh --rc-only       only install the default .codemeowrc
#   ./setup.sh --skip-build    install the already-built out/
#   ./setup.sh --ext-dir DIR   install into DIR instead of auto-detecting
#   ./setup.sh --force-rc      overwrite an existing .codemeowrc
#
# Detection covers VS Code and VSCodium on Linux/macOS (~/.vscode/extensions,
# ~/.vscode-oss/extensions), the WSL remote server (~/.vscode-server/
# extensions), and Windows editors from WSL (/mnt/c/Users/<user>/.vscode/
# extensions and .vscode-oss). The extension is side-loaded as a plain
# directory — no marketplace needed; restart the editor to pick it up.
#
# SPDX-License-Identifier: GPL-3.0-or-later

set -eu

here=$(cd "$(dirname "$0")" && pwd)
cd "$here"

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -1)
ext_id="chubbyhippo.codemeow-$version"

do_build=1 do_ext=1 do_rc=1 force_rc=0 list_only=0
explicit_dir=""

while [ $# -gt 0 ]; do
    case "$1" in
        --list)       list_only=1 ;;
        --build-only) do_ext=0 do_rc=0 ;;
        --rc-only)    do_build=0 do_ext=0 ;;
        --skip-build) do_build=0 ;;
        --force-rc)   force_rc=1 ;;
        --ext-dir)    shift; explicit_dir="${1:?--ext-dir needs a path}" ;;
        -h|--help)    sed -n '2,18p' "$0"; exit 0 ;;
        *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
    esac
    shift
done

info() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }

# targets are handled as one path per line (paths may contain spaces,
# but never newlines)
nl='
'

# ---------------------------------------------------------------- detection

detect_ext_dirs() {
    # Linux/macOS editors + the WSL remote server: an existing parent
    # directory means that editor is actually installed
    for d in "$HOME/.vscode" "$HOME/.vscode-oss" "$HOME/.vscode-server"; do
        [ -d "$d" ] && printf '%s\n' "$d/extensions"
    done
    # WSL -> Windows editors
    if grep -qi microsoft /proc/version 2>/dev/null; then
        for d in /mnt/c/Users/*/.vscode /mnt/c/Users/*/.vscode-oss; do
            [ -d "$d" ] && printf '%s\n' "$d/extensions"
        done
    fi
    return 0
}

# Windows user profiles that own a detected editor (for the Windows-side rc)
detect_windows_homes() {
    grep -qi microsoft /proc/version 2>/dev/null || return 0
    for d in /mnt/c/Users/*/.vscode /mnt/c/Users/*/.vscode-oss; do
        [ -d "$d" ] || continue
        printf '%s\n' "$d" | sed 's|^\(/mnt/c/Users/[^/]*\)/.*|\1|'
    done | sort -u
}

if [ -n "$explicit_dir" ]; then
    targets=$explicit_dir
else
    targets=$(detect_ext_dirs | sort -u)
fi

if [ "$list_only" -eq 1 ]; then
    info "detected extension directories:"
    if [ -n "$targets" ]; then
        printf '%s\n' "$targets" | sed 's/^/  /'
    else
        echo "  (none found)"
    fi
    exit 0
fi

# ------------------------------------------------------------------- build

# The build needs the node major pinned in mise.toml; a different PATH node
# probably works, but the pin is what the extension is tested against.
req_node=$(sed -n 's/^node *= *"\([0-9][0-9]*\).*/\1/p' mise.toml 2>/dev/null || true)
req_node=${req_node:-24}

node_ok() {
    nv=$(node --version 2>/dev/null | sed -n 's/^v\([0-9][0-9]*\).*/\1/p')
    [ -n "$nv" ] && [ "$nv" -ge "$req_node" ]
}

run_build() {
    if [ ! -d node_modules ]; then
        info "installing dependencies"
        "$@" npm install --no-audit --no-fund
    fi
    info "compiling"
    "$@" npm run --silent compile
}

if [ "$do_build" -eq 1 ]; then
    info "building the extension"
    if node_ok; then
        run_build env
    elif command -v mise >/dev/null 2>&1; then
        info "no node >= $req_node on PATH — building via mise (mise.toml pins node $req_node)"
        run_build mise exec --
    else
        echo "no way to build: need node >= $req_node or mise on the PATH" >&2
        exit 1
    fi
fi

if [ "$do_ext" -eq 1 ] && [ ! -d out ]; then
    echo "no out/ directory — run without --skip-build" >&2
    exit 1
fi

# ----------------------------------------------------------------- install

installed=0
if [ "$do_ext" -eq 1 ]; then
    if [ -z "$targets" ]; then
        warn "no VS Code / VSCodium extension directory detected."
        warn "install manually: copy this folder to <editor>/extensions/$ext_id"
    fi
    old_ifs=$IFS
    IFS=$nl
    set -f
    for dir in $targets; do
        dest="$dir/$ext_id"
        mkdir -p "$dest"
        rm -rf "$dest/out"
        cp -R out "$dest/out"
        cp package.json .codemeowrc README.md LICENSE "$dest/"
        info "installed into $dest"
        installed=$((installed + 1))
    done
    set +f
    IFS=$old_ifs
fi

# --------------------------------------------------------------------- rc

install_rc() {
    if [ -f "$1" ] && [ "$force_rc" -eq 0 ]; then
        warn "$1 exists — kept (use --force-rc to overwrite)"
    else
        cp .codemeowrc "$1"
        info "installed default rc: $1"
    fi
}

if [ "$do_rc" -eq 1 ]; then
    install_rc "$HOME/.codemeowrc"
    detect_windows_homes | while IFS= read -r winhome; do
        if [ -d "$winhome" ]; then
            install_rc "$winhome/.codemeowrc"
        fi
    done
fi

# ------------------------------------------------------------------- done

echo
info "done."
if [ "$installed" -gt 0 ]; then
    echo "  * restart the editor(s) to load the extension"
fi
echo "  * disable VSCodeVim if it is enabled — both intercept typing"
echo "  * in the editor: SPC ? shows the cheatsheet, SPC c v edits ~/.codemeowrc"
