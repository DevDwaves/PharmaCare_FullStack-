// =====================================================
//  Pharmacy Management System - Backend Server
//  Login + Dashboard fix + New User registration
// =====================================================
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const mysql = require('mysql2/promise');

// ── Users stored in memory (admin/admin default) ────
// Format: { username, password, dbName, dbUser, dbPass }
const USERS = [
  { username:'admin', password:'admin', dbName:'pharmacy_db', dbUser:'root', dbPass:'123456' }
];

// ── Sessions (token → username) ─────────────────────
const SESSIONS = {};
function makeToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── Per-user DB pool cache ───────────────────────────
const POOLS = {};
function getPool(user) {
  if (!POOLS[user.username]) {
    POOLS[user.username] = mysql.createPool({
      host:'localhost', user: user.dbUser,
      password: user.dbPass, database: user.dbName,
      waitForConnections:true, connectionLimit:5
    });
  }
  return POOLS[user.username];
}

async function dbq(pool, sql, params=[]) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ── MIME ────────────────────────────────────────────
const MIME = {
  '.html':'text/html','.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.png':'image/png','.ico':'image/x-icon'
};

function parseBody(req) {
  return new Promise(resolve => {
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{ try{resolve(JSON.parse(b));}catch{resolve({});} });
  });
}

function json(res, data, status=200) {
  res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(data));
}

// ── Auth middleware ──────────────────────────────────
function getUser(req) {
  const token = req.headers['x-token'] || '';
  const uname = SESSIONS[token];
  if (!uname) return null;
  return USERS.find(u=>u.username===uname) || null;
}

