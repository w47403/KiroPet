#!/bin/sh
# Safe fire-and-forget notification; no prompt data, file content, or tool args are read.
FILE="$1"
STATE="$2"
PROJECT="$3"
[ -z "$FILE" ] && exit 0
STAMP="$(date +%s 2>/dev/null)000"
case "$STAMP" in *[!0-9]*) STAMP=0 ;; esac
TMP="${FILE}.$$"
( printf '{"state":"%s","project":"%s","at":%s}\n' "$STATE" "$PROJECT" "$STAMP" > "$TMP" && mv -f "$TMP" "$FILE" ) 2>/dev/null || :
exit 0
