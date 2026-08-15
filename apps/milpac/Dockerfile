FROM node:bookworm as base
WORKDIR /usr/app
COPY package.json .
RUN apt-get update && apt-get install -y  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libreoffice ghostscript python3 python-is-python3
RUN npm install --quiet
COPY . .
RUN chmod +x libs/unoconv
ENV PATH="${PATH}:/usr/app/libs"
RUN mkdir ~/.fonts
COPY fonts/* /root/.fonts/
RUN fc-cache -f -v
CMD ["node","src/server.js"]
FROM base as production

ENV NODE_ENV=production

CMD ["node", "src/server.js"]

FROM base as dev

ENV NODE_ENV=development
CMD ["node", "src/server.js"]