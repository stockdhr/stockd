import { requireActiveSubscription, requireAuth } from "../lib/auth";
import { calculateSale } from "../lib/business";
import { HttpError, centsField, isoDateField, json, readJson, textField } from "../lib/http";

async function activeUser(request: Request, env: Env) {
  const user = await requireAuth(request, env);
  if (user.role !== "admin") requireActiveSubscription(user);
  return user;
}

function activityStatement(env: Env, userId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  return env.DB.prepare(`INSERT INTO activity_logs (id, user_id, actor_user_id, action, entity_type, entity_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), userId, userId, action, entityType, entityId, JSON.stringify(metadata));
}

export async function dashboard(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const [sales, inventory, age, activity, trend, topProducts, expenses, settings] = await env.DB.batch([
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN s.sold_at >= date('now','start of month') THEN s.sale_price_cents ELSE 0 END), 0) revenue_month_cents,
      COALESCE(SUM(CASE WHEN s.sold_at >= date('now','start of month') THEN s.sale_price_cents -
        (i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents) ELSE 0 END), 0) profit_month_cents,
      COALESCE(SUM(s.sale_price_cents - (i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents)), 0) total_profit_cents,
      SUM(CASE WHEN s.sold_at >= date('now','start of month') THEN 1 ELSE 0 END) sold_month,
      COALESCE(AVG(CASE WHEN s.sold_at >= date('now','start of month') THEN s.sale_price_cents -
        (i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents) END), 0) avg_profit_cents,
      COALESCE(AVG((s.sale_price_cents - (i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents))*100.0 /
        NULLIF(i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents,0)), 0) avg_roi,
      COALESCE(AVG(julianday(s.sold_at)-julianday(i.purchased_at)), 0) avg_days
      FROM sales s JOIN inventory_items i ON i.id=s.inventory_item_id WHERE s.user_id=? AND s.voided_at IS NULL`).bind(user.id),
    env.DB.prepare(`SELECT COUNT(*) items_count,
      COALESCE(SUM(purchase_price_cents+inbound_shipping_cents+authentication_fee_cents+additional_cost_cents),0) inventory_value_cents
      FROM inventory_items WHERE user_id=? AND status='in_stock'`).bind(user.id),
    env.DB.prepare(`SELECT CASE WHEN age_days<=14 THEN '0_14' WHEN age_days<=30 THEN '15_30' WHEN age_days<=60 THEN '31_60' ELSE '60_plus' END bucket,
      COUNT(*) count, SUM(total_cost) value_cents FROM (
        SELECT CAST(julianday('now')-julianday(purchased_at) AS INTEGER) age_days,
        purchase_price_cents+inbound_shipping_cents+authentication_fee_cents+additional_cost_cents total_cost
        FROM inventory_items WHERE user_id=? AND status='in_stock') GROUP BY bucket`).bind(user.id),
    env.DB.prepare("SELECT action, entity_type, entity_id, metadata_json, created_at FROM activity_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 8").bind(user.id),
    env.DB.prepare(`SELECT strftime('%Y-%m',s.sold_at) month, SUM(s.sale_price_cents) revenue_cents,
      SUM(s.sale_price_cents-(i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents)) profit_cents
      FROM sales s JOIN inventory_items i ON i.id=s.inventory_item_id WHERE s.user_id=? AND s.voided_at IS NULL AND s.sold_at >= date('now','-5 months','start of month') GROUP BY month ORDER BY month`).bind(user.id),
    env.DB.prepare(`SELECT p.id,p.name,p.brand,COUNT(s.id) sold_count,
      AVG(s.sale_price_cents-(i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents)) avg_profit_cents,
      AVG((s.sale_price_cents-(i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents))*100.0/NULLIF(i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents,0)) roi,
      AVG(julianday(s.sold_at)-julianday(i.purchased_at)) avg_days
      FROM products p JOIN inventory_items i ON i.product_id=p.id JOIN sales s ON s.inventory_item_id=i.id AND s.voided_at IS NULL
      WHERE p.user_id=? GROUP BY p.id ORDER BY avg_profit_cents DESC LIMIT 5`).bind(user.id),
    env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) expenses_month_cents FROM expenses WHERE user_id=? AND occurred_at>=date('now','start of month')").bind(user.id),
    env.DB.prepare("SELECT monthly_profit_goal_cents,currency FROM user_settings WHERE user_id=?").bind(user.id),
  ]);
  if (!sales || !inventory || !age || !activity || !trend || !topProducts || !expenses || !settings) {
    throw new HttpError(500, "Nije moguće učitati pregled.");
  }
  const salesKpis = (sales.results[0] ?? {}) as Record<string, unknown>;
  const inventoryKpis = (inventory.results[0] ?? {}) as Record<string, unknown>;
  const expenseKpis = (expenses.results[0] ?? {}) as Record<string, unknown>;
  return json({
    kpis: { ...salesKpis, ...inventoryKpis, ...expenseKpis },
    age_buckets: age.results,
    activity: activity.results.map((raw) => {
      const item = raw as Record<string, unknown>;
      return { ...item, metadata: item.metadata_json ? JSON.parse(String(item.metadata_json)) : null };
    }),
    trend: trend.results,
    top_products: topProducts.results,
    settings: settings.results[0] ?? { monthly_profit_goal_cents: 200000, currency: "EUR" },
  });
}

