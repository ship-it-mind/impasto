# The whole app as one service: the API, which also serves the web build, on port 8000.
# Everything it keeps is in the SQLite file on /data, so that path needs a persistent volume.

FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
# ffmpeg converts dictation audio; curl is for the health check.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*
# The API runs web/relief/*.ts with node to render concepts and band maps: those scripts need no npm packages.
COPY --from=web /usr/local/bin/node /usr/local/bin/node
RUN pip install --no-cache-dir uv==0.9.5

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-cache
COPY backend/impasto ./impasto
COPY web/relief /app/web/relief
COPY --from=web /app/web/dist /app/web/dist
# The example piece, loaded into the database on start if it isn't there yet.
COPY example /app/example

# A named volume mounted here starts out owned by the app's user.
RUN useradd --create-home impasto && mkdir /data && chown impasto /data
USER impasto
ENV IMPASTO_DB=/data/impasto.db PYTHONUNBUFFERED=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/ > /dev/null
# Trusts forwarded headers from anyone, so only the reverse proxy may reach this port: don't publish it on the host.
# One process only: jobs and sign-in limits live in its memory.
CMD ["/app/backend/.venv/bin/uvicorn", "impasto.api:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
