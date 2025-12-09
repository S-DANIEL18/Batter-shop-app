const $ = id => document.getElementById(id);

const customersListEl = $("customersList");
const addForm = $("addCustomerForm");

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// =========================
// Add customer
// =========================
addForm.addEventListener("submit", async e => {
  e.preventDefault();

  const name = $("c_name").value.trim();
  const mobile = $("c_mobile").value.trim();

  if (!name) return alert("Enter customer name");

  try {
    await db.collection("customers").add({
      name,
      mobile,
      pending: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    $("c_name").value = "";
    $("c_mobile").value = "";
  } catch (err) {
    console.error(err);
    alert("Error adding customer");
  }
});

// =========================
// Listen customers realtime
// =========================
function listenCustomers() {
  db.collection("customers").orderBy("name").onSnapshot(snapshot => {
    customersListEl.innerHTML = "";
    snapshot.forEach(doc => {
      const c = doc.data();
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.innerHTML = `<strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.mobile||'')})`;
      customersListEl.appendChild(li);
    });
  }, err => console.error("Error listening customers", err));
}

listenCustomers();
