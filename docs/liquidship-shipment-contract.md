# LiquidShip Shipment Contract

Date verified: 2026-06-27

Endpoint:

```text
POST /wp-json/liquidship/v1/shipment
```

Auth:

```text
Basic auth with a WordPress user that can edit shop orders.
```

Required request shape:

```json
{
  "sender": {
    "id": "493687"
  },
  "receiver": {
    "name": "Ahmed Hassan",
    "phone": "01012345678",
    "address": "12 Abbas El Akkad St, Nasr City, Cairo",
    "governorate": "Cairo"
  },
  "products": [
    {
      "name": "Blue Hoodie",
      "qty": 1,
      "price": 450
    }
  ],
  "financials": {
    "shipping_fee": 60,
    "collected_value": 510
  }
}
```

Validation enforced by LiquidShip:

- `sender.id` or sender `name` plus `phone` is required.
- Receiver `name`, `phone`, `address`, and `governorate` are required.
- At least one product is required unless `financials.product_value` is supplied.

Successful response shape:

```json
{
  "success": true,
  "message": "Order created successfully.",
  "order_id": 12345,
  "tracking_number": "TRACKING_OR_HASH",
  "user_id": 80,
  "merchant_id": "493687",
  "merchant_brand_name": "Merchant name"
}
```

Current PWA mapping:

- Merchant cache `merchantId` -> `sender.id`
- `recipientName` -> `receiver.name`
- `recipientPhone` -> `receiver.phone`
- `recipientAddress` -> `receiver.address`
- `recipientGovernorate` -> `receiver.governorate`
- `product` -> `products[0].name`
- `price` -> `products[0].price`
- `shippingFeePrinted` -> `financials.shipping_fee`
- `COD` -> `financials.collected_value`

Current idempotency:

- Local PWA guard: already submitted orders, or orders with `shipmentId`, return success without calling LiquidShip again.
- Remote LiquidShip idempotency support has not been found yet. Do not rely on remote duplicate protection until proven.
