export const ORDER_FIELDS = /* GraphQL */ `
  fragment OrderFields on Order {
    id
    name
    email
    createdAt
    updatedAt
    cancelledAt
    cancelReason
    closed
    test
    tags
    displayFinancialStatus
    displayFulfillmentStatus
    totalPriceSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount } }
    customer { id displayName numberOfOrders amountSpent { amount } }
    lineItems(first: 30) {
      nodes {
        id
        sku
        title
        variantTitle
        quantity
        unfulfilledQuantity
        variant { id inventoryItem { id tracked } }
      }
    }
  }
`;

export const ORDERS_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query Orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { ...OrderFields }
    }
  }
`;

export const ORDER_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query Order($id: ID!) { order(id: $id) { ...OrderFields } }
`;

export const INVENTORY_QUERY = /* GraphQL */ `
  query Inventory($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on InventoryItem {
        id
        sku
        tracked
        inventoryLevels(first: 20) {
          nodes {
            location { id name }
            quantities(names: ["available", "on_hand", "committed"]) { name quantity }
          }
        }
      }
    }
  }
`;

export const SHOP_QUERY = /* GraphQL */ `query { shop { name myshopifyDomain } }`;

export const WEBHOOKS_QUERY = /* GraphQL */ `
  query { webhookSubscriptions(first: 50) { nodes { id topic uri } } }
`;

export const WEBHOOK_CREATE = /* GraphQL */ `
  mutation Create($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`;

export interface GqlOrder {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  closed: boolean;
  test: boolean;
  tags: string[];
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string } } | null;
  customer: { id: string; displayName: string | null; numberOfOrders: string | number | null; amountSpent: { amount: string } | null } | null;
  lineItems: {
    nodes: {
      id: string;
      sku: string | null;
      title: string;
      variantTitle: string | null;
      quantity: number;
      unfulfilledQuantity: number;
      variant: { id: string; inventoryItem: { id: string; tracked: boolean } | null } | null;
    }[];
  };
}

export interface GqlInventoryItem {
  id: string;
  sku: string | null;
  tracked: boolean;
  inventoryLevels: {
    nodes: { location: { id: string; name: string }; quantities: { name: string; quantity: number }[] }[];
  };
}
