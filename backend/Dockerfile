FROM node:20-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache openssl

COPY package*.json ./

RUN npm install

COPY . .

# Expose API port
EXPOSE 3000

# Copy and run entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

CMD ["npm", "run", "dev"]
