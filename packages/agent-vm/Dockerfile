FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# System dependencies — real chromium package (not snap stub like Ubuntu 24.04)
RUN apt-get update && apt-get install -y \
    xvfb x11vnc fluxbox \
    novnc websockify \
    chromium \
    curl git jq python3 sudo \
    dbus-x11 xterm procps \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22.x
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Chromium path for Playwright
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Agent control server — install all deps (including devDeps for tsc), compile, then prune
COPY agent-control/ /opt/agent-control/
WORKDIR /opt/agent-control
RUN npm install
RUN npx tsc
RUN npm prune --omit=dev

# Create non-root user for Claude Code (it refuses --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash -G sudo agent \
    && echo "agent ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Workspace — owned by agent user
RUN mkdir -p /workspace && chown agent:agent /workspace

# Agent home directories
RUN mkdir -p /home/agent/.claude && chown -R agent:agent /home/agent

WORKDIR /workspace

# Display config
ENV DISPLAY=:99
ENV RESOLUTION=1920x1080x24

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 6080 9999

ENTRYPOINT ["/entrypoint.sh"]
