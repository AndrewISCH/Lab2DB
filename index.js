const {Client} = require("pg");
const {MongoClient} = require("mongodb");
const {performance} = require("perf_hooks");

const pgClient = new Client({
  user: "postgres",
  host: "localhost",
  database: "cafeDB",
  password: "12345678",
  port: 5432,
});

const mongoUri = "mongodb://localhost:27017";
const mongoClient = new MongoClient(mongoUri);

async function initPostgres() {
  await pgClient.connect();
  await pgClient.query(`
    DROP TABLE IF EXISTS order_items, orders, products, customers, tables;

    CREATE TABLE customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT
    );

    CREATE TABLE tables (
      id SERIAL PRIMARY KEY,
      number INT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('free', 'occupied'))
    );

    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price DECIMAL NOT NULL
    );

    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL,
      table_id INT NOT NULL,
      order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (table_id) REFERENCES tables (id)
    );

    CREATE TABLE order_items (
      id SERIAL PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders (id),
      FOREIGN KEY (product_id) REFERENCES products (id)
    );
  `);
  console.log("PostgreSQL initialized.");
}

async function initMongo() {
  await mongoClient.connect();
  const db = mongoClient.db("cafe");
  await db.collection("customers").deleteMany({});
  await db.collection("menu").deleteMany({});
  await db.collection("orders").deleteMany({});
  console.log("MongoDB initialized.");
}

async function populatePostgres() {
  const customers = [];
  const startPg = performance.now();
  for (let i = 1; i <= 50; i++) {
    customers.push(
      pgClient.query("INSERT INTO customers (name, phone) VALUES ($1, $2)", [
        `Customer ${i}`,
        `+380${Math.floor(100000000 + Math.random() * 900000000)}`,
      ]),
    );
  }
  await Promise.all(customers);

  for (let i = 1; i <= 20; i++) {
    await pgClient.query(
      "INSERT INTO tables (number, status) VALUES ($1, 'free')",
      [i],
    );
  }

  const categories = ["Drinks", "Snacks", "Meals"];
  const products = [];
  for (let i = 1; i <= 30; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    products.push(
      pgClient.query(
        "INSERT INTO products (name, category, price) VALUES ($1, $2, $3)",
        [`Product ${i}`, category, (Math.random() * 50).toFixed(2)],
      ),
    );
  }
  await Promise.all(products);

  for (let i = 1; i <= 100; i++) {
    const customerId = Math.ceil(Math.random() * 50);
    const tableId = Math.ceil(Math.random() * 20);
    const orderRes = await pgClient.query(
      "INSERT INTO orders (customer_id, table_id) VALUES ($1, $2) RETURNING id",
      [customerId, tableId],
    );
    const orderId = orderRes.rows[0].id;

    for (let j = 1; j <= 5; j++) {
      await pgClient.query(
        "INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)",
        [orderId, Math.ceil(Math.random() * 30), Math.ceil(Math.random() * 5)],
      );
    }
  }
  const endPg = performance.now();
  console.log(
    "PostgreSQL insert Query Time:",
    (endPg - startPg).toFixed(2),
    "ms",
  );
}

async function populateMongo() {
  const db = mongoClient.db("cafe");
  const customers = db.collection("customers");
  const menu = db.collection("menu");
  const orders = db.collection("orders");
  const startMg = performance.now();
  const customerDocs = [];
  for (let i = 1; i <= 50; i++) {
    customerDocs.push({
      name: `Customer ${i}`,
      phone: `+380${Math.floor(100000000 + Math.random() * 900000000)}`,
    });
  }
  await customers.insertMany(customerDocs);

  const menuDocs = [];
  const categories = ["Drinks", "Snacks", "Meals"];
  for (let i = 1; i <= 30; i++) {
    menuDocs.push({
      name: `Product ${i}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      price: (Math.random() * 50).toFixed(2),
    });
  }
  await menu.insertMany(menuDocs);

  for (let i = 1; i <= 100; i++) {
    const order = {
      customer: `Customer ${Math.ceil(Math.random() * 50)}`,
      table: Math.ceil(Math.random() * 20),
      order_date: new Date(),
      items: [],
    };

    for (let j = 1; j <= 5; j++) {
      order.items.push({
        product: `Product ${Math.ceil(Math.random() * 30)}`,
        quantity: Math.ceil(Math.random() * 5),
      });
    }

    await orders.insertOne(order);
  }
  const endMg = performance.now();
  console.log("MongoDB insert Query Time:", (endMg - startMg).toFixed(2), "ms");
}

async function testPerformance() {
  const db = mongoClient.db("cafe");
  const ordersMongo = db.collection("orders");

  const startPg = performance.now();
  await pgClient.query(`
    SELECT customers.name, orders.id, products.name AS product_name, order_items.quantity
    FROM customers
    JOIN orders ON customers.id = orders.customer_id
    JOIN order_items ON orders.id = order_items.order_id
    JOIN products ON order_items.product_id = products.id
  `);
  const endPg = performance.now();

  const startMongo = performance.now();
  await ordersMongo.find({}).toArray();
  const endMongo = performance.now();

  console.log(
    "PostgreSQL select Query Time:",
    (endPg - startPg).toFixed(2),
    "ms",
  );
  console.log(
    "MongoDB find Query Time:",
    (endMongo - startMongo).toFixed(2),
    "ms",
  );
}

async function main() {
  try {
    await initPostgres();
    await initMongo();
    await populatePostgres();
    await populateMongo();
    await testPerformance();
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pgClient.end();
    await mongoClient.close();
  }
}

main();
