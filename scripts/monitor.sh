#!/usr/bin/env bash
#
# monitor.sh — port-forward the four observability dashboards in one terminal:
#   • Grafana       http://localhost:3000   (anonymous Viewer is enabled)
#   • Prometheus    http://localhost:9090
#   • Jaeger        http://localhost:16686
#   • Alertmanager  http://localhost:9093
#
# None of these are exposed through the ingress on purpose — they're
# port-forward only. Output is prefixed per stream; Ctrl+C stops everything.
#
# Ports are overridable (e.g. GRAFANA_PORT=3001) since Grafana's 3000 collides
# with anything else you might be running locally.

set -uo pipefail

GRAFANA_PORT="${GRAFANA_PORT:-3000}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
JAEGER_PORT="${JAEGER_PORT:-16686}"
ALERTMANAGER_PORT="${ALERTMANAGER_PORT:-9093}"

# svc:local_port:remote_port:color
targets=(
	"grafana-srv:${GRAFANA_PORT}:3000:36"
	"prometheus-srv:${PROMETHEUS_PORT}:9090:35"
	"jaeger-srv:${JAEGER_PORT}:16686:33"
	"alertmanager-srv:${ALERTMANAGER_PORT}:9093:32"
)

prefix() {
	local label="$1" color="$2"
	while IFS= read -r line; do
		printf '\033[%sm[%s]\033[0m %s\n' "$color" "$label" "$line"
	done
}

pids=()

cleanup() {
	trap '' INT TERM
	echo
	echo "Stopping port-forwards…"
	for pid in "${pids[@]}"; do
		pkill -P "$pid" 2>/dev/null || true
		kill "$pid" 2>/dev/null || true
	done
	pkill -P $$ 2>/dev/null || true
	# The retry loops respawn kubectl as grandchildren — make sure they're gone.
	for target in "${targets[@]}"; do
		IFS=: read -r svc local_port remote_port _ <<<"$target"
		pkill -f "kubectl port-forward svc/${svc} ${local_port}:${remote_port}" 2>/dev/null || true
	done
	wait 2>/dev/null || true
	exit 0
}
trap cleanup INT TERM

if ! command -v kubectl >/dev/null 2>&1; then
	echo "✖ 'kubectl' not found on PATH. Install it and try again." >&2
	exit 1
fi

if ! kubectl cluster-info --request-timeout=5s >/dev/null 2>&1; then
	echo "✖ No reachable cluster. Start the stack first (npm run dev)." >&2
	exit 1
fi

echo "Forwarding dashboards (Ctrl+C to stop everything)…"

for target in "${targets[@]}"; do
	IFS=: read -r svc local_port remote_port color <<<"$target"
	# Same retry approach as dev.sh: kubectl is noisy while a pod is restarting,
	# so drop its stderr and print one concise status line per retry instead.
	(
		announced=0
		while true; do
			started=$SECONDS
			kubectl port-forward "svc/${svc}" "${local_port}:${remote_port}" 2>/dev/null
			if [ $((SECONDS - started)) -ge 3 ]; then
				announced=0
			fi
			if [ "$announced" -eq 0 ]; then
				echo "waiting for ${svc}… (retrying every 2s)"
				announced=1
			fi
			sleep 2
		done
	) | prefix "${svc%-srv}" "$color" &
	pids+=("$!")
done

echo "  • grafana      → http://localhost:${GRAFANA_PORT}"
echo "  • prometheus   → http://localhost:${PROMETHEUS_PORT}"
echo "  • jaeger       → http://localhost:${JAEGER_PORT}"
echo "  • alertmanager → http://localhost:${ALERTMANAGER_PORT}"

wait -n 2>/dev/null || wait
cleanup
