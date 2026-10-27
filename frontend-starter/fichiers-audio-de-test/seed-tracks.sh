#!/bin/bash
# seed-tracks.sh — populates the library with 12 test tracks (3 pages at limit=5)
#
# Usage:
#   ./seed-tracks.sh                              # uses test@example.com / TestPassword1!
#   ./seed-tracks.sh your@email.com yourpassword  # uses your own account
#
# Prerequisite: backend running on http://localhost:3000

BASE_URL="http://localhost:3000/api"
EMAIL="${1:-test@example.com}"
PASSWORD="${2:-TestPassword1!}"
AUDIO_DIR="$(cd "$(dirname "$0")" && pwd)"

extract_token() {
  grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' || true
}

# ── 1. Login ─────────────────────────────────────────────────────────────────

echo "→ Logging in as $EMAIL..."

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | extract_token)

if [ -z "$TOKEN" ]; then
  echo "  Login failed (server: $LOGIN_RESPONSE)"
  echo "  → Trying to register..."

  REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Test User\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

  TOKEN=$(echo "$REGISTER_RESPONSE" | extract_token)

  if [ -z "$TOKEN" ]; then
    echo ""
    echo "✗ Could not authenticate."
    echo "  Register response: $REGISTER_RESPONSE"
    echo ""
    echo "  Options:"
    echo "  1. Pass your own credentials: ./seed-tracks.sh your@email.com yourpassword"
    echo "  2. Make sure the backend is running: cd backend && node src/app.js"
    exit 1
  fi

  echo "  ✓ Account created"
fi

echo "✓ Authenticated"

# ── 2. Upload ────────────────────────────────────────────────────────────────

upload() {
  local FILE="$AUDIO_DIR/$1"
  local TITLE="$2"
  RESULT=$(curl -s -X POST "$BASE_URL/tracks" \
    -H "Authorization: Bearer $TOKEN" \
    -F "audio=@$FILE;type=audio/mpeg" \
    -F "title=$TITLE")
  if echo "$RESULT" | grep -q '"id"'; then
    echo "  ✓ $TITLE"
  else
    echo "  ✗ $TITLE — $RESULT"
  fi
}

echo "→ Uploading 12 tracks..."

upload "song1.mp3" "Blues en Mi mineur"
upload "song2.mp3" "Groove Funk 120 bpm"
upload "song1.mp3" "Jam Session Dm"
upload "song2.mp3" "Rock 8-beat 140 bpm"
upload "song1.mp3" "Ballade Acoustique"
upload "song2.mp3" "Latin Percussion Loop"
upload "song1.mp3" "Jazz Swing 90 bpm"
upload "song2.mp3" "R&B Smooth Chords"
upload "song1.mp3" "Reggae One-Drop 75 bpm"
upload "song2.mp3" "Metal Riff Drop-D"
upload "song1.mp3" "Bossa Nova Em"
upload "song2.mp3" "Salsa Clave 2-3"

echo ""
echo "✓ Done — 3 pages available at limit=5"
echo ""
echo "Test scenarios:"
echo "  • Pagination: click Next × 2 then Prev × 2"
echo "  • Search: type 'blues' → 1 result / 'jazz' → 1 result / clear → all"
echo "  • Delete: remove all 5 tracks on page 1 → pager updates"
echo "  • Delete last track on a page → goes back to previous page"
echo "  • Playback: play one track, then another → first one stops"
