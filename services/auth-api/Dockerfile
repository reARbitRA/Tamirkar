FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 8080
USER node
CMD ["sh", "-c", "npm run migrate && npm start"]
