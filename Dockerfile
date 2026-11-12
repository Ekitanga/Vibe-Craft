# Vibecraft store: Node.js app serving the API and the storefront/admin pages.
FROM node:20.19.5-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5000

WORKDIR /app

# Install dependencies first so code changes don't re-download packages.
COPY Server/package.json Server/package-lock.json ./Server/
RUN cd Server && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY Server ./Server
COPY Client ./Client
RUN mkdir -p Server/uploads && chown -R node:node Server/uploads

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Database migrations run automatically on start.
CMD ["node", "Server/src/server.js"]
