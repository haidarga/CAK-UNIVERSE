# ============================================================
# CAK AI Ecosystem — ALL-IN-ONE image (always-on, free-VM friendly).
# Runs the Next app + Python scraper sidecar + headless Chrome in ONE
# container, all on localhost — so TikTok/IG/SGE work with no cross-host
# CDP headaches (mirrors the local START.cmd setup exactly).
#   docker compose up -d   →  app on :3000
# ============================================================
FROM node:20-bookworm

# System deps: Python (sidecar), Chromium (SGE CDP), supervisor (run 3 procs).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip chromium supervisor ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Node app: install + build ---
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Python sidecar deps (isolated venv) + its Playwright Chromium ---
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r scraper-service/requirements.txt \
    && /opt/venv/bin/python -m playwright install chromium

# Inside the container everything is localhost.
ENV NODE_ENV=production \
    SCRAPER_SERVICE_URL=http://localhost:8900 \
    LIGHTPANDA_CDP_URL=http://localhost:9222 \
    CHROME_BIN=/usr/bin/chromium

COPY deploy/supervisord.conf /etc/supervisor/conf.d/cakai.conf

EXPOSE 3000
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
