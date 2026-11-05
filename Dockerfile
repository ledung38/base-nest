FROM node:20.11.1-alpine AS base

# builder stage
FROM base AS builder 
ARG APP 
WORKDIR /usr/src/app 
COPY package.json ./ 
RUN npm install
COPY . . 
RUN npm run build

# production stage
FROM base AS production 
ARG APP 
ARG NODE_ENV=production 
ENV NODE_ENV=${NODE_ENV} 
WORKDIR /usr/src/app 

RUN apk add --no-cache postgresql-client;

COPY package.json ./ 
RUN npm install --production
COPY --from=builder /usr/src/app/dist ./dist 

CMD node dist/main