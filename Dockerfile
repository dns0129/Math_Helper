FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html ./
COPY src ./src
COPY lib ./lib
RUN npm run build && npm prune --omit=dev --omit=optional --ignore-scripts

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements-math.txt /tmp/requirements-math.txt
RUN python3 -m venv /opt/math-env && /opt/math-env/bin/python -m pip install --no-cache-dir -r /tmp/requirements-math.txt
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.mjs ./
COPY lib ./lib
COPY scripts ./scripts
COPY codex-skills ./codex-skills
RUN mkdir -p /app/.local && chown -R node:node /app/.local
ENV NODE_ENV=production MATH_AI_PROVIDER=deepseek MATH_BIND_HOST=0.0.0.0 PORT=8791 DEEPSEEK_CONFIG_FILE=/app/.local/deepseek.json MATH_PYTHON=/opt/math-env/bin/python
USER node
VOLUME ["/app/.local"]
EXPOSE 8791
CMD ["node", "server.mjs"]
