#!/bin/sh
# Only tool name and file basename are retained from the supplied Hook event.
FILE="$1"
STATE="$2"
PROJECT="$3"
PHASE="$4"
[ -z "$FILE" ] && exit 0
case "$STATE" in working|tool|editing|done|idle) ;; *) exit 0 ;; esac
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v python3 >/dev/null 2>&1; then
  python3 "$SCRIPT_DIR/status_signal.py" "$FILE" "$STATE" "$PROJECT" "$PHASE" 2>/dev/null || :
elif command -v python >/dev/null 2>&1; then
  python "$SCRIPT_DIR/status_signal.py" "$FILE" "$STATE" "$PROJECT" "$PHASE" 2>/dev/null || :
fi
exit 0
