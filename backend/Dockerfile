# C:\Users\RegenU3\eld-app\backend\Dockerfile

FROM node:22-alpine

WORKDIR /app

# Зависимости отдельным слоем (кэшируется)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
