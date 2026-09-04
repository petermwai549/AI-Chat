#!/usr/bin/env bash
#
# scripts/dev.sh
#
# Convenience wrapper around the frontend dev container. Meant to be aliased
# (see bottom of this file) so starting/stopping it around work sessions is
# a one-word command instead of remembering docker compose flags.

set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker-compose.yml"

case "${1:-}" in
  up|start)
    docker compose -f "$COMPOSE_FILE" start frontend
    echo "frontend is up: http://localhost:5270"
    ;;
  down|stop)
    docker compose -f "$COMPOSE_FILE" stop frontend
    echo "frontend stopped"
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps frontend
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f frontend
    ;;
  *)
    echo "usage: $(basename "$0") {up|down|status|logs}"
    exit 1
    ;;
esac

# -----------------------------------------------------------------------------
# Add these aliases to ~/.bashrc so this is a one-word command from anywhere:
#
#   alias devup="~/Project/microservices-ecosystem/scripts/dev.sh up"
#   alias devdown="~/Project/microservices-ecosystem/scripts/dev.sh down"
#   alias devstatus="~/Project/microservices-ecosystem/scripts/dev.sh status"
#
# Then: source ~/.bashrc
# -----------------------------------------------------------------------------
