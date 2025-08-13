/* =================== UTILIDADES =================== */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const clamp = (n,min,max) => Math.min(max, Math.max(min,n));
const uid = () => Math.random().toString(36).slice(2,10);
const escapeHtml = s => (s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fmtMoney = n => `$ ${Number(n||0).toFixed(2)}`;

/* =================== ESTADO (UNO PARA TODO) =================== */
const STORAGE_KEY = "uni_finanzas_suite_v1";

let state = load() || {
  // Planificador
  planner: {
    subjects: [],
    tasks: [],
    grades: {}
  },
  // Finanzas
  finance: {
    range: { from:"", to:"" },
    rollover: 0,
    categories: ["Bills","Expenses","Debt","Subscriptions","Savings & Investments"],
    incomes: [],
    expenses: []
  }
};

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch{ return null; } }

/* =================== NAVEGACIÓN POR PESTAÑAS =================== */
document.addEventListener("DOMContentLoaded", ()=>{
  $$(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".tab").forEach(b=>b.classList.remove("active"));
      $$(".tabpanel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      $(`#tab-${btn.dataset.tab}`).classList.add("active");
      // redibujar gráficos si saltamos a finanzas
      if(btn.dataset.tab === "finanzas") renderFinanceAll(true);
    });
  });

  // Acciones globales
  $("#exportBtn").addEventListener("click", exportAll);
  $("#importInput").addEventListener("change", importAll);
  $("#resetBtn").addEventListener("click", ()=>{
    if(confirm("Esto borrará todos tus datos locales. ¿Continuar?")){
      localStorage.removeItem(STORAGE_KEY); location.reload();
    }
  });

  /* ====== Inicializar módulos ====== */
  bindPlanner();
  bindFinance();
  renderPlannerAll();
  renderFinanceAll(true);
});

