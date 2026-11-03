export const PROBLEM_LABELS: Record<string, string> = {
  CANCELLED: "Cancelled",
  OUT_OF_STOCK: "Out of stock",
  OVERSOLD: "Oversold",
  STUCK: "Delayed",
};

export const PROBLEM_COLORS: Record<string, string> = {
  CANCELLED: "bg-slate-800 text-white",
  OUT_OF_STOCK: "bg-red-600 text-white",
  OVERSOLD: "bg-orange-500 text-white",
  STUCK: "bg-amber-200 text-amber-900",
};

export const CANCEL_REASONS: Record<string, string> = {
  CUSTOMER: "Customer request",
  DECLINED: "Payment declined",
  FRAUD: "Fraud check",
  INVENTORY: "Out of stock",
  STAFF: "Staff error",
  OTHER: "Other",
  UNKNOWN: "Unknown",
};

export const REFUND_LABELS: Record<string, string> = {
  full: "Refunded",
  partial: "Partly refunded",
  none: "Not refunded",
  "n/a": "No charge",
};
