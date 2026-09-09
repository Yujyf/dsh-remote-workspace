/**
 * POSIX sh helper loaded into a persistent WSL bash. Commands follow a TSV
 * protocol on stdin; responses are one TSV line on stdout. Paths and payloads
 * are base64 so the helper never interpolates user bytes.
 * @module @Yujyf/dsh-remote-workspace
 */
/**
 * Helper script written to a WSL bash stdin before protocol requests.
 * Prints `READY` once, then answers `ID\\tOP\\tPATH_B64\\tARG_B64` lines.
 */
export const WSL_HELPER_SCRIPT = `
b64enc() { if base64 -w 0 </dev/null 2>/dev/null; then base64 -w 0; else base64; fi; }
b64dec() { base64 -d 2>/dev/null || base64 -D; }
reply_ok() { printf '%s\\tOK\\t%s\\n' "$1" "$(printf '%s' "$2" | b64enc)"; }
reply_err() { printf '%s\\tERR\\t%s\\t%s\\n' "$1" "$2" "$(printf '%s' "$3" | b64enc)"; }
printf 'READY\\n'
while IFS= read -r line || [ -n "$line" ]; do
  id=\${line%%$'\\t'*}
  rest=\${line#*$'\\t'}
  op=\${rest%%$'\\t'*}
  rest=\${rest#*$'\\t'}
  path_b64=\${rest%%$'\\t'*}
  arg_b64=\${rest#*$'\\t'}
  path=$(printf '%s' "$path_b64" | b64dec)
  arg=$(printf '%s' "$arg_b64" | b64dec)
  case "$op" in
    PING)
      reply_ok "$id" "ok"
      ;;
    REALPATH)
      out=$(realpath -m -- "$path" 2>/dev/null) || { reply_err "$id" NOT_FOUND "realpath failed"; continue; }
      reply_ok "$id" "$out"
      ;;
    STAT|LSTAT)
      if [ "$op" = LSTAT ]; then
        if [ ! -e "$path" ] && [ ! -L "$path" ]; then reply_err "$id" NOT_FOUND ""; continue; fi
        if [ -L "$path" ]; then kind=symlink
        elif [ -f "$path" ]; then kind=file
        elif [ -d "$path" ]; then kind=directory
        else kind=other
        fi
      else
        if [ ! -e "$path" ]; then reply_err "$id" NOT_FOUND ""; continue; fi
        if [ -f "$path" ]; then kind=file
        elif [ -d "$path" ]; then kind=directory
        else kind=other
        fi
      fi
      size=$(stat -c '%s' -- "$path" 2>/dev/null || printf '0')
      mtime=$(stat -c '%Y' -- "$path" 2>/dev/null || printf '0')
      ino=$(stat -c '%i' -- "$path" 2>/dev/null || printf '0')
      mode=$(stat -c '%a' -- "$path" 2>/dev/null || printf '0')
      reply_ok "$id" "$(printf '%s\\t%s\\t%s\\t%s\\t%s' "$kind" "$size" "$mtime" "$ino" "$mode")"
      ;;
    LIST)
      if [ ! -d "$path" ]; then reply_err "$id" NOT_DIRECTORY ""; continue; fi
      out=$(find "$path" -mindepth 1 -maxdepth 1 -printf '%f\\t%y\\t%s\\n' 2>/dev/null | LC_ALL=C sort)
      reply_ok "$id" "$out"
      ;;
    READ)
      if [ ! -f "$path" ]; then reply_err "$id" NOT_FOUND ""; continue; fi
      printf '%s\\tOK\\t%s\\n' "$id" "$(b64enc < "$path")"
      ;;
    WRITE)
      dir=$(dirname -- "$path")
      mkdir -p -- "$dir" || { reply_err "$id" PERMISSION_DENIED "mkdir failed"; continue; }
      tmp=$(mktemp -- "$dir/.dsh-XXXXXX" 2>/dev/null) || tmp="$path.dsh-tmp-$$"
      printf '%s' "$arg_b64" | b64dec > "$tmp" || { rm -f -- "$tmp"; reply_err "$id" FILESYSTEM_FAILED "write failed"; continue; }
      mv -f -- "$tmp" "$path" || { rm -f -- "$tmp"; reply_err "$id" PERMISSION_DENIED "rename failed"; continue; }
      reply_ok "$id" ""
      ;;
    MKDIR)
      mkdir -p -- "$path" || { reply_err "$id" PERMISSION_DENIED "mkdir failed"; continue; }
      reply_ok "$id" ""
      ;;
    READRANGE)
      if [ ! -f "$path" ]; then reply_err "$id" NOT_FOUND ""; continue; fi
      offset=\${arg%%:*}
      length=\${arg##*:}
      out=$(dd if="$path" iflag=skip_bytes,count_bytes skip="$offset" count="$length" bs=65536 2>/dev/null | b64enc) \
        || { reply_err "$id" FILESYSTEM_FAILED "read range failed"; continue; }
      reply_ok "$id" "$out"
      ;;
    WHICH)
      out=$(command -v -- "$path" 2>/dev/null) || { reply_err "$id" NOT_FOUND ""; continue; }
      reply_ok "$id" "$out"
      ;;
    ENV)
      out=$(printf 'os=%s\\narch=%s\\nshell=%s\\nhome=%s\\npwd=%s' "$(uname -s)" "$(uname -m)" "\${SHELL:-/bin/sh}" "\${HOME:-}" "$(pwd)")
      reply_ok "$id" "$out"
      ;;
    *)
      reply_err "$id" UNSUPPORTED "$op"
      ;;
  esac
done
`;
//# sourceMappingURL=wsl-helper.js.map