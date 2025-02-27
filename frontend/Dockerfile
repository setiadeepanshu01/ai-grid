# Build stage
FROM oven/bun AS build
WORKDIR /app
COPY . .
RUN bun install
RUN bun run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html

# Configure nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
