# Anchor Browser Farm Unit
# "Rock this like we're 1993"

FROM node:18-slim

# 1. Install Chrome & Dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# 2. Setup Workdir
WORKDIR /app

# 3. Copy Agent & Install
COPY agent/package*.json ./agent/
RUN cd agent && npm install

# 4. Copy Scripts & Extension
COPY scripts ./scripts
COPY extension ./extension
COPY word ./
COPY demo ./demo

# 5. Build Extension
RUN node scripts/build-bundle.mjs

# 6. Expose Ports
# 9222: Chrome DevTools (The Eyes)
# 8787: Agent API (The Brain)
EXPOSE 9222 8787

# 7. Launch the Spine
# We use a custom entrypoint to start Xvfb (if needed) or headless Chrome + Agent
CMD ["./scripts/anchor-stack.sh"]
