# iDeliver OCR Hermes

Dedicated OCR/extraction agent for iDeliver intake photos.

It exposes one production endpoint:

- `POST /extract-shipment-photo`

The intake PWA sends one image/order at a time and receives strict structured shipment JSON.

Required environment:

- `OPENROUTER_API_KEY`
- `HERMES_OCR_TOKEN`

Optional environment:

- `HERMES_OCR_MODEL`
- `PORT`
