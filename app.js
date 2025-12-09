// app.js — optimized Firestore logic
const $ = id => document.getElementById(id);
const db = firebase.firestore();

// =========================
// Customers
// =========================
async function addCustomer(name, mobile) {
  if (!name) throw new Error('Name required');
  await db.collection('customers').add({
    name: name.trim(),
    mobile: mobile.trim(),
    pending: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function listenCustomers() {
  const listEl = $('customersList');
  const select = $('sale_customer');
  if (listEl) listEl?.replaceChildren();
  if (select) select.innerHTML = '<option value="">Select customer</option>';

  db.collection('customers').orderBy('name').onSnapshot(snapshot => {
    listEl?.replaceChildren();
    if (select) select.innerHTML = '<option value="">Select customer</option>';
    snapshot.forEach(doc => {
      const c = doc.data();
      const id = doc.id;

      if (listEl) {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start';
        li.innerHTML = `<div><strong>${c.name}</strong><div class="small-muted">${c.mobile || ''}</div></div>`;
        listEl.appendChild(li);
      }

      if (select) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${c.name} (${c.mobile || ''})`;
        select.appendChild(opt);
      }
    });
  });
}

// =========================
// Sales
// =========================
async function addSale(customerId, qty, rate, paymentType, paidAmount) {
  if (!customerId) throw new Error('Choose customer');
  qty = Number(qty) || 0;
  rate = Number(rate) || 0;
  paidAmount = Number(paidAmount) || 0;
  const total = qty * rate;
  let credit = paymentType === 'paid' ? 0 : paymentType === 'partial' ? total - paidAmount : total;
  if (credit < 0) credit = 0;

  await db.collection('sales').add({
    customerId,
    qty,
    rate,
    total,
    paid: paidAmount,
    credit,
    paymentType,
    date: firebase.firestore.FieldValue.serverTimestamp()
  });

  const custRef = db.collection('customers').doc(customerId);
  await db.runTransaction(async t => {
    const snap = await t.get(custRef);
    const prev = snap.exists ? Number(snap.data().pending || 0) : 0;
    const nextPending = prev + credit;
    t.update(custRef, { pending: nextPending });
  });
}

// =========================
// Pending
// =========================
function listenPending() {
  const pendingList = $('pendingList');
  if (!pendingList) return;
  db.collection('customers').where('pending', '>', 0).orderBy('pending', 'desc').onSnapshot(snap => {
    pendingList.innerHTML = '';
    snap.forEach(doc => {
      const c = doc.data();
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `<div><strong>${c.name}</strong><div class="small-muted">${c.mobile||''}</div></div>
      <div>₹${c.pending}</div>`;
      pendingList.appendChild(li);
    });
  });
}

// =========================
// Reports
// =========================
async function loadReports() {
  const el = $('report-area');
  if (!el) return;
  el.innerHTML = '<p>Loading...</p>';

  const salesSnap = await db.collection('sales').get();
  const custSnap = await db.collection('customers').get();

  let totalSales = 0, totalPaid = 0, totalPending = 0;
  salesSnap.forEach(s => { const d=s.data(); totalSales+=d.total||0; totalPaid+=d.paid||0; });
  custSnap.forEach(c => { totalPending += c.data().pending||0; });

  el.innerHTML = `<div class="card p-3">
    <div><strong>Total Sales:</strong> ₹${totalSales}</div>
    <div><strong>Total Paid:</strong> ₹${totalPaid}</div>
    <div><strong>Total Pending:</strong> ₹${totalPending}</div>
  </div>`;
}

// =========================
// Event wiring
// =========================
window.addEventListener('DOMContentLoaded', () => {
  // Customers page
  if ($('addCustomerForm')) {
    listenCustomers();
    $('addCustomerForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('c_name').value.trim();
      const mobile = $('c_mobile').value.trim();
      try {
        await addCustomer(name, mobile);
        $('c_name').value = '';
        $('c_mobile').value = '';
      } catch(err){alert(err.message);}
    });
  }

  // Sales page
  if ($('addSaleForm')) {
    listenCustomers();
    $('addSaleForm').addEventListener('submit', async e => {
      e.preventDefault();
      const customerId = $('sale_customer').value;
      const qty = $('qty').value;
      const rate = $('rate').value;
      const paymentType = $('payment_type').value;
      const paidAmount = $('paid_amount').value;
      try {
        await addSale(customerId, qty, rate, paymentType, paidAmount);
        alert('Sale recorded');
        $('sale_customer').value=''; $('qty').value=''; $('rate').value=''; $('paid_amount').value='';
      } catch(err){alert(err.message);}
    });
  }

  // Pending page
  if ($('pendingList')) listenPending();

  // Reports page
  if ($('report-area')) loadReports();
});
