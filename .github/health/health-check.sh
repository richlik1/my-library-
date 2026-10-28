#!/usr/bin/env bash
# Weekly repository health report. Read-only: it installs, builds and tests a
# fresh checkout, reads CI and pull-request state through the GitHub API, and
# scans for committed secrets. It never deploys, pushes, merges or calls a
# paid service.
#
# Configured by the workflow through environment variables:
#   HEALTH_APP_DIR      directory holding package.json ("." by default; "" = no app)
#   HEALTH_INSTALL      install command, run in HEALTH_APP_DIR ("" = skip)
#   HEALTH_CHECKS       newline-separated "Label::command" pairs, run in HEALTH_APP_DIR
#   HEALTH_AUDIT        "npm" (npm audit of production deps) or "" (skip)
#   HEALTH_SELF         this workflow's name, left out of the CI table
#   GH_TOKEN, GITHUB_REPOSITORY   for the API sections (skipped when absent)
#   GITLEAKS            path to a gitleaks binary (secret scan skipped when absent)
#
# Writes the report to $HEALTH_REPORT (default health-report.md) and exits 1
# when any line is FAIL, so a red run means "something needs a person".
set -uo pipefail

REPORT=${HEALTH_REPORT:-health-report.md}
APP_DIR=${HEALTH_APP_DIR-.}
SELF=${HEALTH_SELF:-Repository health}
LOGDIR=${HEALTH_LOGDIR:-health-logs}
mkdir -p "$LOGDIR"
LOGDIR=$(cd "$LOGDIR" && pwd)
ROOT=$(pwd)
fails=0; warns=0
rows=()

row() { # status, area, detail
  rows+=("| $1 | $2 | $3 |")
  case "$1" in FAIL) fails=$((fails + 1)) ;; WARN) warns=$((warns + 1)) ;; esac
}
esc() { tr '\n|' ' /' | cut -c1-300; }

default_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
default_branch=${default_branch:-${HEALTH_DEFAULT_BRANCH:-main}}
head_sha=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