/* =================== PLANIFICADOR =================== */
/* ---- helpers ---- */
function lighten(hex, amt=0.3){
  const c = hex.replace("#",""); const num = parseInt(c,16);
  let r=(num>>16)&255, g=(num>>8)&255, b=num&255;
  r = Math.round(r + (255-r)*amt); g = Math.round(g + (255-g)*amt); b = Math.round(b + (255-b)*amt);
  return `#${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}
function weekday(n){ return ["","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][n] || ""; }
function toMinutes(t){ const [h,m] = t.split(":").map(Number); return h*60+m; }

/* ---- bind ---- */
function bindPlanner(){
  $("#addSubjectBtn").addEventListener("click", ()=> openSubjectModal());
  $("#subjectSearch").addEventListener("input", renderSubjects);

  $("#addTaskBtn").addEventListener("click", ()=> openTaskModal());
  $("#filterStatus").addEventListener("change", renderTasks);
  $("#filterSubject").addEventListener("change", renderTasks);
  $("#taskSearch").addEventListener("input", renderTasks);

  $("#addCategoryBtn").addEventListener("click", ()=> addCategory($("#gradeSubjectSelect").value));
}

/* ---- render raíz ---- */
function renderPlannerAll(){
  renderSubjects();
  renderTimetable();
  renderTaskFilters();
  renderTasks();
  renderGradeModule();
  renderPlannerSummary();
}

/* ---- resumen ---- */
function renderPlannerSummary(){
  const S = state.planner;
  $("#statSubjects").textContent = S.subjects.length;
  const pend = S.tasks.filter(t=>!t.done).length;
  $("#statTodos").textContent = pend;

  const perSubj = S.subjects.map(s => computeGradeForSubject(s.id).current || 0);
  const avg = perSubj.length ? Math.round(perSubj.reduce((a,b)=>a+b,0)/perSubj.length) : 0;
  $("#statAvgProgress").textContent = `${avg}%`;

  const upcoming = S.tasks.filter(t=>!t.done && t.due).sort((a,b)=> new Date(a.due)-new Date(b.due))[0];
  $("#statNextDue").textContent = upcoming ? formatDate(upcoming.due) : "—";
}
function formatDate(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
}

/* ---- asignaturas ---- */
function renderSubjects(){
  const list = $("#subjectList");
  const q = ($("#subjectSearch").value || "").toLowerCase();
  list.innerHTML = "";

  state.planner.subjects
    .filter(s => s.name.toLowerCase().includes(q))
    .forEach(subj=>{
      const el = document.createElement("div");
      el.className = "subject-item";
      el.innerHTML = `
        <div>
          <div class="title" style="display:flex;align-items:center;gap:8px">
            <span class="chip" style="background:${lighten(subj.color||"#8bc2ff",0.6)};border-color:${lighten(subj.color||"#8bc2ff",0.3)}">${escapeHtml(subj.name)}</span>
          </div>
          <div class="meta">
            ${subj.slots?.length ? subj.slots.map(s=>`<span class="badge">${weekday(s.day)} ${s.start}-${s.end}${s.room?` · ${escapeHtml(s.room)}`:""}</span>`).join("") : '<span class="badge">Sin horarios</span>'}
          </div>
        </div>
        <div class="subject-actions">
          <button class="btn btn-ghost" data-edit="${subj.id}">Editar</button>
          <button class="btn btn-ghost" data-delete="${subj.id}" style="color:#b42318">Eliminar</button>
        </div>
      `;
      list.appendChild(el);

      el.querySelector(`[data-edit="${subj.id}"]`).addEventListener("click", ()=> openSubjectModal(subj));
      el.querySelector(`[data-delete="${subj.id}"]`).addEventListener("click", ()=>{
        if(confirm(`¿Eliminar "${subj.name}" y datos asociados?`)){
          state.planner.tasks = state.planner.tasks.filter(t=>t.subjectId !== subj.id);
          delete state.planner.grades[subj.id];
          state.planner.subjects = state.planner.subjects.filter(s=>s.id!==subj.id);
          save(); renderPlannerAll();
        }
      });
    });

  if(!list.children.length){
    list.innerHTML = `<div class="subject-item"><div class="meta">Aún no tienes asignaturas. Añade la primera 👇</div><div class="subject-actions"><button class="btn" id="firstAddSubject">Añadir</button></div></div>`;
    $("#firstAddSubject")?.addEventListener("click", ()=>openSubjectModal());
  }
}
function openSubjectModal(subj=null){
  const isEdit = !!subj;
  const data = subj || { id: uid(), name:"", color:"#8bc2ff", slots:[] };
  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit ? "Editar asignatura" : "Nueva asignatura"}</h3>
      <div class="row" style="grid-template-columns:1fr 160px">
        <div><label>Nombre</label><input id="m_name" class="input" value="${escapeHtml(data.name)}" placeholder="Ej: Química Orgánica" required /></div>
        <div><label>Color</label><input id="m_color" type="color" class="input" value="${data.color}" /></div>
      </div>
      <div class="row" style="grid-template-columns:1fr">
        <label>Agregar horario</label>
        <div class="cat-controls" style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="m_day" class="input"><option value="1">Lunes</option><option value="2">Martes</option><option value="3">Miércoles</option><option value="4">Jueves</option><option value="5">Viernes</option><option value="6">Sábado</option></select>
          <input id="m_start" type="time" class="input" />
          <input id="m_end" type="time" class="input" />
          <input id="m_room" class="input" placeholder="Sala (opcional)" />
          <button id="m_addSlot" class="btn">Añadir</button>
        </div>
      </div>
      <div id="m_slots" class="subject-list"></div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="m_save" class="btn">${isEdit?"Guardar":"Crear"}</button>
    </div>
  `;

  const renderSlots = ()=>{
    const cont = $("#m_slots");
    cont.innerHTML = data.slots.map((s,i)=>`
      <div class="subject-item">
        <div class="meta"><span class="badge">${weekday(s.day)} ${s.start}-${s.end}${s.room?` · ${escapeHtml(s.room)}`:""}</span></div>
        <div class="subject-actions"><button class="btn btn-ghost" data-rm="${i}" style="color:#b42318">Quitar</button></div>
      </div>
    `).join("");
    $$("#m_slots [data-rm]").forEach(btn=>{
      btn.addEventListener("click",()=>{ data.slots.splice(+btn.dataset.rm,1); renderSlots(); });
    });
  };
  renderSlots();

  $("#m_addSlot").addEventListener("click",(e)=>{
    e.preventDefault();
    const day = +$("#m_day").value, start=$("#m_start").value, end=$("#m_end").value;
    if(!start || !end) return alert("Completa inicio y fin.");
    data.slots.push({day,start,end,room:$("#m_room").value.trim()});
    $("#m_start").value=""; $("#m_end").value=""; $("#m_room").value="";
    renderSlots();
  });

  $("#m_save").addEventListener("click",(e)=>{
    e.preventDefault();
    data.name = $("#m_name").value.trim();
    data.color = $("#m_color").value;
    if(!data.name) return alert("Pon un nombre.");
    if(isEdit){
      const i = state.planner.subjects.findIndex(s=>s.id===data.id);
      state.planner.subjects[i] = data;
    } else {
      state.planner.subjects.push(data);
    }
    save(); $("#modal").close(); renderPlannerAll();
  });

  $("#modal").showModal();
}

