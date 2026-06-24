#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${HOT_PRODUCTS_REPO_DIR:-/home/ec2-user/overseas-ecommerce-hot-products-monitor}"
SERVICE="${HOT_PRODUCTS_TUNNEL_SERVICE:-overseas-ecommerce-monitor-tunnel.service}"
URL_FILE="${HOT_PRODUCTS_TUNNEL_URL_FILE:-/var/lib/overseas-ecommerce-monitor/current-tunnel-url}"
METRICS_URL="${HOT_PRODUCTS_TUNNEL_METRICS_URL:-http://127.0.0.1:20243/metrics}"
WAIT_SECONDS="${HOT_PRODUCTS_TUNNEL_WAIT_SECONDS:-120}"
CONFIG_FILE="$REPO_DIR/public/config.json"

extract_url() {
  journalctl -u "$SERVICE" -b --no-pager \
    | grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' \
    | tail -1
}

extract_metrics_url() {
  curl -fsS --max-time 5 "$METRICS_URL" 2>/dev/null \
    | grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' \
    | tail -1
}

extract_config_url() {
  if [ ! -f "$CONFIG_FILE" ]; then
    return 0
  fi
  python3 - "$CONFIG_FILE" <<'PYCONFIG'
from pathlib import Path
import json
import sys

try:
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except Exception:
    config = {}
print(str(config.get("defaultApiBase", "")).rstrip("/"))
PYCONFIG
}

check_url() {
  local candidate="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$candidate/health" || true)"
  [ "$code" = "200" ]
}

candidate_urls() {
  extract_metrics_url || true
  extract_url || true
  if [ -f "$URL_FILE" ]; then
    sed -n '1p' "$URL_FILE"
  fi
  extract_config_url || true
}

deadline=$((SECONDS + WAIT_SECONDS))
url=""
while [ "$SECONDS" -lt "$deadline" ]; do
  while IFS= read -r candidate; do
    candidate="${candidate%/}"
    if [ -n "$candidate" ] && check_url "$candidate"; then
      url="$candidate"
      break 2
    fi
  done < <(candidate_urls | awk 'NF && !seen[$0]++')
  sleep 3
done

if [ -z "$url" ]; then
  echo "No active Cloudflare tunnel URL found for $SERVICE" >&2
  exit 1
fi

mkdir -p "$(dirname "$URL_FILE")"
printf '%s\n' "$url" > "$URL_FILE"

cd "$REPO_DIR"
git pull --ff-only origin main

current_url="$(extract_config_url)"
if [ "$current_url" = "$url" ]; then
  echo "GitHub Pages already points to $url"
  exit 0
fi

python3 - "$CONFIG_FILE" "$url" <<'PYUPDATE'
from pathlib import Path
import json
import sys

config_path = Path(sys.argv[1])
url = sys.argv[2].rstrip("/")
config_path.parent.mkdir(parents=True, exist_ok=True)
config_path.write_text(
    json.dumps({"defaultApiBase": url}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
PYUPDATE

if git diff --quiet -- public/config.json && git ls-files --error-unmatch public/config.json >/dev/null 2>&1; then
  echo "GitHub Pages already points to $url"
  exit 0
fi

git add public/config.json
git commit -m "Update backend tunnel URL"
git push origin main
echo "Updated GitHub Pages backend URL to $url"
