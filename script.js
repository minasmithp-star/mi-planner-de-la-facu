// ----- Estado y utilidades -----
const STORAGE_KEY = "budget_dashboard_v1";
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const fmt = n => `$ ${Number(n||0).toFixed(2)}`;
const parseNum = v => Number(v||0);
const uid = () => Math.random().toString(36).slice(2,10);

const DEFAULT_CATS = [
  "Bills","Expenses","Debt","Subscriptions","Savings & Investments"
];

let state = loadState() || {
  range: { from: "", to: "" },
  rollover: 0,
  categories: [...DEFAULT_CATS],
  incomes: [
    // {id, date:"2025-08-01", source:"Beca", amount: 120.00}
  ],
  expenses: [
    // {id, date:"2025-08-02", category:"Bills", desc:"Luz", budget:50, actual:48.3}
  ]
};

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{ return null; } }

function inRange(dateISO){
  const {from,to} = state.range;
  if(!from && !to) return true;
  const d = new Date(dateISO);
  if(from && d < new Date(from)) return false;
  if(to && d > new Date(to)) return false;
  return true;
}

// ----- Inicio -----
document.addEventListener("DOMContentLoaded", ()=>{
  bindUI();
  renderAll();
});

// ----- UI principal -----
function bindUI(){
  // filtros
  $("#fromDate").value = state.range.from || "";
  $("#toDate").value = state.range.to || "";
  $("#rollover").value = state.rollover || 0;

  $("#applyRange").addEventListener("click", ()=>{
    state.range.from = $("#fromDate").value || "";
    state.range.to = $("#toDate").value || "";
    state.rollover = parseNum($("#rollover").value);
    saveState(); renderAll();
  });

  // ingreso
  $("#addIncomeBtn").addEventListener("click", ()=> openIncomeModal());
  // gasto
  $("#addExpenseBtn").addEventListener("click", ()=> openExpenseModal());
  $("#manageCatsBtn").addEventListener("click", openCategoryManager);

  // filtros de categoría
  renderCategoryFilter();

  // importar / exportar / reset
  $("#exportBtn").addEventListener("click", exportJSON);
  $("#importInput").addEventListener("change", importJSON);
  $("#resetBtn").addEventListener("click", ()=>{
    if(confirm("Esto borrará tus datos locales del dashboard. ¿Continuar?")){
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });
}

function renderCategoryFilter(){
  const sel = $("#categoryFilter");
  sel.innerHTML = `<option value="all">Todas las categorías</option>` + state.categories.map(c=>`<option value="${c}">${c}</option>`).join("");
  sel.addEventListener("change", renderExpenses);
}

// ----- Render raíz -----
let pieChart, barChart;
function renderAll(){
  renderIncomes();
  renderExpenses();
  renderCashflow();
  renderCharts();
}

// ----- Ingresos -----
function renderIncomes(){
  const body = $("#incomeBody");
  body.innerHTML = "";
  const items = state.incomes.filter(i=>inRange(i.date)).sort((a,b)=> new Date(a.date)-new Date(b.date));
  let total = 0;

  items.forEach(it=>{
    total += parseNum(it.amount);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.date || ""}</td>
      <td>${escapeHtml(it.source||"")}</td>
      <td>${fmt(it.amount)}</td>
      <td>
        <span class="action-link" data-edit="${it.id}">Editar</span> ·
        <span class="action-link" data-del="${it.id}">Eliminar</span>
      </td>
    `;
    body.appendChild(tr);

    tr.querySelector(`[data-edit="${it.id}"]`).addEventListener("click", ()=> openIncomeModal(it));
    tr.querySelector(`[data-del="${it.id}"]`).addEventListener("click", ()=>{
      if(confirm("¿Eliminar ingreso?")){
        state.incomes = state.incomes.filter(x=>x.id!==it.id);
        saveState(); renderAll();
      }
    });
  });

  $("#incomeTotal").textContent = fmt(total);
}

// Modal Ingreso
function openIncomeModal(item=null){
  const data = item || { id: uid(), date:"", source:"", amount:0 };
  const isEdit = !!item;
  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar ingreso":"Nuevo ingreso"}</h3>
      <div class="grid-2">
        <div><label>Fecha</label><input id="i_date" type="date" class="input" value="${data.date}"/></div>
        <div><label>Monto</label><input id="i_amount" type="number" step="0.01" class="input" value="${data.amount}"/></div>
      </div>
      <div><label>Fuente</label><input id="i_source" class="input" placeholder="Ej: Beca, Trabajo" value="${escapeHtml(data.source)}"/></div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="i_save" class="btn">${isEdit?"Guardar":"Crear"}</button>
    </div>
  `;
  $("#i_save").addEventListener("click",(e)=>{
    e.preventDefault();
    data.date = $("#i_date").value;
    data.amount = parseNum($("#i_amount").value);
    data.source = $("#i_source").value.trim();
    if(!data.date) return alert("Selecciona una fecha.");
    if(isEdit){
      const i = state.incomes.findIndex(x=>x.id===data.id);
      state.incomes[i]=data;
    }else{
      state.incomes.push(data);
    }
    saveState(); $("#modal").close(); renderAll();
  });
  $("#modal").showModal();
}

// ----- Gastos -----
function renderExpenses(){
  const body = $("#expenseBody");
  body.innerHTML = "";

  const catFilter = $("#categoryFilter").value || "all";

  const items = state.expenses
    .filter(e=>inRange(e.date))
    .filter(e=> catFilter==="all" ? true : e.category===catFilter)
    .sort((a,b)=> new Date(a.date)-new Date(b.date));

  let budgetSum = 0, actualSum = 0;

  items.forEach(it=>{
    budgetSum += parseNum(it.budget);
    actualSum += parseNum(it.actual);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.date||""}</td>
      <td><span class="badge">${escapeHtml(it.category)}</span></td>
      <td>${escapeHtml(it.desc||"")}</td>
      <td>${fmt(it.budget)}</td>
      <td>${fmt(it.actual)}</td>
      <td>
        <span class="action-link" data-edit="${it.id}">Editar</span> ·
        <span class="action-link" data-del="${it.id}">Eliminar</span>
      </td>
    `;
    body.appendChild(tr);

    tr.querySelector(`[data-edit="${it.id}"]`).addEventListener("click", ()=> openExpenseModal(it));
    tr.querySelector(`[data-del="${it.id}"]`).addEventListener("click", ()=>{
      if(confirm("¿Eliminar gasto?")){
        state.expenses = state.expenses.filter(x=>x.id!==it.id);
        saveState(); renderAll();
      }
    });
  });

  $("#budgetTotal").textContent = fmt(budgetSum);
  $("#actualTotal").textContent = fmt(actualSum);
}

// Modal Gasto
function openExpenseModal(item=null){
  const data = item || { id: uid(), date:"", category: state.categories[0]||"Expenses", desc:"", budget:0, actual:0 };
  const isEdit = !!item;
  const options = state.categories.map(c=>`<option ${c===data.category?"selected":""}>${c}</option>`).join("");

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar gasto":"Nuevo gasto"}</h3>
      <div class="grid-2">
        <div><label>Fecha</label><input id="e_date" type="date" class="input" value="${data.date}"/></div>
        <div><label>Categoría</label><select id="e_cat" class="input">${options}</select></div>
      </div>
      <div><label>Descripción</label><input id="e_desc" class="input" value="${escapeHtml(data.desc)}" placeholder="Ej: Libros, Comida, Internet"/></div>
      <div class="grid-2">
        <div><label>Budget</label><input id="e_budget" type="number" step="0.01" class="input" value="${data.budget}"/></div>
        <div><label>Actual</label><input id="e_actual" type="number" step="0.01" class="input" value="${data.actual}"/></div>
      </div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="e_save" class="btn">${isEdit?"Guardar":"Crear"}</button>
    </div>
  `;

  $("#e_save").addEventListener("click",(e)=>{
    e.preventDefault();
    data.date = $("#e_date").value;
    data.category = $("#e_cat").value;
    data.desc = $("#e_desc").value.trim();
    data.budget = parseNum($("#e_budget").value);
    data.actual = parseNum($("#e_actual").value);
    if(!data.date) return alert("Selecciona una fecha.");
    if(isEdit){
      const i = state.expenses.findIndex(x=>x.id===data.id);
      state.expenses[i]=data;
    }else{
      state.expenses.push(data);
    }
    saveState(); $("#modal").close(); renderAll();
  });

  $("#modal").showModal();
}

// ----- Categorías -----
function openCategoryManager(){
  const listHtml = state.categories.map((c,i)=>`
    <div class="row" style="grid-template-columns:1fr auto;align-items:center">
      <input class="input cat-input" data-i="${i}" value="${escapeHtml(c)}" />
      <button class="btn btn-ghost" data-del="${i}" style="color:#c026d3">Eliminar</button>
    </div>
  `).join("");

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>Categorías</h3>
      <div id="catList">${listHtml||'<small>No hay categorías</small>'}</div>
      <div class="row" style="grid-template-columns:1fr auto;align-items:center">
        <input id="newCat" class="input" placeholder="Nueva categoría" />
        <button id="addCat" class="btn">Añadir</button>
      </div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cerrar</button>
      <button id="saveCats" class="btn">Guardar</button>
    </div>
  `;

  $("#addCat").addEventListener("click", ()=>{
    const v = $("#newCat").value.trim();
    if(!v) return;
    state.categories.push(v);
    saveState();
    $("#modal").close(); openCategoryManager();
  });

  $$("#catList [data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const idx = Number(btn.getAttribute("data-del"));
      const cat = state.categories[idx];
      // reubicar gastos de esa categoría a "Expenses"
      state.expenses.forEach(e=>{ if(e.category===cat) e.category="Expenses"; });
      state.categories.splice(idx,1);
      saveState(); $("#modal").close(); openCategoryManager();
    });
  });

  $("#saveCats").addEventListener("click", ()=>{
    $$(".cat-input").forEach(inp=>{
      const i = Number(inp.getAttribute("data-i"));
      const old = state.categories[i];
      const val = inp.value.trim() || old;
      // renombrar en gastos
      state.expenses.forEach(e=>{ if(e.category===old) e.category = val; });
      state.categories[i] = val;
    });
    saveState(); $("#modal").close(); renderCategoryFilter(); renderAll();
  });

  $("#modal").showModal();
}

// ----- Cashflow Summary -----
function sumByCategory(kind="budget"){
  const map = {};
  state.categories.forEach(c=>map[c]=0);
  state.expenses.filter(inRange).forEach(e=>{
    map[e.category] = (map[e.category]||0) + parseNum(e[kind]);
  });
  return map;
}

function renderCashflow(){
  const body = $("#cashflowBody");
  body.innerHTML = "";

  const income = state.incomes.filter(inRange).reduce((s,i)=> s + parseNum(i.amount), 0);
  const budgetByCat = sumByCategory("budget");
  const actualByCat = sumByCategory("actual");

  const mkRow = (label, b, a) => `
    <tr>
      <td>${label}</td>
      <td>${fmt(b)}</td>
      <td>${fmt(a)}</td>
    </tr>
  `;

  // Rollover e ingresos
  let budgetIncome = state.rollover + income;
  let actualIncome = state.rollover + income;

  let budgetExpenses = 0, actualExpenses = 0;

  const blocks = ["Bills","Expenses","Debt","Subscriptions","Savings & Investments"];
  blocks.forEach(cat=>{
    budgetExpenses += budgetByCat[cat]||0;
    actualExpenses += actualByCat[cat]||0;
  });

  const extraCats = state.categories.filter(c=>!blocks.includes(c));
  // añadir filas
  body.insertAdjacentHTML("beforeend", mkRow("+ Rollover", state.rollover, state.rollover));
  body.insertAdjacentHTML("beforeend", mkRow("Income", income, income));
  body.insertAdjacentHTML("beforeend", mkRow("Expenses", budgetByCat["Expenses"]||0, actualByCat["Expenses"]||0));
  body.insertAdjacentHTML("beforeend", mkRow("Bills", budgetByCat["Bills"]||0, actualByCat["Bills"]||0));
  body.insertAdjacentHTML("beforeend", mkRow("Debt", budgetByCat["Debt"]||0, actualByCat["Debt"]||0));
  body.insertAdjacentHTML("beforeend", mkRow("Subscriptions", budgetByCat["Subscriptions"]||0, actualByCat["Subscriptions"]||0));
  body.insertAdjacentHTML("beforeend", mkRow("Savings & Investments", budgetByCat["Savings & Investments"]||0, actualByCat["Savings & Investments"]||0));

  extraCats.forEach(cat=>{
    body.insertAdjacentHTML("beforeend", mkRow(cat, budgetByCat[cat]||0, actualByCat[cat]||0));
    budgetExpenses += budgetByCat[cat]||0;
    actualExpenses += actualByCat[cat]||0;
  });

  $("#leftBudget").textContent = fmt(budgetIncome - budgetExpenses);
  $("#leftActual").textContent  = fmt(actualIncome - actualExpenses);
}

// ----- Gráficos -----
function renderCharts(){
  const budgetByCat = sumByCategory("budget");
  const actualByCat = sumByCategory("actual");
  const labels = state.categories;

  const pieLabels = labels;
  const pieData = pieLabels.map(l => actualByCat[l]||0);

  const barLabels = labels;
  const barBudget = barLabels.map(l => budgetByCat[l]||0);
  const barActual = barLabels.map(l => actualByCat[l]||0);

  // Pie
  const pieCtx = $("#pieSpending");
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type:"pie",
    data:{
      labels: pieLabels,
      datasets:[{
        data: pieData
      }]
    },
    options:{
      plugins:{ legend:{ position:"bottom" } }
    }
  });

  // Barras
  const barCtx = $("#barBudgetActual");
  if(barChart) barChart.destroy();
  barChart = new Chart(barCtx, {
    type:"bar",
    data:{
      labels: barLabels,
      datasets:[
        { label:"Budget", data:barBudget },
        { label:"Actual", data:barActual }
      ]
    },
    options:{
      responsive:true,
      scales:{ y:{ beginAtZero:true } },
      plugins:{ legend:{ position:"bottom" } }
    }
  });
}

// ----- Import/Export -----
function exportJSON(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "budget_dashboard.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function importJSON(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      // Validación simple
      if(!data || !("incomes" in data && "expenses" in data)) throw new Error("Formato inválido.");
      state = {...state, ...data};
      saveState(); renderAll();
    }catch(err){ alert("No se pudo importar: " + err.message); }
  };
  reader.readAsText(file);
}

// ----- Helpers -----
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
