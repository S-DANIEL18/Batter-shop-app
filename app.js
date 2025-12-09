
<script src="app.js"></script>
// app.js (compat-style) — Batter Shop full app logic
// Assumes firebase.initializeApp(...) and `const db = firebase.firestore();` exist in firebase.js

/* Helper */
const $ = id => document.getElementById(id);
const normalizeMobileForWa = (raw) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // If 10 digits, assume India and prefix 91
  if (digits.length === 10) return '91' + digits;
  return digits;
};

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
  if (select) {
    select.innerHTML = '<option value="">Select customer</option>';
  }

  db.collection('customers').orderBy('name').onSnapshot(snapshot => {
    if (listEl) listEl.innerHTML = '';
    if (select) select.innerHTML = '<option value="">Select customer</option>';
    snapshot.forEach(doc => {
      const c = doc.data();
      const id = doc.id;

      // customers list (customers.html)
      if (listEl) {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start';
        const left = document.createElement('div');
        left.innerHTML = `<strong>${escapeHtml(c.name)}</strong><div class="small-muted">${escapeHtml(c.mobile || '')}</div>`;
        const right = document.createElement('div');
        right.innerHTML = `<div class="text-end">₹${numberToString(c.pending || 0)}</div>
          <div class="mt-1">
            <button class="btn btn-sm btn-primary me-1" onclick="sendWhatsApp('${id}')">Remind</button>
            <button class="btn btn-sm btn-outline-success" onclick="receivePaymentPrompt('${id}')">Receive</button>
          </div>`;
        li.appendChild(left);
        li.appendChild(right);
        listEl.appendChild(li);
      }

      // sale select
      if (select) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${c.name} (${c.mobile || ''})`;
        select.appendChild(opt);
      }
    });
  }, err => {
    console.error('listenCustomers error', err);
  });
}

/* =========================
   Sales (addSale)
   ========================= */
async function addSale(customerId, qty, rate, paymentType, paidAmount) {
  if (!customerId) throw new Error('Choose customer');
  qty = Number(qty) || 0;
  rate = Number(rate) || 0;
  paidAmount = Number(paidAmount) || 0;

  // Calculate total carefully (digit-by-digit rule)
  // Use integer cents-like calculation to avoid precision issues
  const total = preciseMultiply(qty, rate);

  let credit = 0;
  if (paymentType === 'paid') {
    credit = 0;
  } else if (paymentType === 'partial') {
    credit = preciseSubtract(total, paidAmount);
  } else { // credit / not paid
    credit = total;
  }
  if (credit < 0) credit = 0;

  // Add sale
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

  // Update customer's pending inside a transaction
  const custRef = db.collection('customers').doc(customerId);
  await db.runTransaction(async t => {
    const snap = await t.get(custRef);
    const prev = snap.exists ? Number(snap.data().pending || 0) : 0;
    const nextPending = preciseAdd(prev, credit);
    t.update(custRef, { pending: nextPending });

    // create reminder if crosses 100
    if (prev <= 100 && nextPending > 100) {
      await db.collection('reminders').add({
        customerId,
        amount: nextPending,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        sent: false
      });
    }
  });
}

/* =========================
   Receive Payment
   ========================= */
function receivePaymentPrompt(customerId) {
  const amt = prompt('Enter amount received (₹):', '0');
  if (!amt) return;
  const value = Number(amt);
  if (isNaN(value) || value <= 0) return alert('Enter a valid amount');
  receivePayment(customerId, value);
}

async function receivePayment(customerId, amount) {
  const custRef = db.collection('customers').doc(customerId);
  await db.runTransaction(async t => {
    const s = await t.get(custRef);
    if (!s.exists) throw new Error('Customer missing');
    const prev = Number(s.data().pending || 0);
    const next = preciseSubtract(prev, amount);
    const newPending = next < 0 ? 0 : next;
    t.update(custRef, { pending: newPending });
    await db.collection('payments').add({
      customerId,
      amount,
      date: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

/* =========================
   Pending list & Remind
   ========================= */
function listenPending() {
  const pendingList = $('pendingList');
  if (!pendingList) return;
  pendingList.innerHTML = '';
  db.collection('customers').where('pending', '>', 0).orderBy('pending', 'desc').onSnapshot(snap => {
    pendingList.innerHTML = '';
    snap.forEach(doc => {
      const c = doc.data();
      const id = doc.id;
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `<div><strong>${escapeHtml(c.name)}</strong><div class="small-muted">${escapeHtml(c.mobile||'')}</div></div>
        <div>
          <div>₹${numberToString(c.pending)}</div>
          <div class="mt-1"><button class="btn btn-sm btn-primary" onclick="sendWhatsApp('${id}')">Remind</button></div>
        </div>`;
      pendingList.appendChild(li);
    });
  }, err => {
    console.error('listenPending error', err);
  });
}

async function sendWhatsApp(customerId) {
  const doc = await db.collection('customers').doc(customerId).get();
  if (!doc.exists) return alert('Customer not found');
  const c = doc.data();
  const amount = numberToString(c.pending || 0);
  const mobileForWa = normalizeMobileForWa(c.mobile || '');
  const text = `Dear ${c.name}, this is a gentle reminder that your pending balance for batter purchase is ₹${amount}. Please arrange the payment. - Queen Batter Shop`;
  if (!mobileForWa) {
    alert('Customer mobile number missing or invalid.');
    return;
  }
  const url = `https://wa.me/${mobileForWa}?text=` + encodeURIComponent(text);
  window.open(url, '_blank');
}

/* =========================
   Reports
   ========================= */
function loadReports() {
  const el = $('summary') || $('report-area');
  if (!el) return;
  el.innerHTML = '<p>Loading...</p>';

  Promise.all([
    db.collection('sales').get(),
    db.collection('customers').get()
  ]).then(([salesSnap, custSnap]) => {
    let totalSales = 0;
    let totalPaid = 0;
    salesSnap.forEach(s => {
      const d = s.data();
      totalSales = preciseAdd(totalSales, Number(d.total || 0));
      totalPaid = preciseAdd(totalPaid, Number(d.paid || 0));
    });
    let totalPending = 0;
    custSnap.forEach(c => {
      totalPending = preciseAdd(totalPending, Number(c.data().pending || 0));
    });

    el.innerHTML = `<div class="card p-3">
      <div><strong>Total Sales:</strong> ₹${numberToString(totalSales)}</div>
      <div><strong>Total Paid:</strong> ₹${numberToString(totalPaid)}</div>
      <div><strong>Total Pending:</strong> ₹${numberToString(totalPending)}</div>
    </div>`;
  }).catch(err => {
    console.error('loadReports error', err);
    el.innerHTML = '<p>Error loading reports</p>';
  });
}

/* =========================
   Utilities: precise math & escaping
   ========================= */

// Convert number to string with no trailing .0 if integer
function numberToString(v) {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(2)));
}

// Precise add/subtract/multiply to avoid floating point error
function preciseAdd(a, b) {
  // treat as 2 decimal places
  const ai = Math.round((Number(a) || 0) * 100);
  const bi = Math.round((Number(b) || 0) * 100);
  return (ai + bi) / 100;
}
function preciseSubtract(a, b) {
  const ai = Math.round((Number(a) || 0) * 100);
  const bi = Math.round((Number(b) || 0) * 100);
  return (ai - bi) / 100;
}
function preciseMultiply(a, b) {
  // multiply qty * rate. assume rate may be decimal
  // use cents approach: result = round((a * b)*100)/100
  const res = (Number(a) || 0) * (Number(b) || 0);
  return Math.round(res * 100) / 100;
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* =========================
   Wire up forms & auto-run
   ========================= */

window.addEventListener('DOMContentLoaded', () => {
  // Customers page
  if ($('customersList') && $('addCustomerForm')) {
    listenCustomers();
    $('addCustomerForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('c_name').value.trim();
      const mobile = $('c_mobile').value.trim();
      if (!name) return alert('Enter name');
      try {
        await addCustomer(name, mobile);
        $('c_name').value = '';
        $('c_mobile').value = '';
      } catch (err) {
        console.error(err);
        alert('Error adding customer');
      }
    });
  }

  // Sales page
  if ($('addSaleForm')) {
    // populate customers select
    listenCustomers();
    $('addSaleForm').addEventListener('submit', async e => {
      e.preventDefault();
      const customerId = $('sale_customer').value;
      const qty = $('qty').value;
      const rate = $('rate').value;
      const paymentType = $('payment_type').value;
      const paidAmount = $('paid_amount').value;
      if (!customerId) return alert('Choose customer');
      try {
        await addSale(customerId, qty, rate, paymentType, paidAmount);
        alert('Sale recorded');
        // reset
        $('qty').value = '';
        $('rate').value = '';
        $('paid_amount').value = '';
        $('sale_customer').value = '';
      } catch (err) {
        console.error(err);
        alert('Error saving sale');
      }
    });
  }

  // Pending page
  if ($('pendingList')) {
    listenPending();
  }

  // Reports page
  if ($('summary') || $('report-area')) {
    loadReports();
  }
});

// SAVE CUSTOMER
function addCustomer() {
  const name = document.getElementById("customerName").value;
  const phone = document.getElementById("customerPhone").value;

  if (name === "" || phone === "") {
    alert("Please enter customer name and phone");
    return;
  }

  const newRef = db.ref("customers").push();
  newRef.set({
    name: name,
    phone: phone
  }).then(() => {
    alert("Customer added!");
    document.getElementById("customerName").value = "";
    document.getElementById("customerPhone").value = "";
  });
}
// LOAD CUSTOMERS ON SALES PAGE
function loadCustomersForSales() {
  const select = document.getElementById("customerSelect");
  select.innerHTML = "<option value=''>Select Customer</option>";

  db.ref("customers").on("value", (snapshot) => {
    snapshot.forEach((child) => {
      const customer = child.val();
      const option = document.createElement("option");
      option.value = child.key;
      option.textContent = customer.name + " (" + customer.phone + ")";
      select.appendChild(option);
    });
  });
}
