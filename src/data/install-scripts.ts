import { createHash } from "node:crypto";
import { CLI_ASSETS, LATEST_VERSION, type ReleaseChecksums, releases } from "./releases";

const SHA256_RE = /^[0-9a-f]{64}$/;

export function getLatestChecksums(): ReleaseChecksums {
	const latest = releases.find((r) => r.version === LATEST_VERSION);
	if (!latest?.checksums) {
		throw new Error(`Missing checksums for latest release ${LATEST_VERSION}`);
	}
	for (const asset of CLI_ASSETS) {
		const hash = latest.checksums[asset];
		if (!hash || !SHA256_RE.test(hash)) {
			throw new Error(`Invalid or missing SHA-256 for ${asset} in ${LATEST_VERSION}`);
		}
	}
	return latest.checksums;
}

export function renderInstallSh(version: string, checksums: ReleaseChecksums): string {
	return `#!/bin/sh
# Install bunpo on Linux or macOS.
# Source: https://bunpo.org/install
set -eu

PINNED_VERSION='${version}'
REPO='nuggocto/bunpo'

usage() {
	cat <<'EOF'
Usage: install.sh [--version vX.Y.Z] [--bin-dir DIR] [--help]

Install the bunpo CLI for Linux or macOS.
  --version TAG   Install a specific release tag (default: ${version})
  --bin-dir DIR   Install directory, absolute path (default: $HOME/.local/bin)
  --help          Show this help
EOF
}

fail() {
	printf 'error: %s\\n' "$1" >&2
	exit 1
}

version="$PINNED_VERSION"
bin_dir=""

while [ "$#" -gt 0 ]; do
	case "$1" in
		--help|-h)
			usage
			exit 0
			;;
		--version)
			[ "$#" -ge 2 ] || { usage >&2; exit 2; }
			version="$2"
			shift 2
			;;
		--version=*)
			version="\${1#--version=}"
			shift
			;;
		--bin-dir)
			[ "$#" -ge 2 ] || { usage >&2; exit 2; }
			bin_dir="$2"
			shift 2
			;;
		--bin-dir=*)
			bin_dir="\${1#--bin-dir=}"
			shift
			;;
		*)
			usage >&2
			exit 2
			;;
	esac
done

nl='
'
case "$version" in
	*"$nl"*) fail "invalid version: $version (expected vX.Y.Z or vX.Y.Z-rc.N)" ;;
esac
if ! printf '%s\\n' "$version" | grep -Eq '^v[0-9]+\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$'; then
	fail "invalid version: $version (expected vX.Y.Z or vX.Y.Z-rc.N)"
fi

if [ -z "$bin_dir" ]; then
	[ -n "\${HOME:-}" ] || fail "HOME is not set; pass --bin-dir DIR"
	bin_dir="$HOME/.local/bin"
fi
case "$bin_dir" in
	/*) ;;
	*) fail "--bin-dir must be an absolute path: $bin_dir" ;;
esac

os_raw=$(uname -s)
case "$os_raw" in
	Linux) os='linux' ;;
	Darwin) os='darwin' ;;
	*) fail "unsupported OS: $os_raw (expected Linux or Darwin)" ;;
esac

arch_raw=$(uname -m)
case "$arch_raw" in
	x86_64|amd64) arch='amd64' ;;
	aarch64|arm64) arch='arm64' ;;
	*) fail "unsupported architecture: $arch_raw (expected amd64 or arm64)" ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required"

asset="bunpo-\${os}-\${arch}"
base_url="https://github.com/\${REPO}/releases/download/\${version}"

tmp_dir=""
staged=""
cleanup() {
	if [ -n "$staged" ]; then
		rm -f "$staged"
		staged=""
	fi
	if [ -n "$tmp_dir" ]; then
		rm -rf "$tmp_dir"
		tmp_dir=""
	fi
}
trap cleanup EXIT HUP INT TERM

tmp_dir=$(mktemp -d) || fail "could not create temporary directory"

download() {
	curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 -o "$2" "$1" ||
		fail "failed to download $1"
}

download "\${base_url}/\${asset}" "\${tmp_dir}/\${asset}"

want=""
if [ "$version" = "$PINNED_VERSION" ]; then
	case "$asset" in
		bunpo-linux-amd64) want='${checksums["bunpo-linux-amd64"]}' ;;
		bunpo-linux-arm64) want='${checksums["bunpo-linux-arm64"]}' ;;
		bunpo-darwin-amd64) want='${checksums["bunpo-darwin-amd64"]}' ;;
		bunpo-darwin-arm64) want='${checksums["bunpo-darwin-arm64"]}' ;;
		*) fail "no pinned checksum for $asset" ;;
	esac
else
	download "\${base_url}/SHA256SUMS" "\${tmp_dir}/SHA256SUMS"
	want=$(awk -v f="$asset" '$2 == f { print $1; exit }' "\${tmp_dir}/SHA256SUMS")
	[ -n "$want" ] || fail "checksum for $asset not found in SHA256SUMS for $version"
fi

if ! printf '%s\\n' "$want" | grep -Eq '^[0-9a-f]{64}$'; then
	fail "invalid checksum format for $asset: $want"
fi

if command -v sha256sum >/dev/null 2>&1; then
	got=$(sha256sum < "\${tmp_dir}/\${asset}" | awk '{ print $1 }')
elif command -v shasum >/dev/null 2>&1; then
	got=$(shasum -a 256 < "\${tmp_dir}/\${asset}" | awk '{ print $1 }')
else
	fail "sha256sum or shasum is required to verify the download"
fi

if [ "$want" != "$got" ]; then
	fail "checksum mismatch for $asset ($version): expected $want, got $got"
fi

chmod 755 "\${tmp_dir}/\${asset}" || fail "could not mark downloaded binary executable"
got_version=$("\${tmp_dir}/\${asset}" --version 2>/dev/null) || fail "downloaded binary failed --version check"
if [ "$got_version" != "bunpo $version" ]; then
	fail "unexpected version output: got '$got_version', want 'bunpo $version'"
fi

mkdir -p "$bin_dir" || fail "could not create $bin_dir"
target="\${bin_dir}/bunpo"
if [ -L "$target" ] || { [ -e "$target" ] && [ ! -f "$target" ]; }; then
	fail "$target exists and is not a regular file"
fi

staged=$(mktemp "\${bin_dir}/.bunpo.tmp.XXXXXX") || fail "could not stage file in $bin_dir"
cp "\${tmp_dir}/\${asset}" "$staged" || fail "could not copy binary into $bin_dir"
chmod 755 "$staged" || fail "could not set permissions on staged binary"
mv -f "$staged" "$target" || fail "could not move binary into place at $target"
staged=""

printf 'Installed bunpo %s to %s\\n' "$version" "$target"
case ":\${PATH:-}:" in
	*":\${bin_dir}:"*) ;;
	*) printf 'Add to PATH: export PATH="%s:%s"\\n' "$bin_dir" "\\$PATH" ;;
esac
`;
}

