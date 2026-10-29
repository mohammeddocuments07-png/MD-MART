import { createClient } from "@supabase/supabase-js";

const config = window.MD MART_CONFIG || {};
const configured = config.supabaseUrl?.startsWith("https://") &&
  !config.supabaseUrl.includes("YOUR-PROJECT") &&
  config.supabaseAnonKey && !config.supabaseAnonKey.includes("YOUR_SUPABASE");
const supabase = configured ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let products = [], cart = new Map(), category = "All", query = "", user = null, authMode = "signin";

function modal(id, show=true) { $(id).classList.toggle("show", show); }
function message(title, text) { $("messageTitle").textContent = title; $("messageText").textContent = text; modal("messageModal"); }
function requireSetup() { if (!supabase) { message("Connect your database first", "Open README.md and follow the setup steps. The storefront will become a shared marketplace after Supabase is configured."); return false; } return true; }
function requireUser() { if (!user) { modal("authModal"); return false; } return true; }
function updateHeader() { $("accountLabel").textContent = user ? (user.email?.split("@")[0] || "Account") : "Sign in"; $("signOut").hidden = !user; $("cartCount").textContent = [...cart.values()].reduce((a,b)=>a+b,0); }
function setCategory(c) { category = c; $("searchCategory").value = c; renderProducts(); }
function filteredProducts() { return products.filter(p => p.status === "active" && (category === "All" || p.category === category) && (`${p.name} ${p.category} ${p.description || ""}`).toLowerCase().includes(query.toLowerCase())); }
function renderProducts() {
  const list = filteredProducts();
  $("sectionTitle").textContent = query ? `Results for “${query}”` : category === "All" ? "Popular right now" : category === "Home" ? "Home & Kitchen" : category;
  $("resultText").textContent = `${list.length} product${list.length===1?"":"s"} available`;
  $("chips").querySelectorAll("[data-category]").forEach(b => b.classList.toggle("active", b.dataset.category === category));
  $("productGrid").innerHTML = list.length ? list.map(p => `
    <article class="product">
      <div class="photo">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.hidden=false">` : ""}<span ${p.image_url?'hidden':''}>${({Electronics:"🎧",Home:"🏠",Fashion:"👕",Beauty:"🧴",Sports:"⚽",Other:"📦"})[p.category]||"📦"}</span></div>
      <div class="category">${esc(p.category)}</div><h3>${esc(p.name)}</h3><div class="seller">${esc(p.seller_name || "MD MART seller")}</div>
      <div class="price">${money(p.price)}</div><div class="delivery">${Number(p.stock)>0 ? `${p.stock} available` : "Out of stock"}</div>
      <p class="description">${esc(p.description || "")}</p>
      <button class="add" data-add="${p.id}" ${Number(p.stock)<1?"disabled":""}>Add to cart</button>
    </article>`).join("") : `<div class="empty"><h3>No products found</h3><p>Try another search or category, or be the first to list one.</p><button class="primary" id="clearSearch">Show all products</button></div>`;
}
async function loadProducts() {
  if (!supabase) { $("setupNotice").hidden = false; products = demoProducts(); renderProducts(); return; }
  const { data, error } = await supabase.from("products").select("id,name,category,price,stock,image_url,description,status,seller_id,profiles!products_seller_id_fkey(display_name)").eq("status","active").order("created_at",{ascending:false}).limit(100);
  if (error) { console.error(error); $("productGrid").innerHTML = `<div class="empty"><h3>Could not load products</h3><p>Check your Supabase SQL setup and refresh.</p></div>`; return; }
  products = (data || []).map(p => ({...p, seller_name:p.profiles?.display_name || "Community seller"}));
  renderProducts();
}
function demoProducts() {
  return [
    {id:"demo1",name:"Wireless Bluetooth Headphones",category:"Electronics",price:1499,stock:12,status:"active",description:"Comfortable everyday listening with a sleek design.",image_url:""},
    {id:"demo2",name:"Minimal Ceramic Tableware Set",category:"Home",price:899,stock:8,status:"active",description:"A clean, modern set for everyday meals and hosting.",image_url:""},
    {id:"demo3",name:"Everyday Classic Sneakers",category:"Fashion",price:1299,stock:6,status:"active",description:"Versatile style for daily wear and weekend outings.",image_url:""},
    {id:"demo4",name:"Smart Fitness Watch",category:"Electronics",price:2199,stock:10,status:"active",description:"Track your day with a lightweight, modern watch.",image_url:""},
    {id:"demo5",name:"Soft Cotton Tote Bag",category:"Fashion",price:399,stock:20,status:"active",description:"A reusable carry-all for errands, books and more.",image_url:""},
    {id:"demo6",name:"Glow Essentials Skincare Kit",category:"Beauty",price:749,stock:15,status:"active",description:"A simple self-care set for your daily routine.",image_url:""},
    {id:"demo7",name:"Insulated Travel Bottle",category:"Home",price:499,stock:14,status:"active",description:"A practical companion for commutes and day trips.",image_url:""},
    {id:"demo8",name:"Yoga & Stretch Mat",category:"Sports",price:699,stock:9,status:"active",description:"A comfortable base for home workouts.",image_url:""}
  ];
}
async function refreshUser() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null;
  updateHeader();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    if (!profile) await supabase.from("profiles").upsert({id:user.id,display_name:user.email?.split("@")[0] || "Seller"});
  }
}
function openAuth(mode="signin") {
  authMode = mode;
  $("authTitle").textContent = user ? "Your account" : mode === "signin" ? "Welcome back" : "Create your account";
  $("authSubmit").textContent = mode === "signin" ? "Sign in" : "Create account";
  $("authForm").hidden = !!user;
  $("signOut").hidden = !user;
  $("authHint").textContent = user ? `Signed in as ${user.email}` : "Use a valid email and a password of at least 8 characters.";
  $("authModal").querySelectorAll("[data-authmode]").forEach(b => b.classList.toggle("active", b.dataset.authmode === mode));
  modal("authModal");
}
$("authOpen").onclick = () => openAuth();
$("authModal").querySelectorAll("[data-authmode]").forEach(b => b.onclick = () => openAuth(b.dataset.authmode));
$("authForm").addEventListener("submit", async e => {
  e.preventDefault(); if (!requireSetup()) return;
  const email = $("authEmail").value.trim(), password = $("authPassword").value;
  $("authSubmit").disabled = true;
  try {
    const result = authMode === "signup" ? await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}}) : await supabase.auth.signInWithPassword({email,password});
    if (result.error) throw result.error;
    if (authMode === "signup" && !result.data.session) { modal("authModal",false); message("Check your email","Your account was created. Confirm the email using the message from Supabase, then sign in."); }
    else { user = result.data.user; await refreshUser(); modal("authModal",false); message("Signed in","You can now list products and place orders."); }
  } catch(err) { message("Account error",err.message || "Please try again."); }
  finally { $("authSubmit").disabled = false; }
});
$("signOut").onclick = async () => { if (supabase) await supabase.auth.signOut(); user=null; updateHeader(); modal("authModal",false); message("Signed out","You have been signed out."); };
$("sellOpen").onclick = $("sellOpen2").onclick = () => { if (!requireSetup() || !requireUser()) return; modal("sellModal"); };
$("sellForm").addEventListener("submit", async e => {
  e.preventDefault(); if (!requireSetup() || !requireUser()) return;
  const row = {seller_id:user.id,name:$("pname").value.trim(),category:$("pcategory").value,price:Number($("pprice").value),stock:Number($("pstock").value),image_url:$("pimage").value.trim() || null,description:$("pdesc").value.trim(),status:"active"};
  const btn = e.submitter; btn.disabled=true;
  const {error} = await supabase.from("products").insert(row);
  btn.disabled=false;
  if (error) { message("Could not publish listing",error.message); return; }
  e.target.reset(); modal("sellModal",false); await loadProducts(); message("Listing published","Your product is now visible to visitors. Manage fulfilment and stock carefully."); 
});
$("searchForm").addEventListener("submit",e=>{e.preventDefault();query=$("searchInput").value.trim();category=$("searchCategory").value;renderProducts();});
$("chips").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(b){query="";$("searchInput").value="";setCategory(b.dataset.category);}});
document.querySelector(".subnav").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(b){query="";$("searchInput").value="";setCategory(b.dataset.category);$("shop").scrollIntoView({behavior:"smooth"});}});
$("exploreBtn").onclick=()=>$("shop").scrollIntoView({behavior:"smooth"});
$("productGrid").addEventListener("click",e=>{
  if(e.target.id==="clearSearch"){query="";category="All";$("searchInput").value="";renderProducts();return;}
  const b=e.target.closest("[data-add]"); if(!b)return;
  const p=products.find(x=>String(x.id)===String(b.dataset.add));if(!p)return;
  cart.set(String(p.id),{product:p,quantity:(cart.get(String(p.id))?.quantity||0)+1});updateHeader();b.textContent="✓ Added";setTimeout(()=>{if(b.isConnected)b.textContent="Add to cart";},700);
});
function renderCart(){
  const items=[...cart.values()],total=items.reduce((s,x)=>s+Number(x.product.price)*x.quantity,0);
  $("cartContents").innerHTML=items.length?items.map(({product:p,quantity:q})=>`<div class="cartline"><div><b>${esc(p.name)}</b><small>${money(p.price)} each</small><div class="qty"><button data-qty="${p.id}" data-delta="-1">−</button><span>${q}</span><button data-qty="${p.id}" data-delta="1">+</button><button data-remove="${p.id}">Remove</button></div></div><b>${money(p.price*q)}</b></div>`).join(""):`<div class="empty"><div style="font-size:36px">🛒</div><h3>Your cart is empty</h3><p>Find something you love and add it here.</p></div>`;
  $("cartTotal").textContent=money(total);$("placeOrder").disabled=!items.length;
}
$("cartOpen").onclick=()=>{renderCart();modal("cartModal");};
$("cartContents").addEventListener("click",e=>{
  const q=e.target.closest("[data-qty]"),r=e.target.closest("[data-remove]");
  if(q){const id=String(q.dataset.qty),entry=cart.get(id);if(entry){entry.quantity+=Number(q.dataset.delta);if(entry.quantity<=0)cart.delete(id);}renderCart();updateHeader();}
  if(r){cart.delete(String(r.dataset.remove));renderCart();updateHeader();}
});
$("checkoutForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!requireSetup()||!requireUser())return;
  const items=[...cart.values()].map(x=>({product_id:x.product.id,quantity:x.quantity}));
  if(!items.length)return;
  $("placeOrder").disabled=true;
  const shipping={full_name:$("shipName").value.trim(),phone:$("shipPhone").value.trim(),address:$("shipAddress").value.trim()};
  const {data,error}=await supabase.rpc("place_MD MART_order",{p_items:items,p_shipping:shipping,p_payment_method:"cod"});
  $("placeOrder").disabled=false;
  if(error){message("Order not placed",error.message);return;}
  cart.clear();updateHeader();renderCart();modal("cartModal",false);await loadOrders();message("Order placed",`Order reference: ${data}. This is a cash-on-delivery request; contact sellers to confirm fulfilment and delivery.`); 
});
$("ordersOpen").onclick=async()=>{if(!requireSetup()||!requireUser())return;await loadOrders();modal("ordersModal");};
async function loadOrders(){
  if(!supabase||!user){$("ordersContents").innerHTML="<p class='hint'>Sign in to view orders.</p>";return;}
  const {data,error}=await supabase.from("orders").select("id,status,total_amount,payment_method,created_at,order_items(product_name,quantity,unit_price)").eq("buyer_id",user.id).order("created_at",{ascending:false}).limit(30);
  if(error){$("ordersContents").innerHTML=`<p>Could not load orders: ${esc(error.message)}</p>`;return;}
  $("ordersContents").innerHTML=data.length?data.map(o=>`<article class="order"><div class="orderhead"><b>Order ${esc(o.id.slice(0,8).toUpperCase())}</b><span class="pill">${esc(o.status)}</span></div><p>${new Date(o.created_at).toLocaleString("en-IN")} · ${esc(o.payment_method.toUpperCase())}</p>${o.order_items.map(i=>`<div class="orderitem">${esc(i.product_name)} × ${i.quantity}<span>${money(i.unit_price*i.quantity)}</span></div>`).join("")}<div class="orderamount">Total: ${money(o.total_amount)}</div></article>`).join(""):"<div class='empty'><h3>No orders yet</h3><p>Your orders will appear here.</p></div>";
}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>modal(b.dataset.close,false));
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)modal(o.id,false);}));
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".overlay.show").forEach(o=>modal(o.id,false));});
if(supabase){supabase.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;updateHeader();});}
await refreshUser();updateHeader();await loadProducts();
