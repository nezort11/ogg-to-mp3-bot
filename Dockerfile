FROM node:16-bullseye

RUN corepack enable && corepack prepare yarn@3 --activate

WORKDIR /app

COPY ./package.json ./package.json
COPY ./yarn.lock ./yarn.lock
COPY ./.yarnrc.yml ./.yarnrc.yml
COPY ./.yarn ./.yarn

RUN yarn

COPY . .

# RUN yarn build

ENV PATH ./node_modules/.bin/:$PATH
USER node
# For running image without docker compose
# CMD yarn handler