export async function listProducts(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const result = await env.DB.prepare(`SELECT p.*,
    SUM(CASE WHEN i.status='in_stock' THEN 1 ELSE 0 END) in_stock,
    SUM(CASE WHEN i.status='sold' THEN 1 ELSE 0 END) sold
    FROM products p LEFT JOIN inventory_items i ON i.product_id=p.id AND i.user_id=p.user_id
    WHERE p.user_id=? GROUP BY p.id ORDER BY p.created_at DESC`).bind(user.id).all();
  return json({ products: result.results });
}

export async function createProduct(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const body = await readJson(request);
  const id = crypto.randomUUID();
  const name = textField(body, "name", { required: true, max: 180 })!;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO products (id,user_id,name,brand,category,sku,photo_url,notes) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id,user.id,name,textField(body,"brand",{max:100}),textField(body,"category",{max:100}),textField(body,"sku",{max:100}),textField(body,"photo_url",{max:500}),textField(body,"notes",{max:2000})),
    activityStatement(env,user.id,"product_created","product",id,{name}),
  ]);
  return json({ id, message: "Proizvod je kreiran." }, 201);
}

export async function listInventory(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") === "sold" ? "sold" : "in_stock";
  const search = `%${(url.searchParams.get("q") ?? "").slice(0,100)}%`;
  const result = await env.DB.prepare(`SELECT i.*,p.name product_name,p.brand,p.photo_url,
    i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents total_cost_cents,
    CAST(julianday('now')-julianday(i.purchased_at) AS INTEGER) age_days
    FROM inventory_items i JOIN products p ON p.id=i.product_id
    WHERE i.user_id=? AND i.status=? AND (p.name LIKE ? OR p.brand LIKE ? OR i.variant LIKE ? OR i.source LIKE ?)
    ORDER BY i.created_at DESC LIMIT 200`).bind(user.id,status,search,search,search,search).all();
  return json({ items: result.results });
}

