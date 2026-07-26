FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
