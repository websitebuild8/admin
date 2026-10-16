export type PartnerHistory = {
  partner: {
    id: string;
    businessName: string;
    pickupAddress: string;
    pickupArea: string;
    account: { name: string; phone: string; status: string };
  };
  summary: {
    registered: number;
    pickedUp: number;
    delivered: number;
    cancelled: number;
    eligibleCount: number;
    eligibleTotal: number;
    outstanding: number;
  };
  items: {
    id: string;
    publicId: string;
    externalReference: string;
    recipientName: string;
    destination: string;
    state: string;
    fee: number;
    codAmount: number;
    deliveredAt: string | null;
    registeredAt: string;
    driver: { name: string } | null;
    invoiceLine: { invoice: { id: string; publicId: string } } | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