/* ---- horario ---- */
function renderTimetable(){
  const grid = $("#timetableGrid");
  grid.innerHTML = "";
  const hours = Array.from({length:14}, (_,i)=>i+8); // 08..21
  hours.forEach(h=>{
    const hh = String(h).padStart(2,"0")+":00";
    const timeCell = document.createElement("div");
    timeCell.className="time-cell"; timeCell.textContent = hh;
    grid.appendChild(timeCell);

    for(let d=1; d<=6; d++){
      const slotCell = document.createElement("div"); slotCell.className="slot"; grid.appendChild(slotCell);
      state.planner.subjects.forEach(s=>{
        (s.slots||[]).forEach(sl=>{
          if(sl.day!==d) return;
          const startMin = toMinutes(sl.start), endMin = toMinutes(sl.end);
          if(startMin < (h+1)*60 && endMin > h*60){
            const topMin = Math.max(0, startMin - h*60);
            const blockMin = Math.min(60, endMin - h*60);
            const b = document.createElement("div");
            b.className="block";
            b.style.background = `linear-gradient(180deg, ${lighten(s.color||"#4da3ff",0.25)}, ${s.color||"#4da3ff"})`;
            b.style.top = `${(topMin/60)*48}px`;
            b.style.height = `${(blockMin/60)*48}px`;
            b.innerHTML = `${escapeHtml(s.name)}<div class="small">${sl.start}–${sl.end}${sl.room?` · ${escapeHtml(sl.room)}`:""}</div>`;
            slotCell.appendChild(b);
          }
        });
      });
    }
  });
}

/* ---- tareas ---- */
function renderTaskFilters(){
  const sel = $("#filterSubject");
  sel.innerHTML = `<option value="all">Todas las asignaturas</option>` +
    state.planner.subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}
