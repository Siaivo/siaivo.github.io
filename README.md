# Lampa (Fork)

This repository is a fork of:
https://github.com/yumata/lampa-source

It contains custom changes for this distribution and may differ from upstream behavior.

The app is free and uses public links to display movie and TV metadata.
It does not use private backend infrastructure to distribute content.

## Supported Devices

- LG WebOS
- Samsung Tizen
- MSX
- Android
- macOS
- Windows

## MSX Installation

Manual installation requires your own hosting or local web server.

1. Click the green `Code` button and choose `Download ZIP`.
2. Upload files to your hosting or local web server.
3. Open `msx/start.json` and replace `{domain}` with your domain or IP.
4. Open MSX and install the app.

## Run in Docker

1. Build image:
   `docker build --build-arg domain={domain} -t lampa .`
2. Run container:
   `docker run -p 8080:80 -d --restart unless-stopped -it --name lampa lampa`
