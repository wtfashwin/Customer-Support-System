import { PrismaClient, OrderStatus, PaymentStatus, PaymentMethod, RefundStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Clear existing data
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.knowledgeBase.deleteMany();
  await prisma.user.deleteMany();

  console.log("📦 Creating users...");

  // Create 5 users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "john.smith@example.com",
        name: "John Smith",
      },
    }),
    prisma.user.create({
      data: {
        email: "sarah.johnson@example.com",
        name: "Sarah Johnson",
      },
    }),
    prisma.user.create({
      data: {
        email: "mike.wilson@example.com",
        name: "Mike Wilson",
      },
    }),
    prisma.user.create({
      data: {
        email: "emily.davis@example.com",
        name: "Emily Davis",
      },
    }),
    prisma.user.create({
      data: {
        email: "alex.martinez@example.com",
        name: "Alex Martinez",
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  console.log("📦 Creating orders...");

  // Create 20 orders with various statuses
  const orderData = [
    {
      userId: users[0]!.id,
      orderNumber: "ORD-2024-001",
      status: OrderStatus.delivered,
      items: [
        { name: "Wireless Headphones", quantity: 1, price: 149.99 },
        { name: "Phone Case", quantity: 2, price: 24.99 },
      ],
      totalAmount: 199.97,
      trackingId: "TRK-1234567890",
      carrier: "FedEx",
      deliveryDate: new Date("2024-01-10"),
      shippingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[0]!.id,
      orderNumber: "ORD-2024-002",
      status: OrderStatus.shipped,
      items: [
        { name: "Laptop Stand", quantity: 1, price: 79.99 },
      ],
      totalAmount: 79.99,
      trackingId: "TRK-2345678901",
      carrier: "UPS",
      shippingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[0]!.id,
      orderNumber: "ORD-2024-003",
      status: OrderStatus.processing,
      items: [
        { name: "Mechanical Keyboard", quantity: 1, price: 159.99 },
        { name: "Mouse Pad XL", quantity: 1, price: 29.99 },
      ],
      totalAmount: 189.98,
      shippingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[1]!.id,
      orderNumber: "ORD-2024-004",
      status: OrderStatus.delivered,
      items: [
        { name: "Smart Watch", quantity: 1, price: 299.99 },
      ],
      totalAmount: 299.99,
      trackingId: "TRK-3456789012",
      carrier: "USPS",
      deliveryDate: new Date("2024-01-05"),
      shippingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[1]!.id,
      orderNumber: "ORD-2024-005",
      status: OrderStatus.out_for_delivery,
      items: [
        { name: "Bluetooth Speaker", quantity: 1, price: 89.99 },
        { name: "USB-C Cable", quantity: 3, price: 14.99 },
      ],
      totalAmount: 134.96,
      trackingId: "TRK-4567890123",
      carrier: "FedEx",
      shippingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[1]!.id,
      orderNumber: "ORD-2024-006",
      status: OrderStatus.cancelled,
      items: [
        { name: "Gaming Mouse", quantity: 1, price: 69.99 },
      ],
      totalAmount: 69.99,
      shippingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[2]!.id,
      orderNumber: "ORD-2024-007",
      status: OrderStatus.delivered,
      items: [
        { name: "Webcam HD", quantity: 1, price: 129.99 },
        { name: "Ring Light", quantity: 1, price: 49.99 },
      ],
      totalAmount: 179.98,
      trackingId: "TRK-5678901234",
      carrier: "UPS",
      deliveryDate: new Date("2024-01-08"),
      shippingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[2]!.id,
      orderNumber: "ORD-2024-008",
      status: OrderStatus.pending,
      items: [
        { name: "Monitor 27 inch", quantity: 1, price: 349.99 },
      ],
      totalAmount: 349.99,
      shippingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[2]!.id,
      orderNumber: "ORD-2024-009",
      status: OrderStatus.shipped,
      items: [
        { name: "Desk Lamp", quantity: 2, price: 39.99 },
        { name: "Monitor Arm", quantity: 1, price: 89.99 },
      ],
      totalAmount: 169.97,
      trackingId: "TRK-6789012345",
      carrier: "USPS",
      shippingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[3]!.id,
      orderNumber: "ORD-2024-010",
      status: OrderStatus.delivered,
      items: [
        { name: "Tablet 10 inch", quantity: 1, price: 449.99 },
        { name: "Tablet Case", quantity: 1, price: 34.99 },
        { name: "Screen Protector", quantity: 2, price: 9.99 },
      ],
      totalAmount: 504.96,
      trackingId: "TRK-7890123456",
      carrier: "FedEx",
      deliveryDate: new Date("2024-01-03"),
      shippingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[3]!.id,
      orderNumber: "ORD-2024-011",
      status: OrderStatus.returned,
      items: [
        { name: "Wireless Earbuds", quantity: 1, price: 199.99 },
      ],
      totalAmount: 199.99,
      trackingId: "TRK-8901234567",
      carrier: "UPS",
      shippingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[3]!.id,
      orderNumber: "ORD-2024-012",
      status: OrderStatus.processing,
      items: [
        { name: "Power Bank", quantity: 2, price: 49.99 },
        { name: "Charging Cable Set", quantity: 1, price: 29.99 },
      ],
      totalAmount: 129.97,
      shippingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[4]!.id,
      orderNumber: "ORD-2024-013",
      status: OrderStatus.delivered,
      items: [
        { name: "External SSD 1TB", quantity: 1, price: 129.99 },
      ],
      totalAmount: 129.99,
      trackingId: "TRK-9012345678",
      carrier: "FedEx",
      deliveryDate: new Date("2024-01-12"),
      shippingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[4]!.id,
      orderNumber: "ORD-2024-014",
      status: OrderStatus.shipped,
      items: [
        { name: "USB Hub", quantity: 1, price: 44.99 },
        { name: "HDMI Cable", quantity: 2, price: 19.99 },
      ],
      totalAmount: 84.97,
      trackingId: "TRK-0123456789",
      carrier: "USPS",
      shippingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[4]!.id,
      orderNumber: "ORD-2024-015",
      status: OrderStatus.pending,
      items: [
        { name: "Ergonomic Chair", quantity: 1, price: 499.99 },
      ],
      totalAmount: 499.99,
      shippingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[0]!.id,
      orderNumber: "ORD-2024-016",
      status: OrderStatus.delivered,
      items: [
        { name: "Noise Cancelling Headphones", quantity: 1, price: 349.99 },
      ],
      totalAmount: 349.99,
      trackingId: "TRK-1122334455",
      carrier: "UPS",
      deliveryDate: new Date("2024-01-01"),
      shippingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[1]!.id,
      orderNumber: "ORD-2024-017",
      status: OrderStatus.processing,
      items: [
        { name: "Wireless Charger", quantity: 1, price: 39.99 },
        { name: "Phone Stand", quantity: 1, price: 24.99 },
      ],
      totalAmount: 64.98,
      shippingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[2]!.id,
      orderNumber: "ORD-2024-018",
      status: OrderStatus.out_for_delivery,
      items: [
        { name: "Keyboard Wrist Rest", quantity: 1, price: 29.99 },
      ],
      totalAmount: 29.99,
      trackingId: "TRK-2233445566",
      carrier: "FedEx",
      shippingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[3]!.id,
      orderNumber: "ORD-2024-019",
      status: OrderStatus.shipped,
      items: [
        { name: "Drawing Tablet", quantity: 1, price: 249.99 },
        { name: "Stylus Pen", quantity: 1, price: 29.99 },
      ],
      totalAmount: 279.98,
      trackingId: "TRK-3344556677",
      carrier: "UPS",
      shippingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[4]!.id,
      orderNumber: "ORD-2024-020",
      status: OrderStatus.delivered,
      items: [
        { name: "Desk Organizer", quantity: 1, price: 34.99 },
        { name: "Cable Management Kit", quantity: 1, price: 19.99 },
      ],
      totalAmount: 54.98,
      trackingId: "TRK-4455667788",
      carrier: "USPS",
      deliveryDate: new Date("2024-01-09"),
      shippingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
  ];

  const orders = await Promise.all(
    orderData.map((order) => prisma.order.create({ data: order }))
  );

  console.log(`✅ Created ${orders.length} orders`);

  console.log("💳 Creating payments...");

  // Create 30 payments including refunds
  const paymentData = [
    {
      userId: users[0]!.id,
      orderId: orders[0]!.id,
      invoiceNumber: "INV-2024-001",
      amount: 199.97,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[0]!.id,
      orderId: orders[1]!.id,
      invoiceNumber: "INV-2024-002",
      amount: 79.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.paypal,
      billingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[0]!.id,
      orderId: orders[2]!.id,
      invoiceNumber: "INV-2024-003",
      amount: 189.98,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[1]!.id,
      orderId: orders[3]!.id,
      invoiceNumber: "INV-2024-004",
      amount: 299.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.debit_card,
      billingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[1]!.id,
      orderId: orders[4]!.id,
      invoiceNumber: "INV-2024-005",
      amount: 134.96,
      status: PaymentStatus.completed,
      method: PaymentMethod.apple_pay,
      billingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[1]!.id,
      orderId: orders[5]!.id,
      invoiceNumber: "INV-2024-006",
      amount: 69.99,
      status: PaymentStatus.refunded,
      method: PaymentMethod.credit_card,
      refundStatus: RefundStatus.completed,
      refundAmount: 69.99,
      refundReason: "Order cancelled by customer",
      billingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[2]!.id,
      orderId: orders[6]!.id,
      invoiceNumber: "INV-2024-007",
      amount: 179.98,
      status: PaymentStatus.completed,
      method: PaymentMethod.google_pay,
      billingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[2]!.id,
      orderId: orders[7]!.id,
      invoiceNumber: "INV-2024-008",
      amount: 349.99,
      status: PaymentStatus.pending,
      method: PaymentMethod.bank_transfer,
      billingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[2]!.id,
      orderId: orders[8]!.id,
      invoiceNumber: "INV-2024-009",
      amount: 169.97,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[3]!.id,
      orderId: orders[9]!.id,
      invoiceNumber: "INV-2024-010",
      amount: 504.96,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[3]!.id,
      orderId: orders[10]!.id,
      invoiceNumber: "INV-2024-011",
      amount: 199.99,
      status: PaymentStatus.refunded,
      method: PaymentMethod.paypal,
      refundStatus: RefundStatus.completed,
      refundAmount: 199.99,
      refundReason: "Product returned - defective",
      billingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[3]!.id,
      orderId: orders[11]!.id,
      invoiceNumber: "INV-2024-012",
      amount: 129.97,
      status: PaymentStatus.completed,
      method: PaymentMethod.debit_card,
      billingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[4]!.id,
      orderId: orders[12]!.id,
      invoiceNumber: "INV-2024-013",
      amount: 129.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[4]!.id,
      orderId: orders[13]!.id,
      invoiceNumber: "INV-2024-014",
      amount: 84.97,
      status: PaymentStatus.completed,
      method: PaymentMethod.apple_pay,
      billingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[4]!.id,
      orderId: orders[14]!.id,
      invoiceNumber: "INV-2024-015",
      amount: 499.99,
      status: PaymentStatus.pending,
      method: PaymentMethod.bank_transfer,
      billingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[0]!.id,
      orderId: orders[15]!.id,
      invoiceNumber: "INV-2024-016",
      amount: 349.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[1]!.id,
      orderId: orders[16]!.id,
      invoiceNumber: "INV-2024-017",
      amount: 64.98,
      status: PaymentStatus.completed,
      method: PaymentMethod.google_pay,
      billingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[2]!.id,
      orderId: orders[17]!.id,
      invoiceNumber: "INV-2024-018",
      amount: 29.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.paypal,
      billingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[3]!.id,
      orderId: orders[18]!.id,
      invoiceNumber: "INV-2024-019",
      amount: 279.98,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[4]!.id,
      orderId: orders[19]!.id,
      invoiceNumber: "INV-2024-020",
      amount: 54.98,
      status: PaymentStatus.completed,
      method: PaymentMethod.debit_card,
      billingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    // Additional payments (some with refunds pending)
    {
      userId: users[0]!.id,
      invoiceNumber: "INV-2024-021",
      amount: 89.99,
      status: PaymentStatus.partially_refunded,
      method: PaymentMethod.credit_card,
      refundStatus: RefundStatus.completed,
      refundAmount: 30.00,
      refundReason: "Partial refund - item price adjustment",
      billingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[1]!.id,
      invoiceNumber: "INV-2024-022",
      amount: 159.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.paypal,
      refundStatus: RefundStatus.pending,
      refundReason: "Customer requested refund",
      billingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[2]!.id,
      invoiceNumber: "INV-2024-023",
      amount: 75.00,
      status: PaymentStatus.failed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[3]!.id,
      invoiceNumber: "INV-2024-024",
      amount: 225.50,
      status: PaymentStatus.completed,
      method: PaymentMethod.apple_pay,
      refundStatus: RefundStatus.processing,
      refundAmount: 225.50,
      refundReason: "Wrong item shipped",
      billingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[4]!.id,
      invoiceNumber: "INV-2024-025",
      amount: 199.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.google_pay,
      billingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
    {
      userId: users[0]!.id,
      invoiceNumber: "INV-2024-026",
      amount: 449.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.bank_transfer,
      billingAddress: { street: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    },
    {
      userId: users[1]!.id,
      invoiceNumber: "INV-2024-027",
      amount: 34.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.debit_card,
      refundStatus: RefundStatus.rejected,
      refundReason: "Outside refund window",
      billingAddress: { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    },
    {
      userId: users[2]!.id,
      invoiceNumber: "INV-2024-028",
      amount: 599.99,
      status: PaymentStatus.completed,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    },
    {
      userId: users[3]!.id,
      invoiceNumber: "INV-2024-029",
      amount: 124.50,
      status: PaymentStatus.completed,
      method: PaymentMethod.paypal,
      refundStatus: RefundStatus.approved,
      refundAmount: 124.50,
      refundReason: "Product not as described",
      billingAddress: { street: "321 Elm Blvd", city: "Houston", state: "TX", zip: "77001" },
    },
    {
      userId: users[4]!.id,
      invoiceNumber: "INV-2024-030",
      amount: 89.99,
      status: PaymentStatus.pending,
      method: PaymentMethod.credit_card,
      billingAddress: { street: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    },
  ];

  const payments = await Promise.all(
    paymentData.map((payment) => prisma.payment.create({ data: payment }))
  );

  console.log(`✅ Created ${payments.length} payments`);

  console.log("📚 Creating knowledge base articles...");

  // Create knowledge base articles
  const kbArticles = await Promise.all([
    prisma.knowledgeBase.create({
      data: {
        category: "Account",
        question: "How do I reset my password?",
        answer: "To reset your password, go to the login page and click 'Forgot Password'. Enter your email address and we'll send you a password reset link. The link expires in 24 hours. If you don't receive the email, check your spam folder or contact support.",
        keywords: ["password", "reset", "forgot", "login", "account", "access"],
        priority: 10,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Account",
        question: "How do I update my email address?",
        answer: "To update your email address, log into your account and go to Settings > Account Information. Click 'Edit' next to your email, enter your new email address, and verify it through the confirmation email we'll send. Your old email will remain active until you confirm the new one.",
        keywords: ["email", "update", "change", "account", "settings"],
        priority: 8,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Orders",
        question: "How do I track my order?",
        answer: "You can track your order by logging into your account and going to 'My Orders'. Click on the order you want to track and you'll see the current status and tracking information. You can also use the tracking number provided in your shipping confirmation email on the carrier's website.",
        keywords: ["track", "tracking", "order", "shipment", "delivery", "status"],
        priority: 10,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Orders",
        question: "Can I modify or cancel my order?",
        answer: "You can modify or cancel your order within 1 hour of placing it, as long as it hasn't been processed yet. Go to 'My Orders', find your order, and click 'Modify' or 'Cancel'. If the option isn't available, the order has already been processed. Contact support for assistance with processed orders.",
        keywords: ["modify", "cancel", "change", "order", "edit"],
        priority: 9,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Orders",
        question: "What are your shipping options?",
        answer: "We offer Standard Shipping (5-7 business days), Express Shipping (2-3 business days), and Next Day Delivery (order by 2pm). Shipping costs vary based on location and order value. Orders over $50 qualify for free standard shipping. International shipping is available to select countries.",
        keywords: ["shipping", "delivery", "options", "time", "cost", "express"],
        priority: 8,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Returns",
        question: "What is your return policy?",
        answer: "We accept returns within 30 days of delivery for most items in original condition with tags attached. Electronics have a 15-day return window. To initiate a return, go to 'My Orders', select the item, and click 'Return Item'. You'll receive a prepaid shipping label. Refunds are processed within 5-7 business days after we receive the item.",
        keywords: ["return", "policy", "refund", "exchange", "send back"],
        priority: 10,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Returns",
        question: "How do I exchange an item?",
        answer: "To exchange an item, initiate a return through 'My Orders' and select 'Exchange' instead of 'Refund'. Choose the new size/color/variant you want. The exchange will be shipped once we receive your return. If the new item costs more, you'll be charged the difference. If it costs less, we'll refund the difference.",
        keywords: ["exchange", "swap", "different", "size", "color", "return"],
        priority: 7,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Billing",
        question: "What payment methods do you accept?",
        answer: "We accept all major credit cards (Visa, MasterCard, American Express, Discover), debit cards, PayPal, Apple Pay, Google Pay, and bank transfers. For orders over $200, we also offer financing options through Affirm. All payments are processed securely through encrypted connections.",
        keywords: ["payment", "methods", "credit card", "paypal", "apple pay", "billing"],
        priority: 9,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Billing",
        question: "How do I request a refund?",
        answer: "To request a refund, first initiate a return through 'My Orders'. Once we receive and inspect the returned item, refunds are processed within 5-7 business days. Credit card refunds may take an additional 3-5 business days to appear on your statement. PayPal refunds are typically faster.",
        keywords: ["refund", "money back", "return", "billing", "payment"],
        priority: 10,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Billing",
        question: "Why was my payment declined?",
        answer: "Payments can be declined for several reasons: insufficient funds, incorrect card details, expired card, or bank security measures. Please verify your card information and try again. If the issue persists, contact your bank or try a different payment method. Our support team can help if you continue experiencing issues.",
        keywords: ["payment", "declined", "failed", "card", "error", "billing"],
        priority: 8,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Products",
        question: "How do I find product specifications?",
        answer: "Product specifications are available on each product page under the 'Specifications' or 'Details' tab. This includes dimensions, materials, compatibility, and technical specs. If you need additional information not listed, please contact our support team and we'll be happy to help.",
        keywords: ["specifications", "specs", "details", "product", "info", "dimensions"],
        priority: 6,
      },
    }),
    prisma.knowledgeBase.create({
      data: {
        category: "Products",
        question: "Do you offer warranties?",
        answer: "Yes! All electronics come with a minimum 1-year manufacturer warranty. Extended warranties (2-3 years) are available for purchase at checkout. Warranty covers manufacturing defects and malfunctions under normal use. Accidental damage protection can be added for an additional fee.",
        keywords: ["warranty", "guarantee", "protection", "coverage", "repair"],
        priority: 7,
      },
    }),
  ]);

  console.log(`✅ Created ${kbArticles.length} knowledge base articles`);

  console.log("💬 Creating sample conversations...");

  // Create sample conversations with messages
  const conversation1 = await prisma.conversation.create({
    data: {
      userId: users[0]!.id,
      title: "Order tracking inquiry",
      status: "resolved",
      metadata: { lastAgent: "order", resolved: true },
      messages: {
        create: [
          {
            role: "user",
            content: "Where is my order ORD-2024-001?",
          },
          {
            role: "assistant",
            content: "I found your order ORD-2024-001. Great news - it was delivered on January 10th, 2024! The package was delivered via FedEx with tracking number TRK-1234567890. Your order included Wireless Headphones and 2 Phone Cases for a total of $199.97. Is there anything else I can help you with regarding this order?",
            agentType: "order",
            toolCalls: JSON.stringify([{ tool: "getOrderDetails", args: { orderNumber: "ORD-2024-001" } }]),
            reasoning: "User is asking about order status. Routing to Order Agent. Using getOrderDetails tool to fetch order information.",
          },
          {
            role: "user",
            content: "Thanks! That's all I needed.",
          },
          {
            role: "assistant",
            content: "You're welcome! If you have any other questions about your orders or need assistance with anything else, feel free to ask anytime. Have a great day!",
            agentType: "support",
          },
        ],
      },
    },
  });

  const conversation2 = await prisma.conversation.create({
    data: {
      userId: users[1]!.id,
      title: "Refund status check",
      status: "active",
      metadata: { lastAgent: "billing" },
      messages: {
        create: [
          {
            role: "user",
            content: "I cancelled my order last week. When will I get my refund?",
          },
          {
            role: "assistant",
            content: "I can help you check on your refund status. Let me look up your recent cancelled orders and refund information.",
            agentType: "router",
            reasoning: "User is asking about refund status. This is a billing-related query. Routing to Billing Agent.",
          },
          {
            role: "assistant",
            content: "I found your cancelled order (ORD-2024-006) for the Gaming Mouse ($69.99). Good news - your refund has been fully processed! The refund was completed and the $69.99 should appear in your credit card account within 3-5 business days if it hasn't already. The refund was processed under invoice INV-2024-006. Is there anything else I can help you with?",
            agentType: "billing",
            toolCalls: JSON.stringify([
              { tool: "getPaymentHistory", args: { userId: users[1]!.id } },
              { tool: "checkRefundStatus", args: { invoiceNumber: "INV-2024-006" } },
            ]),
            reasoning: "Looking up user's payment history to find cancelled order refunds. Found completed refund for INV-2024-006.",
          },
        ],
      },
    },
  });

  const conversation3 = await prisma.conversation.create({
    data: {
      userId: users[2]!.id,
      title: "Password reset help",
      status: "resolved",
      metadata: { lastAgent: "support", resolved: true },
      messages: {
        create: [
          {
            role: "user",
            content: "I forgot my password and can't log in",
          },
          {
            role: "assistant",
            content: "I can help you reset your password! Here's how to do it:\n\n1. Go to the login page and click 'Forgot Password'\n2. Enter your email address (mike.wilson@example.com)\n3. Check your inbox for the password reset link (also check spam folder)\n4. Click the link and create a new password\n5. The link expires in 24 hours\n\nIf you don't receive the email within a few minutes, let me know and I can help troubleshoot. Would you like me to walk you through any of these steps?",
            agentType: "support",
            toolCalls: JSON.stringify([{ tool: "searchKnowledgeBase", args: { query: "password reset" } }]),
            reasoning: "User needs help with password reset. This is a general support query. Using knowledge base to provide accurate instructions.",
          },
        ],
      },
    },
  });

  console.log(`✅ Created 3 sample conversations`);

  console.log("\n🎉 Database seeding completed successfully!");
  console.log("\n📊 Summary:");
  console.log(`   - ${users.length} users`);
  console.log(`   - ${orders.length} orders`);
  console.log(`   - ${payments.length} payments`);
  console.log(`   - ${kbArticles.length} knowledge base articles`);
  console.log(`   - 3 sample conversations`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
