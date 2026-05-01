#!/usr/bin/env bash
# Provision the customer-support Azure AI Search index.
# Usage:
#   AZURE_SEARCH_ENDPOINT=https://<svc>.search.windows.net \
#   AZURE_SEARCH_KEY=<admin-key> \
#   ./scripts/azure-search-setup.sh
#
# Re-running this script is safe: it uses POST /indexes (creates if absent,
# fails on conflict). Pass --update to replace an existing index.

set -euo pipefail

INDEX_NAME="${AZURE_SEARCH_INDEX:-customer-support}"
API_VERSION="2024-07-01"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/azure-search-index.json"

if [[ -z "${AZURE_SEARCH_ENDPOINT:-}" || -z "${AZURE_SEARCH_KEY:-}" ]]; then
    echo "ERROR: AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_KEY must be set" >&2
    exit 2
fi

if [[ ! -f "${SCHEMA_FILE}" ]]; then
    echo "ERROR: schema file not found at ${SCHEMA_FILE}" >&2
    exit 2
fi

METHOD="POST"
URL="${AZURE_SEARCH_ENDPOINT%/}/indexes?api-version=${API_VERSION}"
if [[ "${1:-}" == "--update" ]]; then
    METHOD="PUT"
    URL="${AZURE_SEARCH_ENDPOINT%/}/indexes/${INDEX_NAME}?api-version=${API_VERSION}"
fi

echo "Provisioning index '${INDEX_NAME}' via ${METHOD}..."
curl -sS -X "${METHOD}" "${URL}" \
    -H "Content-Type: application/json" \
    -H "api-key: ${AZURE_SEARCH_KEY}" \
    --data "@${SCHEMA_FILE}" \
    | python3 -m json.tool
echo "Done."
