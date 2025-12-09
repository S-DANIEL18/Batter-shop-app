// app.js — Optimized for Queen Batter Shop

/* Helper functions */
const $ = id => document.getElementById(id);
const normalizeMobileForWa = raw => {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? '91' + digits : digits;
};
const numberToString = v => Number.isInteger(v) ? String(v) : v.toFixed(2);
const preciseAdd = (a,b)=> Math.round((Number(a)||0)*100 + (Number(b)||0)*100)/100;
const preciseSubtract = (a,b)=> Math.round((Number(a)||0)*100 - (Number(b)||0)*100)/100;
const preciseMultiply = (a,b)=> Math.round((Number(a)||0)*(Number(b)||0)*100)/100;
const escapeHtml = str => (!str && str!==0)?'':String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* =========================
   Customers
========================= */
async function addCustomer(name, mobile) {
  if (!name) throw new Error('Name required');
  await db.collection('customers').add({
    name: name.trim(),
    mobile: mobile ? mobile.trim() : '',
    pending: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function listenCustomers() {
  const listEl = $('customersList');
  const select = $('sale_customer');
  if (listEl) listEl.innerHTML = '';
  if (select) select.innerHTML = '<option value="">Select customer</option>';

  db.collection('customers').orderBy('name').onSnapshot(snapshot => {
    if (listEl) listEl.innerHTML = '';
    if (select) select.innerHTML = '<option value="">Select customer</option>';
    snapshot.forEach(doc => {
      const c = doc.data();
      const id = doc.id;

      // Customers list (customers.html)
      if (listEl) {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start';
        li.innerHTML = `<div>
          <strong>${escapeHtml(c.name)}</strong>
          <div class="small-muted">${escapeHtml(c.mobile||'')}</div>
        </div>
        <div class="text-end">
          ₹${numberToString(c.pending||0)}
          <div class="mt-1">
            <button class="btn btn-sm btn-primary me-1" onclick="sendWhatsApp('${id}')">Remind</button>
            <button class="btn btn-sm btn-outline-success" onclick="receivePaymentPrompt('${id}')">Receive</button>
          </div>
        </div>`;
        listEl.appendChild(li);
      }

      // Sale page select dropdown
      if (select) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${c.name} (${c.mobile||''})`;
        select.appendChild(opt);
      }
    });
  }, err => console.error('listenCustomers error', err));
}

/* =========================
   Add Sale
========================= */
async function addSale(customerId, qty, rate, paymentType, paidAmount) {
  if (!customerId) throw new Error('Choose customer');
  qty = Number(qty)||0;
  rate = Number(rate)||0;
  paidAmount = Number(paidAmount)||0;

  const total = preciseMultiply(qty, rate);
  let credit = 0;
  if (paymentType==='partial') credit = preciseSubtract(total, paidAmount);
  else if (paymentType==='credit') credit = total;

  if (credit<0) credit = 0;

  // Save sale
  await db.collection('sales').add({
    customerId, qty, rate, total, paid: paidAmount, credit, paymentType,
    date: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Update customer pending in transaction
  const custRef = db.collection('customers').doc(customerId);
  await db.runTransaction(async t => {
    const snap = await t.get(custRef);
    const prev = snap.exists ? Number(snap.data().pending||0) : 0;
    const nextPending = preciseAdd(prev, credit);
    t.update(custRef, { pending: nextPending });

    if (prev <=100 && nextPending>100) {
      await db.collection('reminders').add({
        customerId,
        amount: nextPending,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        sent:false
      });
    }
  });
}

/* =========================
   Receive Payment
========================= */
function receivePaymentPrompt(customerId) {
  const amt = prompt('Enter amount received (₹):','0');
  if (!amt) return;
  const value = Number(amt);
  if (isNaN(value) || value<=0) return alert('Enter a valid amount');
  receivePayment(customerId, value);
}
async function receivePayment(customerId, amount) {
  const custRef = db.collection('customers').doc(customerId);
  await db.runTransaction(async t=>{
    const s = await t.get(custRef);
    if(!s.exists) throw new Error('Customer missing');
    const prev = Number(s.data().pending||0);
    const next = preciseSubtract(prev, amount);
    t.update(custRef,{pending: next<0?0:next});
    await db.collection('payments').add({
      customerId, amount, date: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

/* =========================
   Pending list & WhatsApp
========================= */
function listenPending() {
  const pendingList = $('pendingList');
  if(!pendingList) return;
  pendingList.innerHTML = '';
  db.collection('customers').where('pending','>',0).orderBy('pending','desc')
    .onSnapshot(snap=>{
      pendingList.innerHTML='';
      snap.forEach(doc=>{
        const c = doc.data(), id=doc.id;
        const li = document.createElement('li');
        li.className='list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `<div><strong>${escapeHtml(c.name)}</strong><div class="small-muted">${escapeHtml(c.mobile||'')}</div></div>
          <div>
            <div>₹${numberToString(c.pending)}</div>
            <div class="mt-1"><button class="btn btn-sm btn-primary" onclick="sendWhatsApp('${id}')">Remind</button></div>
          </div>`;
        pendingList.appendChild(li);
      });
    }, err=>console.error('listenPending error', err));
}

async function sendWhatsApp(customerId){
  const doc = await db.collection('customers').doc(customerId).get();
  if(!doc.exists) return alert('Customer not found');
  const c = doc.data();
  const amount = numberToString(c.pending||0);
  const mobileForWa = normalizeMobileForWa(c.mobile||'');
  if(!mobileForWa) return alert('Customer mobile number missing or invalid.');
  const text = `Dear ${c.name}, your pending balance is ₹${amount}. - Queen Batter Shop`;
  window.open(`https://wa.me/${mobileForWa}?text=`+encodeURIComponent(text), '_blank');
}

/* =========================
   Reports
========================= */
function loadReports() {
  const el = $('summary')||$('report-area');
  if(!el) return;
  el.innerHTML='<p>Loading...</p>';
  Promise.all([db.collection('sales').get(), db.collection('customers').get()])
    .then(([salesSnap,custSnap])=>{
      let totalSales=0, totalPaid=0, totalPending=0;
      salesSnap.forEach(s=>{const d=s.data(); totalSales=preciseAdd(totalSales,d.total||0); totalPaid=preciseAdd(totalPaid,d.paid||0)});
      custSnap.forEach(c=> totalPending=preciseAdd(totalPending,c.data().pending||0));
      el.innerHTML=`<div class="card p-3">
        <div><strong>Total Sales:</strong> ₹${numberToString(totalSales)}</div>
        <div><strong>Total Paid:</strong> ₹${numberToString(totalPaid)}</div>
        <div><strong>Total Pending:</strong> ₹${numberToString(totalPending)}</div>
      </div>`;
    }).catch(err=>{console.error(err); el.innerHTML='<p>Error loading reports</p>';});
}

/* =========================
   Auto-run on DOMContentLoaded
========================= */
window.addEventListener('DOMContentLoaded',()=>{
  // Customers page
  if($('customersList') && $('addCustomerForm')){
    listenCustomers();
    $('addCustomerForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const name=$('c_name').value.trim(), mobile=$('c_mobile').value.trim();
      if(!name) return alert('Enter name');
      try{await addCustomer(name,mobile); $('c_name').value=''; $('c_mobile').value='';}
      catch(err){console.error(err); alert('Error adding customer');}
    });
  }

  // Sales page
  if($('addSaleForm')){
    listenCustomers();
    $('addSaleForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const customerId=$('sale_customer').value, qty=$('qty').value, rate=$('rate').value, paymentType=$('payment_type').value, paidAmount=$('paid_amount').value;
      if(!customerId) return alert('Choose customer');
      try{
        await addSale(customerId,qty,rate,paymentType,paidAmount);
        alert('Sale recorded');
        $('qty').value=''; $('rate').value=''; $('paid_amount').value=''; $('sale_customer').value='';
      } catch(err){console.error(err); alert('Error saving sale');}
    });
  }

  // Pending page
  if($('pendingList')) listenPending();

  // Reports page
  if($('summary')||$('report-area')) loadReports();
});
