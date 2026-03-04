#!/bin/bash
set -e

echo "[agent-vm] Starting virtual display..."
Xvfb :99 -screen 0 ${RESOLUTION:-1920x1080x24} &
sleep 1

echo "[agent-vm] Starting window manager..."
DISPLAY=:99 fluxbox &
sleep 0.5

echo "[agent-vm] Starting VNC server..."
x11vnc -display :99 -forever -shared -rfbport 5900 -nopw -quiet &
sleep 0.5

echo "[agent-vm] Starting noVNC (websocket bridge 6080 -> 5900)..."
websockify --web /usr/share/novnc/ 6080 localhost:5900 &
sleep 0.5

# Allow the agent user to access the X11 display
xhost +local: 2>/dev/null || true

echo "[agent-vm] Starting agent control server on :9999..."
cd /opt/agent-control
# Run as non-root 'agent' user — Claude Code refuses --dangerously-skip-permissions as root
sudo -u agent -E env "PATH=$PATH" "HOME=/home/agent" "DISPLAY=:99" \
    node dist/server.js &

# Wait for control server to be ready
echo "[agent-vm] Waiting for control server..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:9999/status > /dev/null 2>&1; then
    echo "[agent-vm] Control server ready."
    break
  fi
  sleep 0.5
done

echo "[agent-vm] All services started. Container ready."
echo "[agent-vm] noVNC: http://localhost:6080/vnc.html?autoconnect=true"
echo "[agent-vm] Control API: http://localhost:9999"

# Keep container running
wait