export async function createInventory(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const body = await readJson(request);
  const productId = textField(body,"product_id",{required:true,max:60})!;
  const product = await env.DB.prepare("SELECT id,name FROM products WHERE id=? AND user_id=?").bind(productId,user.id).first<{id:string;name:string}>();
  if (!product) throw new HttpError(404,"Proizvod nije pronađen.");
  const id = crypto.randomUUID();
  const purchasedAt = isoDateField(body,"purchased_at") ?? new Date().toISOString();
  const purchasePrice = centsField(body,"purchase_price_cents",true);
  const shipping = centsField(body,"inbound_shipping_cents");
  const authentication = centsField(body,"authentication_fee_cents");
  const additional = centsField(body,"additional_cost_cents");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO inventory_items (id,user_id,product_id,batch_id,variant,purchase_price_cents,inbound_shipping_cents,
      authentication_fee_cents,additional_cost_cents,purchased_at,source,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,user.id,productId,textField(body,"batch_id",{max:60}),textField(body,"variant",{max:80}),purchasePrice,shipping,authentication,additional,purchasedAt,textField(body,"source",{max:160}),textField(body,"notes",{max:2000})),
    activityStatement(env,user.id,"inventory_added","inventory_item",id,{name:product.name,variant:textField(body,"variant",{max:80}),total_cost_cents:purchasePrice+shipping+authentication+additional}),
  ]);
  return json({ id, total_cost_cents: purchasePrice+shipping+authentication+additional, message:"Artikl je dodan na zalihu." },201);
}

export async function updateInventory(request: Request, env: Env, itemId: string): Promise<Response> {
  const user = await activeUser(request, env);
  const current = await env.DB.prepare(`SELECT i.id, i.product_id, i.variant, i.purchase_price_cents,
    i.inbound_shipping_cents, i.authentication_fee_cents, i.additional_cost_cents, i.purchased_at,
    i.source, i.notes, p.name product_name
    FROM inventory_items i JOIN products p ON p.id=i.product_id
    WHERE i.id=? AND i.user_id=? AND i.status='in_stock'`)
    .bind(itemId,user.id).first<{
      id:string; product_id:string; variant:string|null; purchase_price_cents:number; inbound_shipping_cents:number;
      authentication_fee_cents:number; additional_cost_cents:number; purchased_at:string; source:string|null;
      notes:string|null; product_name:string;
    }>();
  if (!current) throw new HttpError(404,"Artikl nije pronađen.");
  const body = await readJson(request);
  const variant = textField(body,"variant",{max:80}) ?? current.variant;
  const purchasePrice = body.purchase_price_cents === undefined ? current.purchase_price_cents : centsField(body,"purchase_price_cents",true);
  const shipping = body.inbound_shipping_cents === undefined ? current.inbound_shipping_cents : centsField(body,"inbound_shipping_cents");
  const authentication = body.authentication_fee_cents === undefined ? current.authentication_fee_cents : centsField(body,"authentication_fee_cents");
  const additional = body.additional_cost_cents === undefined ? current.additional_cost_cents : centsField(body,"additional_cost_cents");
  const purchasedAt = body.purchased_at === undefined ? current.purchased_at : isoDateField(body,"purchased_at",true)!;
  const source = body.source === undefined ? current.source : textField(body,"source",{max:160});
  const notes = body.notes === undefined ? current.notes : textField(body,"notes",{max:2000});
  const totalCost = purchasePrice+shipping+authentication+additional;
  await env.DB.batch([
    env.DB.prepare(`UPDATE inventory_items SET variant=?,purchase_price_cents=?,inbound_shipping_cents=?,
      authentication_fee_cents=?,additional_cost_cents=?,purchased_at=?,source=?,notes=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=? AND status='in_stock'`)
      .bind(variant,purchasePrice,shipping,authentication,additional,purchasedAt,source,notes,itemId,user.id),
    activityStatement(env,user.id,"inventory_updated","inventory_item",itemId,{name:current.product_name,variant,total_cost_cents:totalCost}),
  ]);
  return json({ id:itemId, variant, purchase_price_cents:purchasePrice, inbound_shipping_cents:shipping,
    authentication_fee_cents:authentication, additional_cost_cents:additional, purchased_at:purchasedAt,
    source, notes, total_cost_cents:totalCost, message:"Artikl je ažuriran." });
}

