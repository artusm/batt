FROM node:12.16.3-alpine3.11
RUN mkdir /lq
WORKDIR /lq

ADD package.json /lq/
ADD yarn.lock /lq/
RUN npm install

ADD public/ /lq/public
ADD src/ /lq/src/
RUN npm run build

FROM golang:alpine
ADD docker /lq/
WORKDIR /lq
RUN go build -mod=vendor -o lq-startup ./...

FROM nginx:alpine

COPY --from=0 /lq/build/ /lq
COPY --from=1 /lq/lq-startup /
COPY --from=1 /lq/nginx /templates/
COPY --from=1 /lq/config.json /templates/

RUN adduser -u 1000 -D notroot
RUN touch /var/run/nginx.pid
RUN chown notroot /lq /etc/nginx/conf.d/ /var/cache/nginx/ /var/run/nginx.pid

RUN rm /etc/nginx/conf.d/default.conf

WORKDIR /lq
USER 1000
ENTRYPOINT ["/lq-startup"]