// =====================================================
//  API HANDLER
// =====================================================
async function handleAPI(method, pathname, params, body, req, res) {

  // --- LOGIN ---
  if (pathname==='/api/login' && method==='POST') {
    const u = USERS.find(u=>u.username===body.username && u.password===body.password);
    if (!u) return json(res,{success:false,error:'Invalid username or password'},401);
    const token = makeToken();
    SESSIONS[token] = u.username;
    return json(res,{success:true, token, username:u.username, dbName:u.dbName});
  }

  // --- REGISTER NEW USER ---
  if (pathname==='/api/register' && method==='POST') {
    const {username, password, dbName, dbUser, dbPass} = body;
    if (!username||!password||!dbName) return json(res,{success:false,error:'All fields required'},400);
    if (USERS.find(u=>u.username===username)) return json(res,{success:false,error:'Username already taken'},409);
    // Try to create the database on MySQL
    try {
      const adminPool = getPool(USERS[0]);
      await adminPool.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      // Copy schema from pharmacy_db
      const tables = ['categories','suppliers','medicines','customers','sales','sale_items'];
      for (const t of tables) {
        const [[row]] = await adminPool.execute(`SHOW CREATE TABLE pharmacy_db.\`${t}\``);
        let createSql = row['Create Table']
          .replace(/AUTO_INCREMENT=\d+/,'')
          .replace(/`pharmacy_db`\./g,'');
        await adminPool.execute(`CREATE TABLE IF NOT EXISTS \`${dbName}\`.\`${t}\` ${createSql.replace(/^CREATE TABLE `\w+`/,`CREATE TABLE \`${dbName}\`.\`${t}\``)}`);
      }
      // Add default categories
      await adminPool.execute(`INSERT IGNORE INTO \`${dbName}\`.categories (name,description) VALUES
        ('Antibiotics','Bacterial infection medicines'),('Pain Relief','Analgesics'),
        ('Vitamins','Supplements'),('Antacids','Acidity medicines'),('Antihistamines','Allergy medicines')`);
    } catch(e) {
      console.error('DB setup error:', e.message);
    }
    USERS.push({username, password, dbName, dbUser: dbUser||'root', dbPass: dbPass||'123456'});
    const token = makeToken();
    SESSIONS[token] = username;
    return json(res,{success:true, token, username, dbName});
  }

  // --- LOGOUT ---
  if (pathname==='/api/logout') {
    const token = req.headers['x-token']||'';
    delete SESSIONS[token];
    return json(res,{success:true});
  }

  // All routes below require auth
  const user = getUser(req);
  if (!user) return json(res,{success:false,error:'Not authenticated'},401);
  const pool = getPool(user);

  // --- DASHBOARD ---
  if (pathname==='/api/dashboard') {
    const [[tm]]  = await pool.execute("SELECT COUNT(*) c FROM medicines");
    const [[ls]]  = await pool.execute("SELECT COUNT(*) c FROM medicines WHERE quantity<20");
    const [[exp]] = await pool.execute("SELECT COUNT(*) c FROM medicines WHERE expiry_date<CURDATE()");
    const [[rev]] = await pool.execute("SELECT COALESCE(SUM(net_amount),0) c FROM sales");
    const [[cu]]  = await pool.execute("SELECT COUNT(*) c FROM customers");
    const [[bi]]  = await pool.execute("SELECT COUNT(*) c FROM sales");
    const [recent]   = await pool.execute("SELECT s.invoice_no,COALESCE(c.name,'Walk-in') customer,s.net_amount,s.payment_method,DATE_FORMAT(s.sale_date,'%d %b %Y') sale_date FROM sales s LEFT JOIN customers c ON s.customer_id=c.id ORDER BY s.sale_date DESC LIMIT 6");
    const [expiring] = await pool.execute("SELECT name,quantity,expiry_date,DATEDIFF(expiry_date,CURDATE()) days_left FROM medicines WHERE expiry_date<DATE_ADD(CURDATE(),INTERVAL 60 DAY) ORDER BY expiry_date LIMIT 6");
    const [monthly]  = await pool.execute("SELECT ANY_VALUE(DATE_FORMAT(sale_date,'%b %Y')) mo,SUM(net_amount) rev FROM sales GROUP BY YEAR(sale_date), MONTH(sale_date) ORDER BY YEAR(sale_date), MONTH(sale_date) LIMIT 8");
    const [catrev]   = await pool.execute("SELECT c.name,COALESCE(SUM(si.total),0) rev FROM categories c LEFT JOIN medicines m ON c.id=m.category_id LEFT JOIN sale_items si ON m.id=si.medicine_id GROUP BY c.id,c.name ORDER BY rev DESC LIMIT 6");
    return json(res,{total_medicines:tm.c,low_stock:ls.c,expired:exp.c,total_revenue:rev.c,total_customers:cu.c,total_bills:bi.c,recent_sales:recent,expiring_soon:expiring,monthly,catrev});
  }

  // --- MEDICINES ---
  if (pathname==='/api/medicines') {
    if (method==='GET') {
      const s=params.search?`%${params.search}%`:'%';
      return json(res,await dbq(pool,"SELECT m.*,c.name category_name,s.name supplier_name FROM medicines m LEFT JOIN categories c ON m.category_id=c.id LEFT JOIN suppliers s ON m.supplier_id=s.id WHERE m.name LIKE ? OR m.generic_name LIKE ? ORDER BY m.name",[s,s]));
    }
    if (method==='POST') {
      await dbq(pool,"INSERT INTO medicines(name,generic_name,category_id,supplier_id,batch_no,manufacture_date,expiry_date,quantity,purchase_price,selling_price,description)VALUES(?,?,?,?,?,?,?,?,?,?,?)",[body.name,body.generic_name||'',body.category_id||null,body.supplier_id||null,body.batch_no||'',body.manufacture_date||null,body.expiry_date,body.quantity||0,body.purchase_price||0,body.selling_price||0,body.description||'']);
      return json(res,{success:true});
    }
    if (method==='PUT') {
      await dbq(pool,"UPDATE medicines SET name=?,generic_name=?,category_id=?,supplier_id=?,batch_no=?,manufacture_date=?,expiry_date=?,quantity=?,purchase_price=?,selling_price=?,description=? WHERE id=?",[body.name,body.generic_name||'',body.category_id||null,body.supplier_id||null,body.batch_no||'',body.manufacture_date||null,body.expiry_date,body.quantity||0,body.purchase_price||0,body.selling_price||0,body.description||'',body.id]);
      return json(res,{success:true});
    }
    if (method==='DELETE') { await dbq(pool,'DELETE FROM medicines WHERE id=?',[params.id]); return json(res,{success:true}); }
  }

  if (pathname==='/api/categories') {
    if (method==='GET') return json(res,await dbq(pool,"SELECT c.*,COUNT(m.id) medicine_count FROM categories c LEFT JOIN medicines m ON c.id=m.category_id GROUP BY c.id ORDER BY c.name"));
    if (method==='POST') { await dbq(pool,'INSERT INTO categories(name,description)VALUES(?,?)',[body.name,body.description||'']); return json(res,{success:true}); }
    if (method==='DELETE') { await dbq(pool,'DELETE FROM categories WHERE id=?',[params.id]); return json(res,{success:true}); }
  }

  if (pathname==='/api/suppliers') {
    if (method==='GET') return json(res,await dbq(pool,"SELECT s.*,COUNT(m.id) medicine_count FROM suppliers s LEFT JOIN medicines m ON s.id=m.supplier_id GROUP BY s.id ORDER BY s.name"));
    if (method==='POST') { await dbq(pool,'INSERT INTO suppliers(name,contact_person,phone,email,address)VALUES(?,?,?,?,?)',[body.name,body.contact_person||'',body.phone||'',body.email||'',body.address||'']); return json(res,{success:true}); }
    if (method==='DELETE') { await dbq(pool,'DELETE FROM suppliers WHERE id=?',[params.id]); return json(res,{success:true}); }
  }

  if (pathname==='/api/customers') {
    if (method==='GET') {
      const s=params.search?`%${params.search}%`:'%';
      return json(res,await dbq(pool,"SELECT c.*,COUNT(s.id) total_orders,COALESCE(SUM(s.net_amount),0) total_spent FROM customers c LEFT JOIN sales s ON c.id=s.customer_id WHERE c.name LIKE ? OR c.phone LIKE ? GROUP BY c.id ORDER BY c.name",[s,s]));
    }
    if (method==='POST') { await dbq(pool,'INSERT INTO customers(name,phone,email,address)VALUES(?,?,?,?)',[body.name,body.phone||'',body.email||'',body.address||'']); return json(res,{success:true}); }
    if (method==='DELETE') { await dbq(pool,'DELETE FROM customers WHERE id=?',[params.id]); return json(res,{success:true}); }
  }

  if (pathname==='/api/sales') {
    if (method==='GET') return json(res,await dbq(pool,"SELECT s.*,COALESCE(c.name,'Walk-in') customer_name FROM sales s LEFT JOIN customers c ON s.customer_id=c.id ORDER BY s.sale_date DESC LIMIT 300"));
    if (method==='POST') {
      const {customer_id,discount,payment_method,items}=body;
      const total=items.reduce((s,i)=>s+i.qty*i.price,0);
      const net=total-(discount||0);
      const inv='INV-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.floor(Math.random()*9000+1000);
      const conn=await pool.getConnection();
      await conn.beginTransaction();
      try {
        await conn.execute("INSERT INTO sales(customer_id,invoice_no,total_amount,discount,net_amount,payment_method)VALUES(?,?,?,?,?,?)",[customer_id||null,inv,total,discount||0,net,payment_method||'cash']);
        const [[{id:sid}]]=await conn.execute('SELECT LAST_INSERT_ID() id');
        for(const it of items){
          await conn.execute("INSERT INTO sale_items(sale_id,medicine_id,quantity,unit_price,total)VALUES(?,?,?,?,?)",[sid,it.medicine_id,it.qty,it.price,it.qty*it.price]);
          await conn.execute('UPDATE medicines SET quantity=quantity-? WHERE id=?',[it.qty,it.medicine_id]);
        }
        await conn.commit(); conn.release();
        return json(res,{success:true,invoice:inv});
      } catch(e) { await conn.rollback(); conn.release(); return json(res,{success:false,error:e.message},500); }
    }
  }

  if (pathname==='/api/sale-items') return json(res,await dbq(pool,"SELECT si.*,m.name medicine_name FROM sale_items si JOIN medicines m ON si.medicine_id=m.id WHERE si.sale_id=?",[params.id]));
  if (pathname==='/api/helpers/categories') return json(res,await dbq(pool,'SELECT id,name FROM categories ORDER BY name'));
  if (pathname==='/api/helpers/suppliers')  return json(res,await dbq(pool,'SELECT id,name FROM suppliers ORDER BY name'));
  if (pathname==='/api/helpers/customers')  return json(res,await dbq(pool,'SELECT id,name FROM customers ORDER BY name'));
  if (pathname==='/api/helpers/med-search') {
    const s=params.q?`%${params.q}%`:'%';
    return json(res,await dbq(pool,'SELECT id,name,selling_price,quantity FROM medicines WHERE name LIKE ? AND quantity>0 LIMIT 10',[s]));
  }

  json(res,{error:'Not found'},404);
}

// =====================================================
//  HTTP SERVER
// =====================================================
const server = http.createServer(async (req,res)=>{
  const parsed=url.parse(req.url,true);
  const {pathname,query}=parsed;
  const method=req.method;
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,x-token');
  if(method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(pathname.startsWith('/api')){
    try{
      const body=(method==='POST'||method==='PUT')?await parseBody(req):{};
      await handleAPI(method,pathname,query,body,req,res);
    }catch(e){console.error(e.message);json(res,{error:e.message},500);}
    return;
  }
  // Serve static — redirect / to login.html
  let fp=path.join(__dirname,pathname==='/'?'/login.html':pathname).split('?')[0];
  fs.readFile(fp,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');}
    else{res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'text/plain'});res.end(data);}
  });
});

server.listen(3000,()=>{
  console.log('\n  Pharmacy Web App');
  console.log('  Open: http://localhost:3000');
  console.log('  Default login: admin / admin\n');
});
