FROM node:20-alpine
RUN apk add --no-cache wireguard-tools docker-cli
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