export async function createSale(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const body = await readJson(request);
  const itemId = textField(body,"inventory_item_id",{required:true,max:60})!;
  const item = await env.DB.prepare(`SELECT i.*,p.name product_name FROM inventory_items i JOIN products p ON p.id=i.product_id
    WHERE i.id=? AND i.user_id=? AND i.status='in_stock'`).bind(itemId,user.id).first<Record<string, string|number|null>>();
  if (!item) throw new HttpError(404,"Artikl nije pronađen ili je već prodan.");
  const salePrice = centsField(body,"sale_price_cents",true);
  const platformFee = centsField(body,"platform_fee_cents");
  const shipping = centsField(body,"outbound_shipping_cents");
  const other = centsField(body,"other_cost_cents");
  const metrics = calculateSale({salePriceCents:salePrice,purchasePriceCents:Number(item.purchase_price_cents),inboundShippingCents:Number(item.inbound_shipping_cents),authenticationFeeCents:Number(item.authentication_fee_cents),acquisitionAdditionalCents:Number(item.additional_cost_cents),platformFeeCents:platformFee,outboundShippingCents:shipping,saleOtherCents:other});
  const id = crypto.randomUUID();
  const soldAt = isoDateField(body,"sold_at") ?? new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sales (id,user_id,inventory_item_id,customer_id,sale_price_cents,platform,platform_fee_cents,outbound_shipping_cents,
      other_cost_cents,sold_at,tracking_number,shipping_address,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,user.id,itemId,textField(body,"customer_id",{max:60}),salePrice,textField(body,"platform",{max:100}),platformFee,shipping,other,soldAt,textField(body,"tracking_number",{max:160}),textField(body,"shipping_address",{max:500}),textField(body,"notes",{max:2000})),
    env.DB.prepare("UPDATE inventory_items SET status='sold',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='in_stock'").bind(itemId,user.id),
    activityStatement(env,user.id,"sale_created","sale",id,{name:item.product_name,variant:item.variant,sale_price_cents:salePrice,profit_cents:metrics.netProfitCents}),
  ]);
  return json({ id, ...metrics, message:"Prodaja je evidentirana." },201);
}

export async function listSales(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  const result = await env.DB.prepare(`SELECT s.*,p.name product_name,p.brand,i.variant,
    i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents true_cost_cents,
    s.sale_price_cents-(i.purchase_price_cents+i.inbound_shipping_cents+i.authentication_fee_cents+i.additional_cost_cents+s.platform_fee_cents+s.outbound_shipping_cents+s.other_cost_cents) profit_cents,
    julianday(s.sold_at)-julianday(i.purchased_at) days_held,c.name customer_name
    FROM sales s JOIN inventory_items i ON i.id=s.inventory_item_id JOIN products p ON p.id=i.product_id
    LEFT JOIN customers c ON c.id=s.customer_id WHERE s.user_id=? AND s.voided_at IS NULL ORDER BY s.sold_at DESC LIMIT 200`).bind(user.id).all();
  return json({ sales:result.results });
}