function renderTasks(){
  const list = $("#taskList");
  list.innerHTML = "";
  const S = state.planner;
  const status = $("#filterStatus").value || "all";
  const subj = $("#filterSubject").value || "all";
  const query = ($("#taskSearch").value || "").toLowerCase();

  const tasks = S.tasks
    .filter(t => status==="all" ? true : status==="open" ? !t.done : t.done)
    .filter(t => subj==="all" ? true : t.subjectId===subj)
    .filter(t => (t.title.toLowerCase().includes(query) || (t.tag||"").toLowerCase().includes(query)))
    .sort((a,b)=>{
      const da = a.due ? new Date(a.due) : new Date("2999-01-01");
      const db = b.due ? new Date(b.due) : new Date("2999-01-01");
      return da - db;
    });

  tasks.forEach(t=>{
    const s = S.subjects.find(x=>x.id===t.subjectId);
    const el = document.createElement("div");
    el.className="task";
    el.innerHTML = `
      <div>
        <div class="task-title ${t.done?'done':''}">${escapeHtml(t.title)}</div>
        <div class="meta">
          ${s? `<span class="badge">${escapeHtml(s.name)}</span>` : `<span class="badge">General</span>`}
          ${t.due? `<span class="badge">${formatDate(t.due)}</span>`:""}
          <span class="badge ${t.priority==='alta'?'red':t.priority==='baja'?'':'green'}">${t.priority}</span>
          ${t.tag? `<span class="badge">#${escapeHtml(t.tag)}</span>`:""}
        </div>
      </div>
      <div class="subject-actions">
        <button class="btn btn-ghost" data-toggle="${t.id}">${t.done?'Reabrir':'Completar'}</button>
        <button class="btn btn-ghost" data-edit="${t.id}">Editar</button>
        <button class="btn btn-ghost" style="color:#b42318" data-del="${t.id}">Eliminar</button>
      </div>
    `;
    list.appendChild(el);
    el.querySelector(`[data-toggle="${t.id}"]`).addEventListener("click", ()=>{ t.done=!t.done; save(); renderPlannerAll(); });
    el.querySelector(`[data-edit="${t.id}"]`).addEventListener("click", ()=> openTaskModal(t));
    el.querySelector(`[data-del="${t.id}"]`).addEventListener("click", ()=>{
      if(confirm(`¿Eliminar tarea "${t.title}"?`)){
        state.planner.tasks = S.tasks.filter(x=>x.id!==t.id);
        save(); renderPlannerAll();
      }
    });
  });

  if(!tasks.length){
    list.innerHTML = `<div class="task"><div class="meta">No hay tareas que coincidan con el filtro.</div></div>`;
  }
}
function openTaskModal(task=null){
  const S = state.planner;
  const data = task || { id: uid(), title:"", subjectId:"", due:"", priority:"media", tag:"", done:false };
  const isEdit = !!task;
  const subjectsOpts = S.subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar tarea":"Nueva tarea"}</h3>
      <div class="row"><label>Título</label><input id="t_title" class="input" value="${escapeHtml(data.title)}" placeholder="Ej: Informe laboratorio 2" required /></div>
      <div class="row" style="grid-template-columns:1fr 1fr">
        <div><label>Asignatura</label><select id="t_subject" class="input"><option value="">General</option>${subjectsOpts}</select></div>
        <div><label>Entrega</label><input id="t_due" type="date" class="input" value="${data.due||""}" /></div>
      </div>
      <div class="row" style="grid-template-columns:1fr 1fr">
        <div><label>Prioridad</label>
          <select id="t_priority" class="input">
            <option value="alta" ${data.priority==="alta"?"selected":""}>Alta</option>
            <option value="media" ${data.priority==="media"?"selected":""}>Media</option>
            <option value="baja" ${data.priority==="baja"?"selected":""}>Baja</option>
          </select>
        </div>
        <div><label>Etiqueta</label><input id="t_tag" class="input" value="${escapeHtml(data.tag||"")}" placeholder="Ej: lab, lectura..." /></div>
      </div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="t_save" class="btn">${isEdit?"Guardar":"Crear"}</button>
    </div>
  `;
  $("#t_subject").value = data.subjectId || "";
  $("#t_save").addEventListener("click",(e)=>{
    e.preventDefault();
    data.title = $("#t_title").value.trim();
    data.subjectId = $("#t_subject").value || null;
    data.due = $("#t_due").value || "";
    data.priority = $("#t_priority").value;
    data.tag = $("#t_tag").value.trim();
    if(!data.title) return alert("Ponle un título.");
    if(isEdit){
      const i = S.tasks.findIndex(x=>x.id===data.id);
      S.tasks[i]=data;
    } else {
      S.tasks.push(data);
    }
    save(); $("#modal").close(); renderPlannerAll();
  });
  $("#modal").showModal();
}

/* ---- notas ---- */
function renderGradeModule(){
  const sel = $("#gradeSubjectSelect");
  const S = state.planner;
  sel.innerHTML = S.subjects.length
    ? S.subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")
    : `<option value="">(Agrega asignaturas para gestionar notas)</option>`;
  sel.onchange = renderCategories;
  renderCategories();
}
function renderCategories(){
  const subjId = $("#gradeSubjectSelect").value;
  const list = $("#categoryList");
  list.innerHTML = "";
  if(!subjId){ updateGradeSummary(0,0); return; }

  const items = state.planner.grades[subjId] || [];
  items.forEach(cat=>{
    const row = document.createElement("div");
    row.className = "category";
    row.innerHTML = `
      <div class="cat-name">${escapeHtml(cat.name)}</div>
      <div class="cat-controls"><label>Peso (%)</label><input type="number" class="input" min="0" max="100" step="1" value="${cat.weight}" data-w="${cat.id}" /></div>
      <div class="cat-controls"><label>Nota (%)</label><input type="number" class="input" min="0" max="100" step="0.1" value="${cat.score}" data-s="${cat.id}" /></div>
      <div class="cat-controls">
        <button class="btn btn-ghost" data-edit="${cat.id}">Renombrar</button>
        <button class="btn btn-ghost" style="color:#b42318" data-del="${cat.id}">Eliminar</button>
      </div>
    `;
    list.appendChild(row);
    row.querySelector(`[data-w="${cat.id}"]`).addEventListener("input",(e)=>{ cat.weight = clamp(parseFloat(e.target.value||0),0,100); save(); updateSubjectGrade(subjId); });
    row.querySelector(`[data-s="${cat.id}"]`).addEventListener("input",(e)=>{ cat.score = clamp(parseFloat(e.target.value||0),0,100); save(); updateSubjectGrade(subjId); });
    row.querySelector(`[data-del="${cat.id}"]`).addEventListener("click",()=>{
      if(confirm("¿Eliminar categoría?")){
        state.planner.grades[subjId] = (state.planner.grades[subjId]||[]).filter(x=>x.id!==cat.id);
        save(); renderCategories(); renderPlannerSummary();
      }
    });
    row.querySelector(`[data-edit="${cat.id}"]`).addEventListener("click",()=>{
      const name = prompt("Nuevo nombre de categoría:", cat.name);
      if(name!==null){
        cat.name = name.trim() || cat.name;
        save(); renderCategories(); renderPlannerSummary();
      }
    });
  });

  updateSubjectGrade(subjId);
  if(!items.length){
    list.innerHTML = `<div class="category"><div class="cat-name">Sin categorías</div><div class="cat-controls">Añade la primera 👇</div></div>`;
  }
}
function addCategory(subjId){
  if(!subjId) return;
  const name = prompt("Nombre de la categoría (ej: Controles, Laboratorio, Examen):");
  if(!name) return;
  const obj = { id: uid(), name: name.trim(), weight: 0, score: 0 };
  state.planner.grades[subjId] = state.planner.grades[subjId] || [];
  state.planner.grades[subjId].push(obj);
  save(); renderCategories(); renderPlannerSummary();
}
function computeGradeForSubject(subjId){
  const cats = state.planner.grades[subjId] || [];
  const usedWeight = Math.round(cats.reduce((s,c)=> s + (Number(c.weight)||0), 0));
  const current = Math.round(cats.reduce((s,c)=> s + ((Number(c.weight)||0)*(Number(c.score)||0)/100), 0));
  return {current, usedWeight};
}
function updateSubjectGrade(subjId){
  const {current, usedWeight} = computeGradeForSubject(subjId);
  updateGradeSummary(current, usedWeight);
  renderPlannerSummary();
}
function updateGradeSummary(current, usedWeight){
  $("#currentGrade").textContent = `${clamp(current,0,100).toFixed(0)}%`;
  $("#usedWeight").textContent = `${usedWeight}%`;
  $("#gradeProgressBar").style.width = `${clamp(current,0,100)}%`;
}

/* =================== FINANZAS =================== */
const F = ()=> state.finance;
let pieChart, barChart;

function bindFinance(){
  $("#applyRange").addEventListener("click", ()=>{
    F().range.from = $("#fromDate").value || "";
    F().range.to = $("#toDate").value || "";
    F().rollover = Number($("#rollover").value || 0);
    save(); renderFinanceAll(true);
  });
  $("#addIncomeBtn").addEventListener("click", ()=> openIncomeModal());
  $("#addExpenseBtn").addEventListener("click", ()=> openExpenseModal());
  $("#manageCatsBtn").addEventListener("click", openCategoryManager);
  renderCategoryFilter();

  // set inputs iniciales
  $("#fromDate").value = F().range.from || "";
  $("#toDate").value = F().range.to || "";
  $("#rollover").value = F().rollover || 0;
}

function renderFinanceAll(redrawCharts=false){
  renderIncomes();
  renderExpenses();
  renderCashflow();
  if(redrawCharts) renderCharts();
}

function inRange(dateISO){
  const {from,to} = F().range;
  if(!from && !to) return true;
  const d = new Date(dateISO);
  if(from && d < new Date(from)) return false;
  if(to && d > new Date(to)) return false;
  return true;
}

function renderCategoryFilter(){
  const sel = $("#categoryFilter");
  sel.innerHTML = `<option value="all">Todas las categorías</option>` + F().categories.map(c=>`<option value="${c}">${c}</option>`).join("");
  sel.onchange = renderExpenses;
}

/* ---- ingresos ---- */
function renderIncomes(){
  const body = $("#incomeBody");
  body.innerHTML = "";
  const items = F().incomes.filter(i=>inRange(i.date)).sort((a,b)=> new Date(a.date)-new Date(b.date));
  let total = 0;
  items.forEach(it=>{
    total += Number(it.amount||0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.date||""}</td>
      <td>${escapeHtml(it.source||"")}</td>
      <td>${fmtMoney(it.amount)}</td>
      <td><span class="action-link" data-edit="${it.id}">Editar</span> · <span class="action-link" data-del="${it.id}">Eliminar</span></td>
    `;
    body.appendChild(tr);
    tr.querySelector(`[data-edit="${it.id}"]`).addEventListener("click", ()=> openIncomeModal(it));
    tr.querySelector(`[data-del="${it.id}"]`).addEventListener("click", ()=>{
      if(confirm("¿Eliminar ingreso?")){
        F().incomes = F().incomes.filter(x=>x.id!==it.id);
        save(); renderFinanceAll(true);
      }
    });
  });
  $("#incomeTotal").textContent = fmtMoney(total);
}
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
    data.amount = Number($("#i_amount").value||0);
    data.source = $("#i_source").value.trim();
    if(!data.date) return alert("Selecciona una fecha.");
    if(isEdit){
      const i = F().incomes.findIndex(x=>x.id===data.id);
      F().incomes[i]=data;
    }else{
      F().incomes.push(data);
    }
    save(); $("#modal").close(); renderFinanceAll(true);
  });
  $("#modal").showModal();
}

/* ---- gastos ---- */
function renderExpenses(){
  const body = $("#expenseBody"); body.innerHTML = "";
  const catFilter = $("#categoryFilter").value || "all";
  const items = F().expenses
    .filter(e=>inRange(e.date))
    .filter(e=> catFilter==="all" ? true : e.category===catFilter)
    .sort((a,b)=> new Date(a.date)-new Date(b.date));

  let budgetSum = 0, actualSum = 0;
  items.forEach(it=>{
    budgetSum += Number(it.budget||0);
    actualSum += Number(it.actual||0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.date||""}</td>
      <td><span class="badge">${escapeHtml(it.category)}</span></td>
      <td>${escapeHtml(it.desc||"")}</td>
      <td>${fmtMoney(it.budget)}</td>
      <td>${fmtMoney(it.actual)}</td>
      <td><span class="action-link" data-edit="${it.id}">Editar</span> · <span class="action-link" data-del="${it.id}">Eliminar</span></td>
    `;
    body.appendChild(tr);
    tr.querySelector(`[data-edit="${it.id}"]`).addEventListener("click", ()=> openExpenseModal(it));
    tr.querySelector(`[data-del="${it.id}"]`).addEventListener("click", ()=>{
      if(confirm("¿Eliminar gasto?")){
        F().expenses = F().expenses.filter(x=>x.id!==it.id);
        save(); renderFinanceAll(true);
      }
    });
  });

  $("#budgetTotal").textContent = fmtMoney(budgetSum);
  $("#actualTotal").textContent = fmtMoney(actualSum);
}
function openExpenseModal(item=null){
  const data = item || { id: uid(), date:"", category:F().categories[0]||"Expenses", desc:"", budget:0, actual:0 };
  const isEdit = !!item;
  const options = F().categories.map(c=>`<option ${c===data.category?"selected":""}>${c}</option>`).join("");
  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar gasto":"Nuevo gasto"}</h3>
      <div class="grid-2">
        <div><label>Fecha</label><input id="e_date" type="date" class="input" value="${data.date}"/></div>
        <div><label>Categoría</label><select id="e_cat" class="input">${options}</select></div>
      </div>
      <div><label>Descripción</label><input id="e_desc" class="input" value="${escapeHtml(data.desc)}" placeholder="Ej: Libros, Comida, Internet"/></div>
      <div class="grid-2">
        <div><label>Presupuesto</label><input id="e_budget" type="number" step="0.01" class="input" value="${data.budget}"/></div>
        <div><label>Real</label><input id="e_actual" type="number" step="0.01" class="input" value="${data.actual}"/></div>
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
    data.budget = Number($("#e_budget").value||0);
    data.actual = Number($("#e_actual").value||0);
    if(!data.date) return alert("Selecciona una fecha.");
    if(isEdit){
      const i = F().expenses.findIndex(x=>x.id===data.id);
      F().expenses[i]=data;
    }else{
      F().expenses.push(data);
    }
    save(); $("#modal").close(); renderFinanceAll(true);
  });
  $("#modal").showModal();
}

