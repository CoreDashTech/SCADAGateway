FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY client ./client
COPY app ./app
COPY config ./config
ENV NODE_ENV=production CD_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "src/index.js", "config/plant-a.yaml"]
