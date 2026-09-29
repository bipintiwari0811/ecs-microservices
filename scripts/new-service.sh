#!/usr/bin/env bash
# Scaffolds a new service by copying services/users.
# Usage: ./scripts/new-service.sh payments /payments 30
set -euo pipefail
NAME="${1:?usage: new-service.sh <name> <path> <priority>}"
PATHP="${2:?path e.g. /payments}"
PRIO="${3:?unique listener priority e.g. 30}"
DEST="services/$NAME"

[ -e "$DEST" ] && { echo "$DEST already exists"; exit 1; }
if grep -h '^PRIORITY=' services/*/service.conf | grep -qx "PRIORITY=$PRIO"; then
  echo "Priority $PRIO already used:"; grep -H '^PRIORITY=' services/*/service.conf; exit 1
fi

mkdir -p "$DEST"
cp -r services/users/src services/users/test services/users/Dockerfile services/users/.dockerignore \
      services/users/package.json services/users/package-lock.json "$DEST"/
sed -i "s/\"name\": \"users\"/\"name\": \"$NAME\"/" "$DEST/package.json" "$DEST/package-lock.json"
sed -i "s|'users'|'$NAME'|; s|'/users'|'$PATHP'|" "$DEST/src/config.js"
sed -i "s|/users|$PATHP|g; s|serviceName: 'users'|serviceName: '$NAME'|" "$DEST/test/app.test.js"

cat > "$DEST/service.conf" <<CONF
# Deployment settings for this service (read by the pipeline)
PATH_PATTERN=$PATHP
PRIORITY=$PRIO
PORT=3000
CPU=256
MEMORY=512
DESIRED=2
MIN=2
MAX=4
CONF

echo "Created $DEST (path $PATHP, priority $PRIO)."
echo "Edit $DEST/src/app.js, run 'cd $DEST && npm install && npm test', then commit and push."
