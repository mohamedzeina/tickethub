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

# Preflight — catch the failures that are silent or misleading at runtime:
# a missing hosts entry (every request 404s), no ingress controller (nothing
# routes at all), or a missing secret/key (pods sit in CreateContainerConfigError
# with no hint as to which key). Set SKIP_PREFLIGHT=1 to bypass.
ok=0
fail() {
	printf '  \033[31m✖\033[0m %s\n' "$1" >&2
	ok=1
}

# secret name → the keys the manifests actually read from it
secret_specs=(
	"jwt-secret|JWT_KEY"
	"mongo-secret|AUTH_MONGO_URI TICKETS_MONGO_URI ORDERS_MONGO_URI PAYMENTS_MONGO_URI NOTIFICATIONS_MONGO_URI REVIEWS_MONGO_URI ADMISSION_MONGO_URI WISHLISTS_MONGO_URI"
	"stripe-secret|STRIPE_KEY STRIPE_WEBHOOK_SECRET STRIPE_PUBLISHABLE_KEY"
	"cloudinary-secret|CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET"
	"admission-secret|PASS_SIGNING_SECRET GATE_API_KEY"
	"grafana-admin|admin-password"
)

preflight() {
	echo "Preflight…"

	# 1) hosts entry — the ingress rule is host-scoped to tickethub.com.
	if grep -qE '^[^#]*[[:space:]]tickethub\.com([[:space:]]|$)' /etc/hosts; then
		echo "  ✓ /etc/hosts maps tickethub.com"
	else
		fail "/etc/hosts has no tickethub.com entry — add:  127.0.0.1 tickethub.com"
	fi

	# 2) cluster reachable — everything below needs it, and so does skaffold.
	if ! kubectl cluster-info --request-timeout=5s >/dev/null 2>&1; then
		fail "no reachable cluster — is Kubernetes enabled in Docker Desktop?"
		return
	fi
	echo "  ✓ cluster reachable"

	# 3) ingress-nginx — without a controller the Ingress object does nothing.
	if kubectl get deploy -n ingress-nginx ingress-nginx-controller >/dev/null 2>&1; then
		echo "  ✓ ingress-nginx installed"
	else
		fail "ingress-nginx not found — install it (see README) or the ingress won't route"
	fi

	# 4) secrets: present AND holding every key the deployments reference.
	for spec in "${secret_specs[@]}"; do
		local name="${spec%%|*}" keys="${spec#*|}" missing=()
		if ! kubectl get secret "$name" >/dev/null 2>&1; then
			local args=""
			for key in $keys; do args+=" --from-literal=$key=<value>"; done
			fail "secret '$name' missing — kubectl create secret generic $name$args"
			continue
		fi
		for key in $keys; do
			if [ -z "$(kubectl get secret "$name" -o "jsonpath={.data.$key}" 2>/dev/null)" ]; then
				missing+=("$key")
			fi
		done
		if [ ${#missing[@]} -gt 0 ]; then
			fail "secret '$name' exists but is missing: ${missing[*]} (delete and recreate it with every key)"
		else
			echo "  ✓ secret $name"
		fi
	done
}

# `dev.sh --check` runs the preflight alone and exits — useful for verifying a
# fresh machine without starting the stack.
if [ "${1:-}" = "--check" ]; then
	preflight
	exit "$ok"
fi

if [ "${SKIP_PREFLIGHT:-0}" = "1" ]; then
	echo "Preflight skipped (SKIP_PREFLIGHT=1)."
else
	preflight
	if [ "$ok" -ne 0 ]; then
		echo >&2
		echo "Preflight failed — fix the above, or re-run with SKIP_PREFLIGHT=1 to start anyway." >&2
		exit 1
	fi
fi

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

# 3) stripe listen — --skip-verify because the dev ingress serves a self-signed
# cert for tickethub.com; without it the CLI refuses to POST the webhook (TLS
# x509 error) and paid orders never complete.
stripe listen --skip-verify --forward-to "$WEBHOOK_URL" 2>&1 | prefix "stripe" "33" &
pids+=("$!")

echo "  • skaffold dev"
echo "  • mailpit  → http://localhost:${MAILPIT_PORT}"
echo "  • stripe   → ${WEBHOOK_URL}"

# Wait for any process to exit, then tear the rest down.
wait -n 2>/dev/null || wait
cleanup
