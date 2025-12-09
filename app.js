// Helper
const $ = id => document.getElementById(id);

// =========================
// Load Customers in dropdown
// =========================
function loadCustomersForSales() {
  const select = $("sale_customer");
  if (!select) return;
  select.innerHTML = "<option value=''>Select customer</option>";

  db.collection("customers").orderBy("name").onSnapshot(snapshot => {
    select.innerHTML = "<option value=''>Select customer</option>"; // reset
    snapshot.forEach(doc => {
      const c = doc.data();
      const opt = document.createElement("option");
      opt.value = doc.id; // Firestore document ID
      opt.textContent = `${c.name} (${c.mobile || ''})`;
      select.appendChild(opt);
    });
  }, err => {
    console.error("Error loading customers:", err);
  });
}

// =========================
// Precise math utilities
// =========================
function preciseAdd(a, b) { return Math.round((Number(a)||0)*100 + (Number(b)||0)*100)/100; }
function preciseSubtract(a, b) { return Math.round((Number(a)||0)*100 - (Number(b)||0)*100)/100; }
function preciseMultiply(a, b) { return Math.round((Number(a)||0 * Number(b)||0)*100)/100; }

// =========================
// Add Sale
// =========================
async function addSale(customerId, qty, rate, paymentType, paidAmount) {
  qty = Number(qty)||0;
  rate = Number(rate)||0;
  paidAmount = Number(paidAmount)||0;

  const total = preciseMultiply(qty, rate);
  let credit = 0;

  if (paymentType === "paid") credit = 0;
  else if (paymentType === "partial") credit = preciseSubtract(total, paidAmount);
  else credit = total;

  if (credit < 0) credit = 0;

  // Add sale document
  await db.collection("sales").add({
    customerId, qty, rate, total, paid: paidAmount,
    credit, paymentType,
    date: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Update customer's pending in transaction
  const custRef = db.collection("customers").doc(customerId);
  await db.runTransaction(async t => {
    const snap = await t.get(custRef);
    const prevPending = snap.exists ? Number(snap.data().pending||0) : 0;
    const nextPending = preciseAdd(prevPending, credit);
    t.update(custRef, { pending: nextPending });
  });

  alert("Sale recorded successfully!");
}

// =========================
// Wire up form
// =========================
document.addEventListener("DOMContentLoaded", () => {
  loadCustomersForSales();

  const form = $("addSaleForm");
  form.addEventListener("submit", async e => {
    e.preventDefault(); // prevent page reload

    const customerId = $("sale_customer").value;
    const qty = $("qty").value;
    const rate = $("rate").value;
    const paymentType = $("payment_type").value;
    const paidAmount = $("paid_amount").value;

    if (!customerId) return alert("Please select a customer.");

    try {
      await addSale(customerId, qty, rate, paymentType, paidAmount);

      // reset form
      $("sale_customer").value = "";
      $("qty").value = "";
      $("rate").value = "";
      $("paid_amount").value = "";
      $("payment_type").value = "paid";
    } catch (err) {
      console.error(err);
      alert("Error saving sale. Check console for details.");
    }
  });
});
