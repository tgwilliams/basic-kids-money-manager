// Basic Children's Money Manager
// Everything is stored in the browser (localStorage), so no server is needed.

const STORAGE_KEY = "kids-money-manager:transactions";

// Fixed category order so each category always keeps the same color.
const CATEGORIES = [
  { id: "food", label: "Food & Snacks", color: "var(--cat-1)" },
  { id: "toys", label: "Toys & Games", color: "var(--cat-2)" },
  { id: "fun", label: "Fun & Activities", color: "var(--cat-3)" },
  { id: "clothes", label: "Clothes", color: "var(--cat-4)" },
  { id: "gifts", label: "Gifts", color: "var(--cat-5)" },
  { id: "other", label: "Other", color: "var(--cat-6)" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const els = {
  pie: document.getElementById("pie"),
  tooltip: document.getElementById("tooltip"),
  chartEmpty: document.getElementById("chart-empty"),
  legend: document.getElementById("legend"),
  total: document.getElementById("total-spent"),
  form: document.getElementById("spend-form"),
  amount: document.getElementById("amount"),
  date: document.getElementById("date"),
  category: document.getElementById("category"),
  place: document.getElementById("place"),
  error: document.getElementById("form-error"),
  list: document.getElementById("tx-list"),
  listEmpty: document.getElementById("list-empty"),
  reset: document.getElementById("reset-btn"),
};

let transactions = load();

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // Storage unavailable (e.g. private mode); the app still works for this visit.
  }
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

// ---------- Pie chart ----------

function arcPath(cx, cy, r, start, end) {
  // A full circle can't be drawn as a single arc, so split it in two.
  if (end - start >= Math.PI * 2 - 1e-6) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const x1 = cx + r * Math.sin(start);
  const y1 = cy - r * Math.cos(start);
  const x2 = cx + r * Math.sin(end);
  const y2 = cy - r * Math.cos(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function renderChart(totals, grandTotal) {
  els.pie.innerHTML = "";
  els.chartEmpty.hidden = grandTotal > 0;

  if (grandTotal === 0) {
    const empty = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    empty.setAttribute("cx", 100);
    empty.setAttribute("cy", 100);
    empty.setAttribute("r", 96);
    empty.setAttribute("fill", "var(--border)");
    els.pie.appendChild(empty);
    return;
  }

  let angle = 0;
  for (const cat of CATEGORIES) {
    const value = totals[cat.id];
    if (!value) continue;
    const sweep = (value / grandTotal) * Math.PI * 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", arcPath(100, 100, 96, angle, angle + sweep));
    path.setAttribute("fill", cat.color);
    const pct = Math.round((value / grandTotal) * 100);
    path.dataset.label = `${cat.label}: ${money.format(value)} (${pct}%)`;
    path.setAttribute("aria-label", path.dataset.label);
    els.pie.appendChild(path);
    angle += sweep;
  }
}

function showTooltip(e) {
  const path = e.target.closest("path");
  if (!path) return hideTooltip();
  els.pie.classList.add("hovering");
  els.pie.querySelectorAll("path").forEach((p) => p.classList.toggle("active", p === path));
  const box = els.pie.parentElement.getBoundingClientRect();
  els.tooltip.textContent = path.dataset.label;
  els.tooltip.style.left = `${e.clientX - box.left}px`;
  els.tooltip.style.top = `${e.clientY - box.top}px`;
  els.tooltip.hidden = false;
}

function hideTooltip() {
  els.pie.classList.remove("hovering");
  els.tooltip.hidden = true;
}

els.pie.addEventListener("pointermove", showTooltip);
els.pie.addEventListener("pointerdown", showTooltip);
els.pie.addEventListener("pointerleave", hideTooltip);

// ---------- Legend & list ----------

function renderLegend(totals) {
  els.legend.innerHTML = "";
  for (const cat of CATEGORIES) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="swatch" style="background:${cat.color}"></span><span></span><span class="amt"></span>`;
    li.children[1].textContent = cat.label;
    li.children[2].textContent = money.format(totals[cat.id] || 0);
    els.legend.appendChild(li);
  }
}

function renderList() {
  els.list.innerHTML = "";
  els.listEmpty.hidden = transactions.length > 0;

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  for (const tx of sorted) {
    const cat = categoryOf(tx.category);
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="swatch" style="background:${cat.color}"></span>
      <span><div class="tx-place"></div><div class="tx-meta"></div></span>
      <span class="tx-amt"></span>
      <button class="tx-del" type="button" aria-label="Delete">✕</button>`;
    li.querySelector(".tx-place").textContent = tx.place;
    li.querySelector(".tx-meta").textContent = `${cat.label} · ${formatDate(tx.date)}`;
    li.querySelector(".tx-amt").textContent = money.format(tx.amount);
    li.querySelector(".tx-del").addEventListener("click", () => {
      transactions = transactions.filter((t) => t.id !== tx.id);
      save();
      render();
    });
    els.list.appendChild(li);
  }
}

function render() {
  const totals = {};
  let grandTotal = 0;
  for (const tx of transactions) {
    const id = categoryOf(tx.category).id;
    totals[id] = (totals[id] || 0) + tx.amount;
    grandTotal += tx.amount;
  }
  els.total.textContent = money.format(grandTotal);
  renderChart(totals, grandTotal);
  renderLegend(totals);
  renderList();
}

// ---------- Form ----------

function setupForm() {
  for (const cat of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.label;
    els.category.appendChild(opt);
  }
  els.date.value = today();
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Math.round(parseFloat(els.amount.value) * 100) / 100;
  const place = els.place.value.trim();

  if (!(amount > 0)) return showError("Please enter how much you spent.");
  if (!els.date.value) return showError("Please pick when you spent it.");
  if (!place) return showError("Please say where you spent it.");

  transactions.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    amount,
    date: els.date.value,
    category: els.category.value,
    place,
    createdAt: Date.now(),
  });
  save();
  render();

  showError("");
  els.amount.value = "";
  els.place.value = "";
  els.amount.focus();
});

function showError(msg) {
  els.error.textContent = msg;
}

els.reset.addEventListener("click", () => {
  if (!transactions.length) return;
  if (!confirm("Erase all your spending and start over?")) return;
  transactions = [];
  save();
  render();
});

setupForm();
render();
