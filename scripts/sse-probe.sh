#!/bin/bash
# SSE probe for /api/ai/chat — prints meta/status events and the done payload
URL="${1:-http://localhost:3000/api/ai/chat}"
BODY="$2"
curl -sN -X POST "$URL" \
  -H "content-type: application/json" \
  -d "$BODY" | awk '
    /^event: status/ { getline d; print "STATUS " d }
    /^event: meta/   { getline d; print "META " d }
    /^event: error/  { getline d; print "ERROR " d }
    /^event: done/   { getline d; print "DONE " substr(d, 1, 500) }
  '
echo "--- stream end ---"
