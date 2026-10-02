FROM apify/actor-node-puppeteer-chrome:20

# The base image already ships Chrome, so skip downloading another copy.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY --chown=myuser package*.json ./
RUN npm --quiet set progress=false \
    && npm ci --omit=dev --omit=optional \
    && npm cache clean --force

COPY --chown=myuser . ./

CMD ["npm", "start", "--silent"]