# ------------------------------------------------------------------ GitHub state
if [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  if runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?branch=$default_branch&status=completed&per_page=100" 2>"$LOGDIR/gh-runs.err"); then
    # Latest conclusion per workflow, plus how many runs in a row it has failed.
    summary=$(echo "$runs" | jq -r --arg self "$SELF" '
      [.workflow_runs[] | select(.name != $self)] | group_by(.name)[] |
      (sort_by(.created_at) | reverse) as $r |
      {name: $r[0].name, last: $r[0].conclusion, when: $r[0].created_at[0:10],
       streak: ([$r[] | .conclusion] | (map(. == "failure") | index(false)) // length),
       url: $r[0].html_url} |
      "\(.name)\t\(.last)\t\(.streak)\t\(.when)\t\(.url)"')
    if [ -z "$summary" ]; then
      row SKIP "CI on \`$default_branch\`" "no completed workflow runs in the last 100"
    fi
    while IFS=$'\t' read -r name last streak when url; do
      [ -z "$name" ] && continue
      if [ "$last" = "failure" ]; then
        row FAIL "Workflow: $name" "last run failed ($when); the last $streak runs read all failed on \`$default_branch\` · [run]($url)"
      elif [ "$last" = "success" ]; then
        row PASS "Workflow: $name" "last run passed ($when)"
      else
        row WARN "Workflow: $name" "last run: $last ($when) · [run]($url)"
      fi
    done <<< "$summary"
  else
    row WARN "CI on \`$default_branch\`" "could not read workflow runs: $(esc < "$LOGDIR/gh-runs.err")"
  fi

  if prs=$(gh api "repos/$GITHUB_REPOSITORY/pulls?state=open&per_page=100" 2>"$LOGDIR/gh-prs.err"); then
    now=$(date -u +%s)
    count=$(echo "$prs" | jq length)
    oldest=$(echo "$prs" | jq -r '[.[].created_at] | sort | first // empty')
    if [ "$count" = "0" ]; then
      row PASS "Open pull requests" "none"
    else
      age=$(( (now - $(date -u -d "$oldest" +%s)) / 86400 ))
      stale=$(echo "$prs" | jq --argjson now "$now" '[.[] | select(($now - (.created_at | fromdateiso8601)) > 14*86400)] | length')
      list=$(echo "$prs" | jq -r '[.[] | "#\(.number)"] | join(" ")')
      status=PASS
      { [ "$count" -gt 5 ] || [ "$stale" -gt 0 ]; } && status=WARN
      row "$status" "Open pull requests" "$count open, oldest $age days, $stale older than 14 days: $list"
    fi
  else
    row WARN "Open pull requests" "could not read: $(esc < "$LOGDIR/gh-prs.err")"
  fi
else
  row SKIP "CI and pull requests" "no GH_TOKEN (local run)"
fi

# ------------------------------------------------------------------ committed env files
envs=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.(example|sample|template)$' || true)
if [ -n "$envs" ]; then
  row WARN "Committed .env files" "$(echo "$envs" | tr '\n' ' ')· check they hold only public values"
else
  row PASS "Committed .env files" "none"
fi

# ------------------------------------------------------------------ secret scan
if [ -n "${GITLEAKS:-}" ] && [ -x "${GITLEAKS}" ]; then
  # --redact: findings are reported by rule, file and commit, never by value.
  "$GITLEAKS" git --no-banner --redact --exit-code 0 \
    --report-format json --report-path "$LOGDIR/gitleaks.json" . >"$LOGDIR/gitleaks.log" 2>&1
  if [ -s "$LOGDIR/gitleaks.json" ]; then
    n=$(jq length "$LOGDIR/gitleaks.json")
    if [ "$n" = "0" ]; then
      row PASS "Secret scan (gitleaks, full history)" "no findings"
    else
      where=$(jq -r '[.[] | "\(.RuleID) in \(.File) @\(.Commit[0:7])"] | unique | .[0:8] | join("; ")' "$LOGDIR/gitleaks.json")
      # Fingerprints hold no secret; once a finding is confirmed harmless,
      # its line can go in .gitleaksignore with a comment saying why.
      jq -r '.[].Fingerprint' "$LOGDIR/gitleaks.json" > "$LOGDIR/gitleaks-fingerprints.txt"
      row FAIL "Secret scan (gitleaks, full history)" "$n finding(s): $where · fingerprints in the artifact (gitleaks-fingerprints.txt)"
    fi
  else
    row WARN "Secret scan (gitleaks, full history)" "scan did not produce a report: $(tail -3 "$LOGDIR/gitleaks.log" | esc)"
  fi
else
  row SKIP "Secret scan" "gitleaks not available (local run)"
fi

# ------------------------------------------------------------------ install, checks, audit
if [ -n "$APP_DIR" ] && [ -f "$APP_DIR/package.json" ]; then
  cd "$APP_DIR" || exit 1
  installed=yes
  if [ -n "${HEALTH_INSTALL:-}" ]; then
    start=$(date +%s)
    if bash -c "$HEALTH_INSTALL" >"$LOGDIR/install.log" 2>&1; then
      row PASS "Install (\`$HEALTH_INSTALL\`)" "$(( $(date +%s) - start ))s"
    else
      installed=no
      d=$(grep -m2 -iE 'error|invalid' "$LOGDIR/install.log" | esc)
      row FAIL "Install (\`$HEALTH_INSTALL\`)" "${d:-see install log}"
    fi
  fi

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    label=${line%%::*}; cmd=${line#*::}
    slug=$(echo "$label" | tr -c 'a-zA-Z0-9' '-')
    if [ "$installed" = no ]; then
      row SKIP "$label" "install failed"
      continue
    fi
    start=$(date +%s)
    if bash -c "$cmd" >"$LOGDIR/$slug.log" 2>&1; then
      if grep -q '^SKIP:' "$LOGDIR/$slug.log"; then
        row SKIP "$label" "$(grep -m1 '^SKIP:' "$LOGDIR/$slug.log" | esc)"
      else
        clean=$(sed -E 's/\x1b\[[0-9;]*m//g' "$LOGDIR/$slug.log")
        detail=$(echo "$clean" | grep -m1 -E '^ *Tests +[0-9]+ passed' | esc)
        [ -z "$detail" ] && detail=$(echo "$clean" | grep -m1 -E '^# pass [0-9]+|[0-9]+ passed, [0-9]+ failed|[0-9]+ passed' | esc)
        row PASS "$label" "${detail:-ok} · $(( $(date +%s) - start ))s"
      fi
    else
      detail=$(grep -m2 -E 'error|Error|FAIL|failed' "$LOGDIR/$slug.log" | sed -E 's/\x1b\[[0-9;]*m//g' | esc)
      row FAIL "$label" "\`$cmd\` exited non-zero: ${detail:-see log}"
    fi
  done <<< "${HEALTH_CHECKS:-}"

  if [ "${HEALTH_AUDIT:-}" = npm ] && [ "$installed" = yes ]; then
    npm audit --omit=dev --json >"$LOGDIR/audit.json" 2>/dev/null
    crit=$(jq -r '.metadata.vulnerabilities.critical // "?"' "$LOGDIR/audit.json" 2>/dev/null || echo "?")
    high=$(jq -r '.metadata.vulnerabilities.high // "?"' "$LOGDIR/audit.json" 2>/dev/null || echo "?")
    if [ "$crit" = "?" ]; then
      row WARN "Dependency audit (production)" "npm audit gave no result"
    elif [ "$crit" -gt 0 ]; then
      row FAIL "Dependency audit (production)" "$crit critical, $high high"
    elif [ "$high" -gt 0 ]; then
      row WARN "Dependency audit (production)" "0 critical, $high high"
    else
      row PASS "Dependency audit (production)" "0 critical, 0 high"
    fi
  fi
  cd "$ROOT" || exit 1
elif [ -n "$APP_DIR" ]; then
  row SKIP "Install and checks" "no package.json in \`$APP_DIR\`"
fi

# ------------------------------------------------------------------ report
overall="✅ Healthy"
[ "$warns" -gt 0 ] && overall="⚠️ $warns warning(s)"
[ "$fails" -gt 0 ] && overall="❌ $fails failing, $warns warning(s)"
{
  echo "# Repository health report"
  echo
  echo "**$overall** · \`${GITHUB_REPOSITORY:-local}\` at \`$head_sha\` (\`$default_branch\`) · $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo
  echo "| Status | Check | Detail |"
  echo "|---|---|---|"
  printf '%s\n' "${rows[@]}"
  echo
  echo "Generated by \`.github/health/health-check.sh\`: read-only, no deploys, no paid services."
  echo "PASS and FAIL lines are measured on this run. SKIP means the check could not run here, not that it passed."
} > "$REPORT"
cat "$REPORT"
[ "$fails" -eq 0 ]
