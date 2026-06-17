const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =========================================================================
// DEKLARASI URL SERVICE PENDUKUNG
// =========================================================================
const MENU_SERVICE_URL    = process.env.MENU_SERVICE_URL    || "http://menu-service:3003";
const ORDER_SERVICE_URL   = process.env.ORDER_SERVICE_URL   || "http://order-service:3001";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://payment-service:3004";
const REPORT_SERVICE_URL  = process.env.REPORT_SERVICE_URL  || "http://report-service:8000";

// =========================================================================
// ENDPOINT REST (menu, orders, payments, report)
// =========================================================================
// ... semua route REST kamu tetap di sini persis seperti sebelumnya ...
// (tidak perlu dihapus)

// =========================================================================
// GRAPHQL SCHEMA
// =========================================================================
const schema = buildSchema(`
  type Menu {
    id: Int
    name: String
    price: Int
    category: String
  }

  type Order {
    id: String
    menuId: String
    quantity: Int
    totalPrice: Int
    status: String
  }

  type Payment {
    id: Int
    order_id: String
    amount: String
    method: String
    status: String
  }

  type DailyReport {
    total_orders: Int
    total_revenue: Int
    total_payments: Int
  }

  type SystemStatus {
    menu_service: String
    order_service: String
    payment_service: String
    report_service: String
  }

  type Query {
    systemStatus: SystemStatus
    menus: [Menu]
    orders: [Order]
    payments: [Payment]
    dailyReport: DailyReport
  }

  type Mutation {
    createOrder(menuId: String, quantity: Int): Order
    updateOrderStatus(id: String, status: String): Order
    deleteOrder(id: String): String
  }
`);

// =========================================================================
// RESOLVER
// =========================================================================
const root = {
  systemStatus: async () => {
    const fetchStatus = async (url) => {
      try {
        const res = await fetch(`${url}/health`);
        const data = await res.json();
        return data.status || "running";
      } catch {
        return "unreachable";
      }
    };
    return {
      menu_service:    await fetchStatus(MENU_SERVICE_URL),
      order_service:   await fetchStatus(ORDER_SERVICE_URL),
      payment_service: await fetchStatus(PAYMENT_SERVICE_URL),
      report_service:  await fetchStatus(REPORT_SERVICE_URL),
    };
  },

  menus: async () => {
    const res  = await fetch(`${MENU_SERVICE_URL}/menu`);
    const data = await res.json();
    return data.result || data;
  },

  orders: async () => {
    const res  = await fetch(`${ORDER_SERVICE_URL}/orders`);
    const data = await res.json();
    return data.result || data;
  },

  payments: async () => {
    const res  = await fetch(`${PAYMENT_SERVICE_URL}/payments`);
    const data = await res.json();
    return data.result || data;
  },

  dailyReport: async () => {
    const res  = await fetch(`${REPORT_SERVICE_URL}/report/daily`);
    const data = await res.json();
    return data.result || data;
  },

  createOrder: async ({ menuId, quantity }) => {
    const res = await fetch(`${ORDER_SERVICE_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuId, quantity })
    });
    const data = await res.json();
    return data.result || data;
  },

  updateOrderStatus: async ({ id, status }) => {
    const res = await fetch(`${ORDER_SERVICE_URL}/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    return data.result || data;
  },

  deleteOrder: async ({ id }) => {
    await fetch(`${ORDER_SERVICE_URL}/orders/${id}`, { method: "DELETE" });
    return `Order ${id} berhasil dihapus`;
  },
};

// =========================================================================
// MOUNT GRAPHQL ENDPOINT
// =========================================================================
app.use("/graphql", graphqlHTTP({
  schema,
  rootValue: root,
  graphiql: true
}));

// =========================================================================
// START SERVER
// =========================================================================
app.listen(PORT, () => {
  console.log(`API Gateway berjalan pada port ${PORT}`);
  console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
});
