FROM node:16

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

ENV NODE_ENV=production

# Render (and most PaaS hosts) inject PORT at runtime; the app already
# reads process.env.PORT, so this is just documentation for local `docker run`
EXPOSE 8080

CMD ["npm", "start"]
