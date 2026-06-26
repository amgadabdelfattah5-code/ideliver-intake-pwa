export type ExtractedShipmentFields = {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientGovernorate: string;
  recipientCity: string;
  product: string;
  price: number | null;
  shippingFeePrinted: number | null;
  COD: number | null;
  notes: string;
};

export type ExtractionResult = {
  provider: string;
  model: string;
  rawRef?: string | null;
  fields: ExtractedShipmentFields;
  confidence: number;
  fieldConfidence?: Record<string, number>;
  warnings?: string[];
};

export type ExtractionOrderInput = {
  orderId: string;
  sessionId: string;
  sequence: number;
  imageDataUrl: string;
  merchant: {
    id: string;
    wpUserId: number;
    merchantId: string;
    name: string;
    phone?: string | null;
  };
};
