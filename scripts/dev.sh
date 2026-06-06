#!/usr/bin/env bash
#
# dev.sh — start the full local dev stack in one terminal:
#   • skaffold dev      (build + deploy + live-reload)
#   • mailpit port-forward   (http://localhost:8025)
#   • stripe listen          (forward webhooks to the cluster)
#
# Output from all three is prefixed and interleaved. Ctrl+C stops everything.

set -uo pipefail

WEBHOOK_URL="${WEBHOOK_URL:-https://tickethub.com/api/payments/webhook}"
MAILPIT_PORT="${MAILPIT_PORT:-8025}"

# Colored, prefixed log lines so you can tell the three streams apart.
prefix() {
	local label="$1" color="$2"
	while IFS= read -r line; do
		printf '\033[%sm[%s]\033[0m %s\n' "$color" "$label" "$line"
	done
}

pids=()

cleanup() {
	trap '' INT TERM   # ignore further signals while we tear down
	echo
	echo "Shutting down dev stack…"
	# Kill every child this script started. For a pipeline (cmd | prefix), $!
	# only tracks the tail, so signal all direct children, then their kids.
	for pid in "${pids[@]}"; do
		pkill -P "$pid" 2>/dev/null || true
		kill "$pid" 2>/dev/null || true
	done
	pkill -P $$ 2>/dev/null || true
	# The retry loop respawns kubectl as a grandchild — make sure it's gone.
	pkill -f "kubectl port-forward svc/mailpit-srv ${MAILPIT_PORT}:${MAILPIT_PORT}" 2>/dev/null || true
	wait 2>/dev/null || true
	exit 0
}
trap cleanup INT TERM

# Fail fast if a required CLI is missing.
for cmd in skaffold kubectl stripe; do
	if ! command -v "$cmd" >/dev/null 2>&1; then
		echo "✖ '$cmd' not found on PATH. Install it and try again." >&2
		exit 1
	fi
done

echo "Starting dev stack (Ctrl+C to stop everything)…"

# 1) skaffold dev
skaffold dev 2>&1 | prefix "skaffold" "36" &
pids+=("$!")

# 2) mailpit port-forward — retry so it reconnects if the pod restarts.
# kubectl's stderr is very noisy while the cluster is unreachable, so we drop it
# and print one concise status line per retry instead.
(
	announced=0
	while true; do
		started=$SECONDS
		kubectl port-forward "svc/mailpit-srv" "${MAILPIT_PORT}:${MAILPIT_PORT}" 2>/dev/null
		# If it ran for a while it was a real connection that dropped — report it.
		if [ $((SECONDS - started)) -ge 3 ]; then
			announced=0
		fi
		if [ "$announced" -eq 0 ]; then
			echo "waiting for cluster / mailpit-srv… (retrying every 2s)"
			announced=1
		fi
		sleep 2
	done
) | prefix "mailpit" "35" &
pids+=("$!")

# 3) stripe listen
stripe listen --forward-to "$WEBHOOK_URL" 2>&1 | prefix "stripe" "33" &
pids+=("$!")

echo "  • skaffold dev"
echo "  • mailpit  → http://localhost:${MAILPIT_PORT}"
echo "  • stripe   → ${WEBHOOK_URL}"

# Wait for any process to exit, then tear the rest down.
wait -n 2>/dev/null || wait
cleanup
