#!/usr/bin/env bash
# SilenceEvolution
# Copyright (C) 2026 DEAL research group, Universidad de Sevilla
#
# Integration test suite: runs a real Silence server against a Departments–Employees
# database (ci/dept_emp.sql) and checks it over HTTP with curl + jq.
#
# Schema, seed data, user-defined endpoints and most test cases are ported from the CI
# project of the old (Python) Silence: https://github.com/DEAL-US/Silence-CI-Project
#
# Usage:
#   ci/run_tests.sh [path/to/silence]          # default: target/debug/silence
#
# Environment (all optional):
#   DB_HOST=127.0.0.1  DB_PORT=3306  DB_USER=iissi_user  DB_PASSWORD='iissi$user'
#   SILENCE_PORT=18080                 port the test server listens on
#   SILENCE_CI_KEEP_DB=1               do not drop the test databases at the end
#   SILENCE_CI_VERBOSE=1               print the response body of every failed assertion
#
# Only two databases are ever created or dropped: `silence_ci_db` and
# `silence_ci_internal_db`. Their names are hard-coded on purpose.
#
# Requires: bash, curl, jq and the `mariadb` (or `mysql`) client.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CI_DIR="$REPO_ROOT/ci"

SILENCE_BIN="${1:-${SILENCE_BIN:-$REPO_ROOT/target/debug/silence}}"
case "$SILENCE_BIN" in /*) ;; *) SILENCE_BIN="$PWD/$SILENCE_BIN" ;; esac

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-iissi_user}"
DB_PASSWORD="${DB_PASSWORD:-iissi\$user}"
SILENCE_PORT="${SILENCE_PORT:-18080}"

BASE="http://127.0.0.1:${SILENCE_PORT}"
API="$BASE/api"

for tool in curl jq; do
    command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 2; }
done

if command -v mariadb >/dev/null; then
    SQL_CLIENT=mariadb
elif command -v mysql >/dev/null; then
    SQL_CLIENT=mysql
else
    echo "Missing required tool: mariadb (or mysql) client" >&2
    exit 2
fi

[ -x "$SILENCE_BIN" ] || { echo "Silence binary not found or not executable: $SILENCE_BIN" >&2; exit 2; }

if [ -t 1 ] || [ -n "${CI:-}" ]; then
    C_GREEN=$'\e[32m'; C_RED=$'\e[31m'; C_YELLOW=$'\e[33m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_RESET=$'\e[0m'
else
    C_GREEN=; C_RED=; C_YELLOW=; C_BOLD=; C_DIM=; C_RESET=
fi

# Runs SQL against the server. Credentials go in a private option file (not argv or
# MYSQL_PWD), which works with both the mariadb and the mysql clients.
sql() {
    "$SQL_CLIENT" --defaults-extra-file="$WORK_DIR/client.cnf" --protocol=TCP "$@"
}

# ---------------------------------------------------------------------------
# Setup: databases, project fixture and server
# ---------------------------------------------------------------------------

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/silence_ci.XXXXXX")"
SERVER_LOG="$WORK_DIR/server.log"
SERVER_PID=""
SETUP_PID=""

(
    umask 077
    printf '[client]\nhost="%s"\nport=%s\nuser="%s"\npassword="%s"\n' \
        "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" > "$WORK_DIR/client.cnf"
)

drop_test_databases() {
    # Hard-coded names: never parametrise these.
    sql -e "DROP DATABASE IF EXISTS silence_ci_db; DROP DATABASE IF EXISTS silence_ci_internal_db;"
}

cleanup() {
    local code=$?
    local pid
    for pid in "$SERVER_PID" "$SETUP_PID"; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
    if [ "$code" -ne 0 ] && [ -f "$SERVER_LOG" ]; then
        echo
        echo "${C_DIM}---- last lines of the server log ($SERVER_LOG) ----${C_RESET}"
        sed 's/\x1b\[[0-9;]*m//g' "$SERVER_LOG" | tail -n 40 || true
    fi
    if [ "${SILENCE_CI_KEEP_DB:-0}" != "1" ]; then
        drop_test_databases 2>/dev/null || true
    fi
    rm -rf "$WORK_DIR"
    exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "${C_BOLD}Silence integration tests${C_RESET}"
echo "  binary:   $SILENCE_BIN"
echo "  database: $DB_USER@$DB_HOST:$DB_PORT (silence_ci_db, silence_ci_internal_db)"
echo "  server:   $BASE"
echo

echo "Preparing databases..."
drop_test_databases
sql -e "CREATE DATABASE silence_ci_db;"
sql silence_ci_db < "$CI_DIR/dept_emp.sql"

echo "Preparing project fixture in $WORK_DIR/project..."
cp -R "$CI_DIR/project" "$WORK_DIR/project"
mkdir -p "$WORK_DIR/project/endpoints" "$WORK_DIR/project/tests" "$WORK_DIR/project/web" # git drops empty folders
jq --arg listen "127.0.0.1:${SILENCE_PORT}" \
   --arg host "${DB_HOST}:${DB_PORT}" \
   --arg user "$DB_USER" \
   --arg pass "$DB_PASSWORD" \
   '.listening_addr = $listen
    | .databases_conn.main.host = $host | .databases_conn.main.username = $user | .databases_conn.main.password = $pass
    | .databases_conn.internal.host = $host | .databases_conn.internal.username = $user | .databases_conn.internal.password = $pass' \
   "$CI_DIR/project/config.json" > "$WORK_DIR/project/config.json"

# Another server on the port would answer the readiness check (and the tests) instead of ours.
for port in "$SILENCE_PORT" "$((SILENCE_PORT + 1))"; do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${port}/"; then
        echo "${C_RED}Port ${port} is already in use: stop that server or set SILENCE_PORT.${C_RESET}" >&2
        exit 1
    fi
done

echo "Starting server..."
(cd "$WORK_DIR/project" && exec "$SILENCE_BIN" run > "$SERVER_LOG" 2>&1) &
SERVER_PID=$!

ready=0
for _ in $(seq 1 120); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "${C_RED}The server exited before becoming ready.${C_RESET}" >&2
        exit 1
    fi
    if curl -fs -o /dev/null "$API/internal/endpoints?_=ready"; then
        ready=1
        break
    fi
    sleep 0.5
done
[ "$ready" = 1 ] || { echo "${C_RED}The server did not become ready in 60s.${C_RESET}" >&2; exit 1; }
echo "Server ready (pid $SERVER_PID)."

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

PASS=0
FAIL=0
XFAIL=0
XPASS=0
FAILED_NAMES=()
NONCE=0

STATUS=""   # HTTP status of the last request ("000" if the connection failed)
BODY=""     # body of the last request
HEADERS=""  # response headers of the last request

# req METHOD PATH [JSON_BODY] [extra curl args...]
# PATH is relative to the server root (e.g. /api/v1/departments).
# Responses may be cached for a couple of seconds; a unique `_` query parameter is
# appended to every request so that assertions always observe the current state of
# the database.
req() {
    local method="$1" path="$2" data="${3:-}"
    shift 3 || shift $#
    NONCE=$((NONCE + 1))
    local sep='?'
    case "$path" in *\?*) sep='&' ;; esac
    local url="$BASE$path${sep}_=ci$$-$NONCE"

    local args=(-s -X "$method" -D "$WORK_DIR/headers" -o "$WORK_DIR/body" -w '%{http_code}' --max-time 15)
    if [ -n "$data" ]; then
        args+=(-H 'Content-Type: application/json' --data-binary "$data")
    fi
    STATUS="$(curl "${args[@]}" "$@" "$url" 2>/dev/null)" || true
    [ -n "$STATUS" ] || STATUS="000"
    BODY="$(cat "$WORK_DIR/body" 2>/dev/null || true)"
    HEADERS="$(cat "$WORK_DIR/headers" 2>/dev/null || true)"
    rm -f "$WORK_DIR/body" "$WORK_DIR/headers"
}

# Authenticated request: auth_req TOKEN METHOD PATH [JSON_BODY]
auth_req() {
    local token="$1"; shift
    req "$1" "$2" "${3:-}" -H "Authorization: $token"
}

section() {
    echo
    echo "${C_BOLD}== $* ==${C_RESET}"
}

_report_detail() {
    echo "      ${C_DIM}status: $STATUS${C_RESET}"
    if [ "${SILENCE_CI_VERBOSE:-0}" = "1" ] || [ "${#BODY}" -le 300 ]; then
        echo "      ${C_DIM}body:   $(printf '%s' "$BODY" | tr -d '\n' | cut -c1-300)${C_RESET}"
    fi
}

# check NAME COMMAND...: passes when COMMAND succeeds.
check() {
    local name="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASS=$((PASS + 1))
        echo "  ${C_GREEN}✔${C_RESET} $name"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        echo "  ${C_RED}✘ $name${C_RESET}"
        _report_detail
    fi
}

# xfail NAME REASON COMMAND...: a known failure (bug in Silence/Waveless). It is
# reported but does not fail the run; if it unexpectedly passes it is reported as XPASS.
xfail() {
    local name="$1" reason="$2"; shift 2
    if "$@" >/dev/null 2>&1; then
        XPASS=$((XPASS + 1))
        echo "  ${C_YELLOW}★ XPASS${C_RESET} $name ${C_DIM}(known bug seems fixed: remove the xfail)${C_RESET}"
    else
        XFAIL=$((XFAIL + 1))
        echo "  ${C_YELLOW}⚠ XFAIL${C_RESET} $name"
        echo "      ${C_DIM}known bug: $reason${C_RESET}"
        _report_detail
    fi
}

status_is() { [ "$STATUS" = "$1" ]; }
status_in() { local s; for s in "$@"; do [ "$STATUS" = "$s" ] && return 0; done; return 1; }
status_is_error() { [ "$STATUS" -ge 400 ] 2>/dev/null; }
status_is_client_error() { [ "$STATUS" -ge 400 ] 2>/dev/null && [ "$STATUS" -lt 500 ]; }
jq_ok() { status_is 200 && jq -e "$@" <<<"$BODY"; }
jq_true() { jq -e "$@" <<<"$BODY"; }
body_contains() { grep -qF -- "$1" <<<"$BODY"; }
header_matches() { grep -qiE -- "$1" <<<"$HEADERS"; }
server_alive() { kill -0 "$SERVER_PID"; }

json() { jq -cn "$@"; }


# Helpers specific to this suite.
login_token() { # login_token EMAIL PASSWORD -> prints the token (empty on failure)
    req POST /api/internal/login "$(json --arg e "$1" --arg p "$2" '{email: $e, password: $p}')"
    jq -r '.token // empty' <<<"$BODY" 2>/dev/null || true
}
count_rows() { # count_rows PATH -> number of rows of a GET list endpoint
    req GET "$1"
    jq 'length' <<<"$BODY" 2>/dev/null || echo -1
}
approx() { # approx JQ_EXPR VALUE: checks a numeric field of $BODY with a 0.01 tolerance
    status_is 200 && jq -e --argjson v "$2" "($1 - \$v) | (. < 0.01 and . > -0.01)" <<<"$BODY"
}

# The employees of the seed data (ci/dept_emp.sql). As in Silence-CI-Project, every
# employee signs up with password = the part of the email before the '@'.
EMPLOYEE_EMAILS=(perianez@company.com jimenez@company.com lacalle@company.com linares@company.com alvarez@company.com)
declare -A POSITION=(
    [perianez@company.com]=Manager [jimenez@company.com]=CEO [lacalle@company.com]=Manager
    [linares@company.com]=Programmer [alvarez@company.com]=
)
declare -A TOKEN=()

# ---------------------------------------------------------------------------
# Endpoint discovery  (old: test_summary.py)
# ---------------------------------------------------------------------------

section "Endpoint discovery (GET /api/internal/endpoints)"

req GET /api/internal/endpoints
ALL_ENDPOINTS="$(jq -c '[.[][1][]?]' <<<"$BODY" 2>/dev/null || echo '[]')"
endpoint() { jq -c --arg id "$1" 'map(select(.id == $id)) | first' <<<"$ALL_ENDPOINTS"; }

check "endpoints listing returns 200 (old: GET /api summary)" status_is 200
for table in departments employees; do
    for kind in GetMany GetOne Post Put Delete; do
        check "auto-generated endpoint ${table}_${kind} exists" \
            jq -e --arg id "${table}_${kind}" 'any(.id == $id)' <<<"$ALL_ENDPOINTS"
    done
done
check "view topemployees only gets topemployees_GetMany (read-only)" \
    jq -e '[.[].id | select(startswith("topemployees_"))] == ["topemployees_GetMany"]' <<<"$ALL_ENDPOINTS"
check "departments_GetOne is GET v1 departments/{id}" \
    jq -e '.method == "get" and .version == "v1" and .route == "departments/{id}" and .auto_generated == true' <<<"$(endpoint departments_GetOne)"
check "departments_Post takes [name, city] (no auto_increment PK)" \
    jq -e '.method == "post" and .body_params == ["name", "city"]' <<<"$(endpoint departments_Post)"
check "employees_Put takes every non-PK column" \
    jq -e '.method == "put" and .route == "employees/{id}" and .body_params == ["email","departmentId","bossId","firstName","lastName","startDate","salary","fee","position","isActive"]' <<<"$(endpoint employees_Put)"
for id in freeAccess onlyLogged onlyManagerOrCEO onlyCEO onlyCEOLowercase banUser unbanUser loggedId loggedIdWithRestriction employeesByDepartment searchEmployees raiseSalaries; do
    check "user-defined endpoint $id is loaded" jq -e --arg id "$id" 'any(.id == $id and (.auto_generated | not))' <<<"$ALL_ENDPOINTS"
done

# ---------------------------------------------------------------------------
# Sign up  (old: test_register.py; /register -> /api/internal/signup)
# ---------------------------------------------------------------------------

section "Sign up (POST /api/internal/signup)"

req GET /api/internal/whoami
check "whoami without token returns 401" status_is 401

req POST /api/internal/signup "$(json '{name: "admin", email: "admin@company.com", password: "admin1234"}')"
check "signup of the first user returns 200" status_is 200
check "signup returns a token" jq_true '.token | type == "string" and length > 0'
ADMIN_TOKEN="$(jq -r '.token // empty' <<<"$BODY" 2>/dev/null || true)"
xfail "signup sets the Authorization cookie (like login does)" \
    "Waveless builds the Set-Cookie header but returns ResponseCx::new(Default::default(), ...) (waveless runtime/src/services/auth/signup.rs:132)" \
    header_matches '^set-cookie: *Authorization='

# Bootstrap must run while there is a single user (it is what the /auth page does
# right after the first signup).
auth_req "$ADMIN_TOKEN" GET /api/internal/whoami
check "before bootstrap the first user has no role" jq_ok '.email == "admin@company.com" and .role == null'
req GET /api/internal/bootstrap
check "bootstrap without token returns 401" status_is 401
auth_req "$ADMIN_TOKEN" GET /api/internal/bootstrap
check "bootstrap gives the first (only) user the admin role" jq_ok '.role == "admin"'

req POST /api/internal/signup "$(json '{name: "pruebas", password: "123456"}')"
check "signup without email is rejected" status_is_error
xfail "signup without email is a client error (old Silence: 400)" \
    "missing auth fields surface as 500 \"Unexpected error: 'email' field not found.\"" \
    status_is_client_error

req POST /api/internal/signup "$(json '{name: "pruebas", email: "pepito@company.com"}')"
check "signup without password is rejected" status_is_error

req POST /api/internal/signup "$(json '{name: "pruebas", email: "admin@company.com", password: "123456"}')"
check "signup with an existing email is rejected" status_is_error
xfail "signup with an existing email is a client error (old Silence: 400)" \
    "duplicate account surfaces as 500 'Unexpected error: Signup failed, an account with the same unique fields already exists.'" \
    status_is_client_error

req POST /api/internal/signup "$(json '{name: "pruebas", email: "pruebas@company.com", password: "pruebas"}')"
check "signup pruebas@company.com returns 200 and a token" jq_ok '.token | length > 0'
req POST /api/internal/signup "$(json '{name: "pruebas2", email: "pruebas@company.com", password: "pruebas"}')"
check "repeating the same signup is rejected" status_is_error

for email in "${EMPLOYEE_EMAILS[@]}"; do
    user="${email%@*}"
    req POST /api/internal/signup "$(json --arg n "$user" --arg e "$email" '{name: $n, email: $e, password: $n}')"
    check "signup employee $email" status_is 200
done

# ---------------------------------------------------------------------------
# Login and sessions  (old: test_login.py)
# ---------------------------------------------------------------------------

section "Login and sessions (POST /api/internal/login, GET /api/internal/whoami)"

req POST /api/internal/login '{}'
check "login with empty body is rejected, no token" eval 'status_is_error && ! body_contains "\"token\""'
xfail "login with empty body is a client error (old Silence: 400)" \
    "missing fields surface as 500 \"Unexpected error: 'email' field not found.\"" \
    status_is_client_error
req POST /api/internal/login "$(json '{email: "pruebas@company.com"}')"
check "login without password is rejected, no token" eval 'status_is_error && ! body_contains "\"token\""'
req POST /api/internal/login "$(json '{password: "pruebas"}')"
check "login without email is rejected, no token" eval 'status_is_error && ! body_contains "\"token\""'
req POST /api/internal/login "$(json '{email: "notexists@null.com", password: "pruebas"}')"
check "login with an unknown email returns 403 (old Silence: 400)" status_is 403
req POST /api/internal/login "$(json '{email: "pruebas@company.com", password: "djgnhasfkjghnahslfkjfgjkl"}')"
check "login with a wrong password returns 403 (old Silence: 400)" status_is 403

req POST /api/internal/login "$(json '{email: "pruebas@company.com", password: "pruebas"}')"
check "login ok returns 200" status_is 200
PRUEBAS_TOKEN="$(jq -r '.token // empty' <<<"$BODY" 2>/dev/null || true)"
check "login returns a token (old: sessionToken)" test -n "$PRUEBAS_TOKEN"
check "login sets 'Authorization=<token>' cookie (SameSite=Lax, Path=/)" \
    header_matches "^set-cookie: *Authorization=${PRUEBAS_TOKEN}; SameSite=Lax; Path=/"

auth_req "$PRUEBAS_TOKEN" GET /api/internal/whoami
check "whoami with 'Authorization: <token>' header returns the user" jq_ok '.email == "pruebas@company.com" and .name == "pruebas" and (.user_id | type) == "number"'
check "whoami does not expose the password" jq_ok 'has("password") | not'
req GET /api/internal/whoami "" -H "Cookie: Authorization=$PRUEBAS_TOKEN"
check "whoami with 'Cookie: Authorization=<token>' returns the user" jq_ok '.email == "pruebas@company.com"'
req GET /api/internal/whoami "" -H "Cookie: theme=dark; Authorization=$PRUEBAS_TOKEN"
xfail "whoami with the token cookie after another cookie ('a=b; Authorization=...')" \
    "the session watchdog splits cookies on ';' without trimming, so ' Authorization' never matches (waveless runtime/src/services/auth/session/watchdog.rs:101-109)" \
    jq_ok '.email == "pruebas@company.com"'
req GET /api/internal/whoami "" -H "Authorization: Bearer $PRUEBAS_TOKEN"
check "'Authorization: Bearer <token>' is not accepted (raw token expected)" status_is 401
auth_req "not-a-valid-token" GET /api/internal/whoami
check "whoami with an invalid token returns 401" status_is 401

for email in "${EMPLOYEE_EMAILS[@]}"; do
    TOKEN[$email]="$(login_token "$email" "${email%@*}")"
    check "login employee $email" test -n "${TOKEN[$email]}"
done

# ---------------------------------------------------------------------------
# Bootstrap and admin-only internal endpoints
# ---------------------------------------------------------------------------

section "Bootstrap and admin-only internal endpoints"

auth_req "$PRUEBAS_TOKEN" GET /api/internal/bootstrap
auth_req "$PRUEBAS_TOKEN" GET /api/internal/whoami
check "bootstrap does NOT give admin to a non-first user" jq_ok '.email == "pruebas@company.com" and .role == null'
auth_req "$ADMIN_TOKEN" GET /api/internal/whoami
check "whoami reports role admin" jq_ok '.role == "admin"'

auth_req "$ADMIN_TOKEN" GET /api/internal/admin/users
check "admin can list users (GET /api/internal/admin/users)" jq_ok 'length == 7 and any(.email == "admin@company.com" and .role == "admin")'
check "stored passwords are argon2 hashes" jq_ok 'all(.password | startswith("$argon2"))'
auth_req "$ADMIN_TOKEN" GET /api/internal/admin/users/1
check "admin can get a user (GET /api/internal/admin/users/1)" jq_ok '.email == "admin@company.com"'
auth_req "$ADMIN_TOKEN" GET /api/internal/admin/config
check "admin can read the config (GET /api/internal/admin/config)" status_is 200
auth_req "$ADMIN_TOKEN" GET /api/internal/admin/tests
check "admin can list tests (GET /api/internal/admin/tests)" status_is 200

# The server listens on loopback (127.0.0.1): the admin panel is a local tool, so its API
# needs no login (see src/setup.rs). Only read-only calls here: they must not change the data.
auth_req "$PRUEBAS_TOKEN" GET /api/internal/admin/users
check "local admin: a non-admin user can use the admin API (GET users)" status_is 200
req GET /api/internal/admin/users
check "local admin: anonymous GET /api/internal/admin/users returns 200" status_is 200
req GET /api/internal/admin/config
check "local admin: anonymous GET /api/internal/admin/config returns 200" status_is 200

auth_req "$ADMIN_TOKEN" POST /api/internal/admin/users "$(json '{name: "carol", email: "carol@company.com", password: "carol", role: "user"}')"
check "admin creates a user via POST /api/internal/admin/users" status_is 200
auth_req "$ADMIN_TOKEN" GET /api/internal/admin/users
check "the created user is listed with its role" jq_ok 'any(.email == "carol@company.com" and .role == "user")'
req POST /api/internal/login "$(json '{email: "carol@company.com", password: "carol"}')"
check "a user created from the admin panel can log in" status_is 200
auth_req "$ADMIN_TOKEN" GET /api/internal/admin/users
check "users created from the admin panel get an argon2 hash" jq_ok 'all(.password | startswith("$argon2"))'
CAROL_ID="$(jq -r '.[] | select(.email == "carol@company.com") | .user_id' <<<"$BODY")"
auth_req "$ADMIN_TOKEN" PUT "/api/internal/admin/users/$CAROL_ID" "$(json '{name: "carol", email: "carol@company.com", password: "", role: "user"}')"
check "updating a user with an empty password succeeds" status_is 200
req POST /api/internal/login "$(json '{email: "carol@company.com", password: "carol"}')"
check "an empty password on update keeps the current one" status_is 200
req POST "/api/internal/admin/users/$CAROL_ID/session"
check "the admin API opens a session for a user (Authenticate in Users)" jq_ok '.email == "carol@company.com" and (.token | length == 32)'
CAROL_TOKEN="$(jq -r '.token // empty' <<<"$BODY")"
auth_req "$CAROL_TOKEN" GET /api/internal/whoami
check "the opened session authenticates as that user" jq_ok '.email == "carol@company.com" and .role == "user"'
req POST /api/internal/admin/users/999999/session
check "opening a session for a missing user is an error" status_is_error

# ---------------------------------------------------------------------------
# Roles  (old: test_roles.py; restricted_endpoints.json)
# ---------------------------------------------------------------------------

section "Roles: allowed_roles on user-defined endpoints"

# The old project used employees.position as the role column. The new Silence keeps
# roles in silence_roles (internal DB), so the employees' positions are copied there.
sql silence_ci_internal_db -e "
    INSERT INTO silence_roles (user_id, role)
    SELECT u.user_id, e.position
    FROM silence_users u JOIN silence_ci_db.employees e ON (e.email = u.email)
    WHERE e.position IS NOT NULL;"

auth_req "${TOKEN[jimenez@company.com]}" GET /api/internal/whoami
check "whoami reports the role stored in silence_roles (CEO)" jq_ok '.role == "CEO"'

for route in freeAccess onlyLogged onlyManagerOrCEO onlyCEO onlyCEOLowercase; do
    req GET "/api/v1/departments/$route"
    if [ "$route" = freeAccess ]; then
        check "$route: anonymous -> 200" status_is 200
    else
        check "$route: anonymous -> 401" status_is 401
    fi
done

for email in "${EMPLOYEE_EMAILS[@]}"; do
    pos="${POSITION[$email]}"
    label="$email (${pos:-no role})"
    tok="${TOKEN[$email]}"

    auth_req "$tok" GET /api/v1/departments/freeAccess
    check "freeAccess: $label -> 200" jq_ok 'length == 3'
    auth_req "$tok" GET /api/v1/departments/onlyLogged
    check "onlyLogged: $label -> 200" jq_ok 'length == 3'

    auth_req "$tok" GET /api/v1/departments/onlyManagerOrCEO
    if [ "$pos" = Manager ] || [ "$pos" = CEO ]; then
        xfail "onlyManagerOrCEO [\"Manager\",\"CEO\"]: $label -> 200" \
            "allowed_roles containing uppercase letters never match: the watchdog compares allowed_roles.contains(&role.to_lowercase()) (waveless runtime/src/services/auth/session/watchdog.rs:196)" \
            status_is 200
    else
        check "onlyManagerOrCEO: $label -> 401" status_is 401
    fi

    auth_req "$tok" GET /api/v1/departments/onlyCEO
    if [ "$pos" = CEO ]; then
        xfail "onlyCEO [\"CEO\"]: $label -> 200" \
            "same mixed-case allowed_roles bug (watchdog.rs:196)" \
            status_is 200
    else
        check "onlyCEO: $label -> 401" status_is 401
    fi

    auth_req "$tok" GET /api/v1/departments/onlyCEOLowercase
    if [ "$pos" = CEO ]; then
        check "onlyCEOLowercase [\"ceo\"]: $label -> 200" status_is 200
    else
        check "onlyCEOLowercase [\"ceo\"]: $label -> 401" status_is 401
    fi
done

# ---------------------------------------------------------------------------
# Logged user  (old: test_loggedId.py, $loggedId -> |user_id|)
# ---------------------------------------------------------------------------

section "Logged user: |user_id| injection (old \$loggedId)"

req GET /api/v1/employees/logged
check "employees/logged: anonymous -> 401" status_is 401
for email in "${EMPLOYEE_EMAILS[@]}"; do
    auth_req "${TOKEN[$email]}" GET /api/v1/employees/logged
    logged="$BODY"; logged_status="$STATUS"
    id="$(jq -r '.employeeId // empty' <<<"$logged" 2>/dev/null || true)"
    req GET "/api/v1/employees/${id:-0}"
    check "employees/logged: $email gets exactly their own row" \
        eval '[ "$logged_status" = 200 ] && jq -e --arg e "$email" --argjson row "$BODY" ".email == \$e and . == \$row" <<<"$logged"'
done

req GET /api/v1/employees/logged_restricted
check "employees/logged_restricted: anonymous -> 401" status_is 401
for email in "${EMPLOYEE_EMAILS[@]}"; do
    auth_req "${TOKEN[$email]}" GET /api/v1/employees/logged_restricted
    if [ "${POSITION[$email]}" = CEO ]; then
        check "employees/logged_restricted: CEO $email gets their row" jq_ok --arg e "$email" '.email == $e'
    else
        check "employees/logged_restricted: $email -> 401" status_is 401
    fi
done

# ---------------------------------------------------------------------------
# Ban / unban  (old: test_banned.py, banned_endpoints.json)
# ---------------------------------------------------------------------------

section "Ban / unban user-defined endpoints (path params)"

req PUT /api/v1/employees/ban/1
check "PUT employees/ban/1 returns 200" status_is 200
req GET /api/v1/employees/1
check "employee 1 is now inactive" jq_ok '.isActive == 0'
req PUT /api/v1/employees/unban/1
check "PUT employees/unban/1 returns 200" status_is 200
req GET /api/v1/employees/1
check "employee 1 is active again" jq_ok '.isActive == 1'

# ---------------------------------------------------------------------------
# Departments  (old: test_departments.py)
# ---------------------------------------------------------------------------

section "Departments: auto-generated CRUD (/api/v1/departments)"

req GET /api/v1/departments
check "GET list returns the 3 seeded departments" jq_ok 'length == 3 and all(has("departmentId") and has("name") and has("city"))'
DEPTS="$BODY"
check "NULL city is returned as JSON null" jq_ok 'any(.name == "Historia" and .city == null)'

for id in 1 2 3; do
    req GET "/api/v1/departments/$id"
    check "GET departments/$id equals its entry in the list" \
        eval 'status_is 200 && jq -e --argjson d "$DEPTS" --argjson id "$id" ". == (\$d | map(select(.departmentId == \$id)) | first)" <<<"$BODY"'
done

req GET /api/v1/departments/2522461635631
check "GET unknown id returns an error status" status_is_error
xfail "GET unknown id returns 404 (old Silence: 404)" \
    "a missing row yields 400 'Resource does not exist' (SQLBehaviour::Unique) instead of 404" \
    status_is 404

req POST /api/v1/departments "$(json '{name: "Department of testing", city: "Testingville"}')"
check "POST creates a department (200)" status_is 200
req GET /api/v1/departments
check "list now has 4 departments, including the new one" jq_ok 'length == 4 and any(.name == "Department of testing" and .city == "Testingville")'
NEW_DEPT_ID="$(jq -r 'map(select(.name == "Department of testing")) | first | .departmentId' <<<"$BODY" 2>/dev/null || echo 0)"
check "the new department got the next auto_increment id (4)" test "$NEW_DEPT_ID" = 4

req POST /api/v1/departments "$(json '{name: "Department of testing", city: "Testingville"}')"
check "POST repeating UNIQUE (name, city) is rejected" status_is_error
xfail "UNIQUE violation is a client error (old Silence: 400)" \
    "every database error (UNIQUE/FK/CHECK) is returned as 500 Internal Server Error" \
    status_is_client_error
check "the duplicate was not inserted" test "$(count_rows /api/v1/departments)" = 4

req POST /api/v1/departments '{"name": "Sin ciudad"}'
check "POST without a required body param is rejected" status_is_error
xfail "missing body param is a client error (4xx)" \
    "'The endpoint requires X, but it wasn't provided in the request.' is returned as 500" \
    status_is_client_error
req POST /api/v1/departments 'name=Química&city=Málaga'
check "POST with a non-JSON body returns 400" status_is 400

req PUT "/api/v1/departments/$NEW_DEPT_ID" "$(json '{name: "Tests Department", city: "Land of Testing"}')"
check "PUT updates the department (200)" status_is 200
req GET "/api/v1/departments/$NEW_DEPT_ID"
check "GET reflects the update" jq_ok '.name == "Tests Department" and .city == "Land of Testing"'

req DELETE "/api/v1/departments/$NEW_DEPT_ID"
check "DELETE removes the department (200)" status_is 200
req GET "/api/v1/departments/$NEW_DEPT_ID"
check "GET deleted department returns an error status" status_is_error
req GET /api/v1/departments
check "list is back to the original 3 departments" eval 'status_is 200 && jq -e --argjson d "$DEPTS" ". == \$d" <<<"$BODY"'

# ---------------------------------------------------------------------------
# Employees  (old: test_employees.py)
# ---------------------------------------------------------------------------

section "Employees: auto-generated CRUD and constraints (/api/v1/employees)"

req GET /api/v1/topemployees
check "view topemployees: every employee earns > 2000" jq_ok 'length == 3 and all(.salary > 2000)'

req GET /api/v1/employees
check "GET list returns the 5 seeded employees" jq_ok 'length == 5'
EMPS="$BODY"
for id in 1 2 3 4 5; do
    req GET "/api/v1/employees/$id"
    check "GET employees/$id equals its entry in the list" \
        eval 'status_is 200 && jq -e --argjson l "$EMPS" --argjson id "$id" ". == (\$l | map(select(.employeeId == \$id)) | first)" <<<"$BODY"'
done
req GET /api/v1/employees/2
check "column types: DATE as YYYY-MM-DD, DOUBLE as number, BOOLEAN as 0/1" \
    jq_ok '.startDate == "2012-03-12" and .salary == 2500 and .isActive == 1 and .bossId == 1 and .fee == null'

req GET /api/v1/employees/2522461635631
check "GET unknown id returns an error status" status_is_error

EMP='{email: "testing_employee@company.com", departmentId: 1, bossId: 1, firstName: "Testing", lastName: "Employee", startDate: "2024-09-01", salary: 1337, fee: 0.3, position: "Tester", isActive: 1}'

req POST /api/v1/employees "$(json "$EMP | .email = \"perianez@company.com\"")"
check "POST with an existing UNIQUE email is rejected" status_is_error
req POST /api/v1/employees "$(json "$EMP | del(.firstName)")"
check "POST without firstName is rejected" status_is_error
req POST /api/v1/employees "$(json "$EMP | .salary = -420")"
check "CHECK salary > 0: negative salary is rejected" status_is_error
check "error message names the violated constraint" body_contains "validSalary"
req POST /api/v1/employees "$(json "$EMP | .fee = 1.5")"
check "CHECK fee BETWEEN 0 AND 1: fee 1.5 is rejected" status_is_error
req POST /api/v1/employees "$(json "$EMP | .departmentId = 999")"
check "FK departmentId -> departments: unknown department is rejected" status_is_error
req POST /api/v1/employees "$(json "$EMP | .bossId = 999")"
check "FK bossId -> employees: unknown boss is rejected" status_is_error
check "no invalid employee was inserted (still 5)" test "$(count_rows /api/v1/employees)" = 5

req POST /api/v1/employees "$(json "$EMP | .bossId = null")"
xfail "POST with JSON null for a nullable column (bossId: null, as in the old tests) inserts NULL" \
    "Waveless binds JSON null as the string 'null' (waveless runtime/src/services/http_facade/request_extractor.rs:143-147, value.to_string()), so MariaDB rejects it: Incorrect integer value: 'null'" \
    status_is 200
if status_is 200; then # keep the rest of the suite deterministic if the bug gets fixed
    req GET /api/v1/employees
    id="$(jq -r 'map(select(.email == "testing_employee@company.com")) | first | .employeeId' <<<"$BODY")"
    req DELETE "/api/v1/employees/$id"
fi

req POST /api/v1/employees "$(json "$EMP")"
check "POST creates an employee (200)" status_is 200
req GET /api/v1/employees
check "list now has 6 employees" jq_ok 'length == 6'
NEW_EMP_ID="$(jq -r 'map(select(.email == "testing_employee@company.com")) | first | .employeeId' <<<"$BODY" 2>/dev/null || echo 0)"
req GET "/api/v1/employees/$NEW_EMP_ID"
check "the created employee has every field that was sent" \
    eval 'status_is 200 && jq -e "$(printf "%s" "$EMP") as \$sent | to_entries | map(select(.key != \"employeeId\")) | from_entries == \$sent" <<<"$BODY"'

req PUT "/api/v1/employees/$NEW_EMP_ID" "$(json "$EMP | .email = \"new_testing_employee@company.com\" | .salary = 2500.5")"
check "PUT updates the employee (200)" status_is 200
req GET "/api/v1/employees/$NEW_EMP_ID"
check "GET reflects the update" jq_ok '.email == "new_testing_employee@company.com" and .salary == 2500.5'

req PUT /api/v1/employees/4 "$(json "$EMP | .email = \"linares@company.com\" | .salary = -1")"
check "PUT violating CHECK is rejected" status_is_error
req GET /api/v1/employees/4
check "rejected PUT left the row untouched" jq_ok '.salary == 1300 and .firstName == "Luis"'

# ON DELETE SET NULL: deleting a department detaches its employees.
req POST /api/v1/departments "$(json '{name: "Temporal", city: "Almería"}')"
req GET /api/v1/departments
TMP_DEPT_ID="$(jq -r 'map(select(.name == "Temporal")) | first | .departmentId' <<<"$BODY" 2>/dev/null || echo 0)"
req PUT "/api/v1/employees/$NEW_EMP_ID" "$(json "$EMP | .departmentId = $TMP_DEPT_ID")"
req DELETE "/api/v1/departments/$TMP_DEPT_ID"
check "DELETE a department that has employees succeeds" status_is 200
req GET "/api/v1/employees/$NEW_EMP_ID"
check "ON DELETE SET NULL: the employee's departmentId is now null" jq_ok '.departmentId == null'

req DELETE "/api/v1/employees/$NEW_EMP_ID"
check "DELETE removes the employee (200)" status_is 200
req GET "/api/v1/employees/$NEW_EMP_ID"
check "GET deleted employee returns an error status" status_is_error
req GET /api/v1/employees
check "list is back to the original 5 employees" eval 'status_is 200 && jq -e --argjson l "$EMPS" ". == \$l" <<<"$BODY"'

# ---------------------------------------------------------------------------
# More user-defined endpoints (path/query/body params, admin role)
# ---------------------------------------------------------------------------

section "User-defined endpoints: path, query and body params"

req GET /api/v1/departments/1/employees
check "path param: departments/1/employees returns its 4 employees in order" jq_ok 'map(.employeeId) == [1, 2, 4, 5] and all(.departmentId == 1)'
req GET /api/v1/departments/3/employees
check "path param: department without employees gives an empty list" jq_ok 'length == 0'

req GET "/api/v1/employees/search?minSalary=2300"
check "query param: minSalary=2300 returns 3 employees, salary desc" jq_ok 'map(.employeeId) == [2, 1, 3] and all(.salary >= 2300)'
check "query param: only the selected columns are returned" jq_ok 'all(keys == ["employeeId", "firstName", "lastName", "salary"])'
req GET /api/v1/employees/search
check "query param: missing minSalary is rejected" status_is_error

req POST /api/v1/departments/2/raise '{"percentage": 10}'
check "admin-only endpoint: anonymous -> 401" status_is 401
auth_req "${TOKEN[jimenez@company.com]}" POST /api/v1/departments/2/raise '{"percentage": 50}'
check "admin-only endpoint: CEO (not admin) -> 401/403" status_in 401 403
req GET /api/v1/employees/3
check "forbidden raise did not change any salary" approx .salary 2300
auth_req "$ADMIN_TOKEN" POST /api/v1/departments/2/raise '{"percentage": 10}'
check "admin-only endpoint: admin -> 200" status_is 200
req GET /api/v1/employees/3
check "raise applied +10% to department 2 (2300 -> 2530)" approx .salary 2530

# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

section "Logout"

auth_req "$PRUEBAS_TOKEN" GET /api/internal/logout
check "logout returns 200" status_is 200
auth_req "$PRUEBAS_TOKEN" GET /api/internal/whoami
check "the token is invalid after logout (401)" status_is 401
auth_req "$ADMIN_TOKEN" GET /api/internal/whoami
check "other users' sessions are unaffected" jq_ok '.email == "admin@company.com"'

# ---------------------------------------------------------------------------
# Static files and embedded frontend
# ---------------------------------------------------------------------------

section "Static frontend"

req GET /
check "GET / returns 200" status_is 200
check "GET / serves web/index.html from the project" body_contains "silence-ci-marker"
check "GET / has Content-Type text/html" header_matches '^content-type: *text/html'
req GET /index.html
check "GET /index.html serves the same file" body_contains "silence-ci-marker"
req GET /does-not-exist.html
check "unknown static file returns 404" status_is 404

req GET /admin
check "GET /admin returns 200 text/html" eval 'status_is 200 && header_matches "^content-type: *text/html"'
check "GET /admin body is an HTML document" body_contains "<html"
req GET /auth
check "GET /auth returns 200 text/html" eval 'status_is 200 && header_matches "^content-type: *text/html"'

req GET /../config.json "" --path-as-is
check "path traversal does not serve the project's config.json" eval '! body_contains databases_conn'
check "server is still running after the path traversal attempt" server_alive

# ---------------------------------------------------------------------------
# Usage statistics (see src/stats.rs)
# ---------------------------------------------------------------------------

section "Usage statistics (/_setup/stats)"

req GET /_setup/stats
check "the statistics count the requests made by the tests" jq_ok '.requests > 50 and .by_method.GET > 0 and .by_method.POST > 0'
check "generated endpoints' executions are measured" jq_ok 'any(.endpoints[]; .id == "departments_GetMany" and .executions > 0)'
check "failed executions are counted by status" jq_ok '.errors > 0 and (.by_status | keys | any(. == "500" or . == "400"))'
check "requests rejected before running (auth) are counted" jq_ok 'any(.endpoints[]; .rejected > 0)'
req DELETE /_setup/stats
check "DELETE /_setup/stats resets them" status_is 200
check "the reset is saved in the project's stats.json" jq -e '.requests == {} and .executions == {}' "$WORK_DIR/project/stats.json"
req GET /_setup/stats
check "after the reset only the reset request itself is left" jq_ok '.requests <= 1 and .executions == 0'

# ---------------------------------------------------------------------------
# Setup mode: `silence run` in an empty directory (see src/setup.rs)
# ---------------------------------------------------------------------------

section "Setup mode (silence run in an empty directory)"

mkdir -p "$WORK_DIR/not-a-project" && touch "$WORK_DIR/not-a-project/notes.txt"
NOT_PROJECT_OUT="$(cd "$WORK_DIR/not-a-project" && timeout 20 "$SILENCE_BIN" run 2>&1 || true)"
check "run in a non-empty directory that isn't a project fails" grep -q "isn't empty" <<<"$NOT_PROJECT_OUT"
check "run in a non-empty directory doesn't create a project" test ! -e "$WORK_DIR/not-a-project/config.json"

SETUP_DIR="$WORK_DIR/empty"
SETUP_PORT=$((SILENCE_PORT + 1))
mkdir -p "$SETUP_DIR" && touch "$SETUP_DIR/.gitkeep"
(cd "$SETUP_DIR" && exec "$SILENCE_BIN" run -l "127.0.0.1:${SETUP_PORT}" > "$WORK_DIR/setup.log" 2>&1) &
SETUP_PID=$!
for _ in $(seq 1 120); do
    curl -fs -o /dev/null "http://127.0.0.1:${SETUP_PORT}/_setup/status" && break
    kill -0 "$SETUP_PID" 2>/dev/null || break
    sleep 0.5
done

MAIN_BASE="$BASE"
BASE="http://127.0.0.1:${SETUP_PORT}"

check "run in an empty directory (hidden files ignored) creates config.json" test -f "$SETUP_DIR/config.json"
check "run in an empty directory creates endpoints/, tests/ and web/" test -d "$SETUP_DIR/endpoints" -a -d "$SETUP_DIR/tests" -a -d "$SETUP_DIR/web"
req GET /_setup/status
check "the new project starts in setup mode (not connected, local admin)" jq_ok '.connected == false and .local_admin == true and (.error | length > 0)'
req GET /admin
check "the admin panel is served in setup mode" status_is 200
req GET /_setup/config
check "GET /_setup/config returns the default settings" jq_ok '.databases_conn.main.db == "example_db"'
req POST /_setup/databases "$(json --arg host "$DB_HOST:$DB_PORT" --arg user "$DB_USER" --arg pass "$DB_PASSWORD" '{host: $host, username: $user, password: $pass}')"
check "POST /_setup/databases lists the server's databases" jq_ok 'any(.name == "silence_ci_db" and .tables == 3)'
req POST /_setup/databases "$(json --arg host "$DB_HOST:$DB_PORT" --arg user "$DB_USER" '{host: $host, username: $user, password: "wrong"}')"
check "POST /_setup/databases with a wrong password is an error" status_is 400
req PUT /_setup/config "$(json --arg host "$DB_HOST:$DB_PORT" --arg user "$DB_USER" --arg pass "$DB_PASSWORD" \
    '{databases_conn: {main: {host: $host, username: $user, password: $pass, db: "silence_ci_db"},
                       internal: {host: $host, username: $user, password: $pass, db: "silence_ci_internal_db"}}}')"
check "PUT /_setup/config saves the connections" status_is 200
check "the connections are written to config.json" jq -e '.databases_conn.main.db == "silence_ci_db"' "$SETUP_DIR/config.json"
req GET /api/v1/departments
check "before connecting, the database's endpoints are not served" status_is_error
req POST /_setup/connect
check "POST /_setup/connect connects to the databases" jq_ok '.connected == true'
req POST /_setup/connect
check "connecting twice is refused (restart to change the databases)" status_is_error
req GET /api/internal/admin/users
check "after connecting, the admin API works without login" status_is 200
req POST /api/internal/admin/endpoints/load
check "Load endpoints discovers the schema" jq_ok '.loaded >= 10'
req GET /api/v1/departments
check "after loading, the generated endpoints are served" jq_ok 'length >= 3'
req PUT /_setup/config '{}'
check "the setup settings can't be changed once connected" status_is 409
# Subscribe, then make the server log something (a request) while the stream is open.
curl -sN --max-time 4 -D - "$BASE/_setup/console" > "$WORK_DIR/console.out" 2>/dev/null &
CONSOLE_CURL=$!
sleep 1
req GET /api/internal/admin/users
wait "$CONSOLE_CURL" || true
CONSOLE_OUT="$(cat "$WORK_DIR/console.out")"
check "GET /_setup/console streams the log as Server-Sent Events" grep -qi "content-type: *text/event-stream" <<<"$CONSOLE_OUT"
check "the console stream carries log lines" grep -q "^data: " <<<"$CONSOLE_OUT"

BASE="$MAIN_BASE"
kill "$SETUP_PID" 2>/dev/null || true
wait "$SETUP_PID" 2>/dev/null || true
SETUP_PID=""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo
echo "${C_BOLD}Summary${C_RESET}: ${C_GREEN}${PASS} passed${C_RESET}, ${C_RED}${FAIL} failed${C_RESET}, ${C_YELLOW}${XFAIL} known failures (xfail)${C_RESET}, ${XPASS} unexpected passes (xpass)"

if [ "$FAIL" -gt 0 ]; then
    echo "${C_RED}Failed assertions:${C_RESET}"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - $name"
    done
    exit 1
fi

if ! server_alive; then
    echo "${C_RED}The server died during the run.${C_RESET}"
    exit 1
fi

echo "${C_GREEN}All assertions passed.${C_RESET}"