/* ---- categorías ---- */
function openCategoryManager(){
  const listHtml = F().categories.map((c,i)=>`
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
    F().categories.push(v);
    save(); $("#modal").close(); openCategoryManager();
  });

  $$("#catList [data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const idx = Number(btn.getAttribute("data-del"));
      const cat = F().categories[idx];
      F().expenses.forEach(e=>{ if(e.category===cat) e.category="Expenses"; });
      F().categories.splice(idx,1);
      save(); $("#modal").close(); openCategoryManager();
    });
  });

  $("#saveCats").addEventListener("click", ()=>{
    $$(".cat-input").forEach(inp=>{
      const i = Number(inp.getAttribute("data-i"));
      const old = F().categories[i];
      const val = inp.value.trim() || old;
      F().expenses.forEach(e=>{ if(e.category===old) e.category = val; });
      F().categories[i] = val;
    });
    save(); $("#modal").close(); renderCategoryFilter(); renderFinanceAll(true);
  });

  $("#modal").showModal();
}

/* ---- resumen finanzas ---- */
function sumByCategory(kind="budget"){
  const map = {};
  F().categories.forEach(c=>map[c]=0);
  F().expenses.filter(inRange).forEach(e=>{
    map[e.category] = (map[e.category]||0) + Number(e[kind]||0);
  });
  return map;
}
function renderCashflow(){
  const body = $("#cashflowBody"); body.innerHTML = "";

  const income = F().incomes.filter(inRange).reduce((s,i)=> s + Number(i.amount||0), 0);
  const budgetByCat = sumByCategory("budget");
  const actualByCat = sumByCategory("actual");

  const mkRow = (label, b, a) => `<tr><td>${label}</td><td>${fmtMoney(b)}</td><td>${fmtMoney(a)}</td></tr>`;

  let budgetIncome = F().rollover + income;
  let actualIncome = F().rollover + income;
  let budgetExpenses = 0, actualExpenses = 0;

  const blocks = ["Bills","Expenses","Debt","Subscriptions","Savings & Investments"];
  const extraCats = F().categories.filter(c=>!blocks.includes(c));

  body.insertAdjacentHTML("beforeend", mkRow("+ Rollover", F().rollover, F().rollover));
  body.insertAdjacentHTML("beforeend", mkRow("Ingresos", income, income));
  blocks.forEach(cat=>{
    body.insertAdjacentHTML("beforeend", mkRow(cat, budgetByCat[cat]||0, actualByCat[cat]||0));
    budgetExpenses += budgetByCat[cat]||0; actualExpenses += actualByCat[cat]||0;
  });
  extraCats.forEach(cat=>{
    body.insertAdjacentHTML("beforeend", mkRow(cat, budgetByCat[cat]||0, actualByCat[cat]||0));
    budgetExpenses += budgetByCat[cat]||0; actualExpenses += actualByCat[cat]||0;
  });

  $("#leftBudget").textContent = fmtMoney(budgetIncome - budgetExpenses);
  $("#leftActual").textContent  = fmtMoney(actualIncome - actualExpenses);
}

/* ---- gráficos ---- */
function renderCharts(){
  const budgetByCat = sumByCategory("budget");
  const actualByCat = sumByCategory("actual");
  const labels = F().categories;

  const pieData = labels.map(l => actualByCat[l]||0);
  const barBudget = labels.map(l => budgetByCat[l]||0);
  const barActual = labels.map(l => actualByCat[l]||0);

  // Pie
  const pieCtx = $("#pieSpending");
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type:"pie",
    data:{ labels, datasets:[{ data: pieData }] },
    options:{ plugins:{ legend:{ position:"bottom" } } }
  });

  // Barras
  const barCtx = $("#barBudgetActual");
  if(barChart) barChart.destroy();
  barChart = new Chart(barCtx, {
    type:"bar",
    data:{ labels, datasets:[{label:"Presupuesto", data:barBudget},{label:"Real", data:barActual}] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ position:"bottom" } } }
  });
}

/* =================== IMPORT/EXPORT GLOBAL =================== */
function exportAll(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "planificador_universidad_finanzas.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function importAll(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!data || !("planner" in data && "finance" in data)) throw new Error("Formato inválido.");
      state = {...state, ...data};
      save(); location.reload();
    }catch(err){ alert("No se pudo importar: " + err.message); }
  };
  reader.readAsText(file);
}
