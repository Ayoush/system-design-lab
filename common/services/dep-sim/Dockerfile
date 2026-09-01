# No package.json needed — server.js only uses Node's built-in http module.
FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 4000
CMD ["node", "server.js"]
