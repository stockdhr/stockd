export const dashboardData = {
  kpis: { profit_month_cents: 184730, revenue_month_cents: 687420, total_profit_cents: 1621840, sold_month: 18, avg_profit_cents: 10263, avg_roi: 34.8, avg_days: 12, items_count: 43, inventory_value_cents: 842000, expenses_month_cents: 38420 },
  age_buckets: [
    { bucket: "0_14", count: 18, value_cents: 328000 },
    { bucket: "15_30", count: 12, value_cents: 234000 },
    { bucket: "31_60", count: 8, value_cents: 167000 },
    { bucket: "60_plus", count: 5, value_cents: 113000 },
  ],
  trend: [
    { month: "2026-04", revenue_cents: 371000, profit_cents: 92000 }, { month: "2026-05", revenue_cents: 448000, profit_cents: 115000 },
    { month: "2026-06", revenue_cents: 420000, profit_cents: 108000 }, { month: "2026-07", revenue_cents: 563000, profit_cents: 139000 },
    { month: "2026-08", revenue_cents: 592000, profit_cents: 152160 }, { month: "2026-09", revenue_cents: 687420, profit_cents: 184730 },
  ],
  settings: { monthly_profit_goal_cents: 200000, currency: "EUR" },
  activity: [
    { action: "sale_created", created_at: "2026-09-06T23:41:00Z", metadata: { name: "Yeezy 350 V2 MX Bone", variant: "43", profit_cents: 4700 } },
    { action: "inventory_added", created_at: "2026-09-06T19:22:00Z", metadata: { name: "Jordan 4 Military Blue", variant: "44", total_cost_cents: 16500 } },
    { action: "sale_created", created_at: "2026-09-05T17:10:00Z", metadata: { name: "Dunk Low Panda", variant: "42.5", profit_cents: 3100 } },
    { action: "inventory_added", created_at: "2026-09-05T12:08:00Z", metadata: { name: "Air Max 95 OG", variant: "44", total_cost_cents: 14200 } },
  ],
  top_products: [
    { name: "Jordan 4 Military Blue", brand: "Jordan", sold_count: 8, avg_profit_cents: 4700, roi: 31, avg_days: 9 },
    { name: "Yeezy 350 V2 MX Bone", brand: "Adidas", sold_count: 6, avg_profit_cents: 4200, roi: 38, avg_days: 7 },
    { name: "Dunk Low Panda", brand: "Nike", sold_count: 11, avg_profit_cents: 3100, roi: 27, avg_days: 12 },
  ],
};

export const inventory = [
  { id:"i1", product_name:"Jordan 4 Military Blue", brand:"Jordan", variant:"44", total_cost_cents:16500, purchase_price_cents:15500, age_days:3 },
  { id:"i2", product_name:"Yeezy 350 V2 MX Bone", brand:"Adidas", variant:"43", total_cost_cents:8000, purchase_price_cents:8000, age_days:8 },
  { id:"i3", product_name:"Nike SB Dunk Low Futura", brand:"Nike", variant:"42.5", total_cost_cents:14800, purchase_price_cents:13800, age_days:22 },
  { id:"i4", product_name:"New Balance 9060 Sea Salt", brand:"New Balance", variant:"44", total_cost_cents:13200, purchase_price_cents:12500, age_days:37 },
  { id:"i5", product_name:"Air Max 95 OG Neon", brand:"Nike", variant:"43", total_cost_cents:18100, purchase_price_cents:17000, age_days:61 },
  { id:"i6", product_name:"Asics Gel-Kayano 14", brand:"Asics", variant:"42", total_cost_cents:12900, purchase_price_cents:11900, age_days:113 },
];

export const sales = [
  { id:"s1", product_name:"Yeezy 350 V2 MX Bone", brand:"Adidas", variant:"43", sold_at:"2026-09-06", sale_price_cents:12700, true_cost_cents:8000, profit_cents:4700, customer_name:"Marko Horvat", platform:"Instagram" },
  { id:"s2", product_name:"Jordan 4 Military Blue", brand:"Jordan", variant:"44", sold_at:"2026-09-05", sale_price_cents:21200, true_cost_cents:16500, profit_cents:4700, customer_name:"Luka Barić", platform:"Njuškalo" },
  { id:"s3", product_name:"Dunk Low Panda", brand:"Nike", variant:"42.5", sold_at:"2026-09-04", sale_price_cents:14100, true_cost_cents:11000, profit_cents:3100, customer_name:"—", platform:"Direktno" },
  { id:"s4", product_name:"Adidas Samba OG", brand:"Adidas", variant:"39", sold_at:"2026-09-02", sale_price_cents:12500, true_cost_cents:9200, profit_cents:2950, customer_name:"Ana Kovač", platform:"Instagram" },
];

export const customers = [
  { name:"Marko Horvat", phone:"091 234 5678", purchases:8, spent_cents:118400, tag:"VIP", last_purchase:"6. rujna 2026." },
  { name:"Luka Barić", phone:"098 654 3210", purchases:5, spent_cents:78200, tag:"Stalni kupac", last_purchase:"5. rujna 2026." },
  { name:"Ana Kovač", phone:"095 111 2233", purchases:3, spent_cents:39100, tag:"Instagram", last_purchase:"2. rujna 2026." },
  { name:"Filip Radić", phone:"099 777 8811", purchases:2, spent_cents:28600, tag:"Wholesale", last_purchase:"28. kolovoza 2026." },
];