export async function undoSale(request: Request, env: Env, saleId: string): Promise<Response> {
  const user = await activeUser(request, env);
  const sale = await env.DB.prepare("SELECT id,inventory_item_id FROM sales WHERE id=? AND user_id=? AND voided_at IS NULL").bind(saleId,user.id).first<{id:string;inventory_item_id:string}>();
  if (!sale) throw new HttpError(404,"Prodaja nije pronađena.");
  await env.DB.batch([
    env.DB.prepare("UPDATE sales SET voided_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(saleId,user.id),
    env.DB.prepare("UPDATE inventory_items SET status='in_stock',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(sale.inventory_item_id,user.id),
    activityStatement(env,user.id,"sale_voided","sale",saleId,{inventory_item_id:sale.inventory_item_id}),
  ]);
  return json({inventory_item_id:sale.inventory_item_id,message:"Prodaja je poništena, a artikl vraćen na zalihu."});
}

export async function customers(request: Request, env: Env): Promise<Response> {
  const user = await activeUser(request, env);
  if(request.method==="GET"){
    const result=await env.DB.prepare(`SELECT c.*,COUNT(s.id) purchases,COALESCE(SUM(s.sale_price_cents),0) spent_cents,
      MIN(s.sold_at) first_purchase,MAX(s.sold_at) last_purchase FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.voided_at IS NULL
      WHERE c.user_id=? GROUP BY c.id ORDER BY c.name`).bind(user.id).all();
    return json({customers:result.results});
  }
  const body=await readJson(request); const id=crypto.randomUUID(); const name=textField(body,"name",{required:true,max:160})!;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO customers (id,user_id,name,phone,address,notes) VALUES (?,?,?,?,?,?)").bind(id,user.id,name,textField(body,"phone",{max:50}),textField(body,"address",{max:500}),textField(body,"notes",{max:2000})),
    activityStatement(env,user.id,"customer_created","customer",id,{name}),
  ]);
  return json({id,message:"Kupac je spremljen."},201);
}

export async function expenses(request: Request, env: Env): Promise<Response> {
  const user=await activeUser(request,env);
  if(request.method==="GET"){
    const result=await env.DB.prepare("SELECT * FROM expenses WHERE user_id=? ORDER BY occurred_at DESC LIMIT 200").bind(user.id).all();
    return json({expenses:result.results});
  }
  const body=await readJson(request); const id=crypto.randomUUID(); const amount=centsField(body,"amount_cents",true);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO expenses (id,user_id,inventory_item_id,category,description,amount_cents,occurred_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id,user.id,textField(body,"inventory_item_id",{max:60}),textField(body,"category",{required:true,max:100}),textField(body,"description",{required:true,max:300}),amount,isoDateField(body,"occurred_at")??new Date().toISOString()),
    activityStatement(env,user.id,"expense_created","expense",id,{amount_cents:amount,description:textField(body,"description",{required:true,max:300})}),
  ]);
  return json({id,message:"Trošak je spremljen."},201);
}

export async function globalSearch(request: Request,env:Env):Promise<Response>{
  const user=await activeUser(request,env); const q=(new URL(request.url).searchParams.get("q")??"").trim().slice(0,100);
  if(q.length<2)return json({results:[]}); const pattern=`%${q}%`;
  const [products,items,clients,sales]=await env.DB.batch([
    env.DB.prepare("SELECT id,'product' type,name title,brand subtitle FROM products WHERE user_id=? AND (name LIKE ? OR brand LIKE ? OR sku LIKE ?) LIMIT 8").bind(user.id,pattern,pattern,pattern),
    env.DB.prepare(`SELECT i.id,'inventory' type,p.name title,i.variant subtitle FROM inventory_items i JOIN products p ON p.id=i.product_id WHERE i.user_id=? AND (p.name LIKE ? OR i.variant LIKE ?) LIMIT 8`).bind(user.id,pattern,pattern),
    env.DB.prepare("SELECT id,'customer' type,name title,phone subtitle FROM customers WHERE user_id=? AND (name LIKE ? OR phone LIKE ?) LIMIT 8").bind(user.id,pattern,pattern),
    env.DB.prepare(`SELECT s.id,'sale' type,p.name title,s.tracking_number subtitle FROM sales s JOIN inventory_items i ON i.id=s.inventory_item_id JOIN products p ON p.id=i.product_id WHERE s.user_id=? AND (p.name LIKE ? OR s.tracking_number LIKE ?) LIMIT 8`).bind(user.id,pattern,pattern),
  ]);
  if(!products||!items||!clients||!sales)throw new HttpError(500,"Nije moguće pretražiti podatke.");
  return json({results:[...products.results,...items.results,...clients.results,...sales.results]});
}
