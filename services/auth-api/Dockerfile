FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# The startup migration runner reads numbered SQL files from /app/db.
COPY db ./db
EXPOSE 8080
USER node
CMD ["sh", "-c", "npm run migrate && npm start"]