export function renderInstallPs1(version: string, checksums: ReleaseChecksums): string {
	return `# Install bunpo on Windows (PowerShell 5.1+).
# Source: https://bunpo.org/install
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$pinnedVersion = "${version}"
$repo = "nuggocto/bunpo"
$version = if ($env:BUNPO_VERSION) { $env:BUNPO_VERSION.Trim() } else { $pinnedVersion }

if ($version -cnotmatch '^v[0-9]+\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$') {
	throw "Invalid BUNPO_VERSION '$version' (expected vX.Y.Z or vX.Y.Z-rc.N)"
}

$archRaw = $env:PROCESSOR_ARCHITECTURE
switch ($archRaw) {
	"AMD64" { $arch = "amd64" }
	"ARM64" { $arch = "arm64" }
	default { throw "Unsupported architecture: $archRaw (expected AMD64 or ARM64)" }
}

$asset = "bunpo-windows-$arch.exe"
$baseUrl = "https://github.com/$repo/releases/download/$version"
$pinnedChecksums = @{
	"bunpo-windows-amd64.exe" = "${checksums["bunpo-windows-amd64.exe"]}"
	"bunpo-windows-arm64.exe" = "${checksums["bunpo-windows-arm64.exe"]}"
}

$binDir = Join-Path $env:USERPROFILE "bin"
$target = Join-Path $binDir "bunpo.exe"
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("bunpo-install-" + [System.Guid]::NewGuid().ToString("N"))
$staged = $null

try {
	New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
	$downloaded = Join-Path $tmpDir $asset
	Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$asset" -OutFile $downloaded

	$expected = $null
	if ($version -ceq $pinnedVersion) {
		$expected = $pinnedChecksums[$asset]
	} else {
		$sumsPath = Join-Path $tmpDir "SHA256SUMS"
		Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHA256SUMS" -OutFile $sumsPath
		foreach ($line in (Get-Content -LiteralPath $sumsPath)) {
			$parts = $line.Trim() -split '\\s+'
			if ($parts.Length -eq 2 -and $parts[1] -ceq $asset) {
				$expected = $parts[0]
				break
			}
		}
		if (-not $expected) {
			throw "Checksum for $asset not found in SHA256SUMS for $version"
		}
	}

	if ($expected -cnotmatch '^[0-9a-f]{64}$') {
		throw "Invalid checksum format for $asset: $expected"
	}

	$actual = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash.ToLowerInvariant()
	if ($actual -cne $expected) {
		throw "Checksum mismatch for $asset ($version): expected $expected, got $actual"
	}

	$gotVersion = (& $downloaded --version | Out-String).Trim()
	if ($LASTEXITCODE -ne 0 -or $gotVersion -cne "bunpo $version") {
		throw "Unexpected version output: got '$gotVersion', want 'bunpo $version'"
	}

	New-Item -ItemType Directory -Path $binDir -Force | Out-Null
	if (Test-Path -LiteralPath $target -PathType Container) {
		throw "$target exists and is a directory"
	}

	$staged = Join-Path $binDir (".bunpo.tmp." + [System.Guid]::NewGuid().ToString("N") + ".exe")
	Copy-Item -LiteralPath $downloaded -Destination $staged -Force
	Move-Item -LiteralPath $staged -Destination $target -Force
	$staged = $null

	Write-Output "Installed bunpo $version to $target"
	$normBin = $binDir.TrimEnd('\\')
	$onPath = $false
	if ($env:PATH) {
		foreach ($entry in ($env:PATH -split ';')) {
			if ($entry.Trim().TrimEnd('\\') -ieq $normBin) {
				$onPath = $true
				break
			}
		}
	}
	if (-not $onPath) {
		Write-Output "Add to PATH: [Environment]::SetEnvironmentVariable('Path', '$binDir;' + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')"
	}
} finally {
	if ($staged -and (Test-Path -LiteralPath $staged)) {
		Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue
	}
	if (Test-Path -LiteralPath $tmpDir) {
		Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
	}
}
`;
}

function sha256Hex(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

const latestChecksums = getLatestChecksums();

export const INSTALL_SH = renderInstallSh(LATEST_VERSION, latestChecksums);
export const INSTALL_PS1 = renderInstallPs1(LATEST_VERSION, latestChecksums);
export const INSTALL_SH_SHA256 = sha256Hex(INSTALL_SH);
export const INSTALL_PS1_SHA256 = sha256Hex(INSTALL_PS1);
