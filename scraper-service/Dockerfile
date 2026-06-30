# ============================================================
# Scraper sidecar (TikTok + Instagram) — cloud worker image.
# Playwright base ships Chromium for TikTokApi's msToken generation.
# ============================================================
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install chromium

COPY . .

EXPOSE 8900
# 0.0.0.0 so the Vercel app (via SCRAPER_SERVICE_URL) can reach it.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8900"]
