// ===== Utilidades y estado =====
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,10);
const fmtDate = iso => iso ? new Date(iso+"T00:00:00").toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"}) : "—";
const daysLeft = iso => {
  if(!iso) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso+"T00:00:00");
  return Math.round((d - today) / 86400000);
};
const STORAGE_KEY = "assignment_tracker_v1";
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const load = () => { try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch{ return null; } };

const DEFAULT_COURSES = ["Historia 101","Álgebra","Química","Inglés"];
const DEFAULT_TYPES   = ["Ensayo","Tarea","Presentación","Proyecto","Examen","Laboratorio"];
const DEFAULT_STATUSES= ["No iniciado","En progreso","Entregado","Calificado","Completado"];
const DEFAULT_PRIOS   = ["Alta","Media","Baja"];

let state = load() || {
  courses: [...DEFAULT_COURSES],
  assignments: [
    // Ejemplo:
    // { id:uid(), title:"Informe de laboratorio", course:"Química", status:"En progreso",
    //   due:"2025-09-05", priority:"Alta", type:"Laboratorio", est:"3h", notes:"", grade:"" , done:false }
  ]
};

// ===== Inicio =====
document.addEventListener("DOMContentLoaded", ()=>{
  $("#todayStr").textContent = fmtDate(new Date().toISOString().slice(0,10));
  bindGlobal();
  renderAll();
});

function bindGlobal(){
  $("#addAssignBtn").addEventListener("click", ()=> openAssignModal());
  $("#manageCoursesBtn").addEventListener("click", openCourseManager);
  $("#exportBtn").addEventListener("click", exportJSON);
  $("#importInput").addEventListener("change", importJSON);
  $("#resetBtn").addEventListener("click", ()=>{
    if(confirm("Esto borrará todos tus datos locales. ¿Continuar?")){
      localStorage.removeItem(STORAGE_KEY); location.reload();
    }
  });

  $("#searchInput").addEventListener("input", renderTable);
  $("#filterStatus").addEventListener("change", renderTable);
  $("#filterPriority").addEventListener("change", renderTable);
}

function renderAll(){
  renderFilters();
  renderTable();
  renderMetrics();
  renderCharts();
}

function renderFilters(){
  // cursos
  const sel = $("#filterCourse");
  sel.innerHTML = `<option value="all">Todos los cursos</option>` +
    state.courses.map(c=>`<option value="${c}">${c}</option>`).join("");
  sel.addEventListener("change", renderTable);
}

// ===== Tabla =====
function renderTable(){
  const tbody = $("#tbody"); tbody.innerHTML = "";
  const q = ($("#searchInput").value||"").toLowerCase();
  const c = $("#filterCourse").value || "all";
  const s = $("#filterStatus").value || "all";
  const p = $("#filterPriority").value || "all";

  const items = state.assignments
    .filter(a => c==="all" ? true : a.course===c)
    .filter(a => s==="all" ? true : a.status===s)
    .filter(a => p==="all" ? true : a.priority===p)
    .filter(a => (a.title||"").toLowerCase().includes(q) || (a.notes||"").toLowerCase().includes(q))
    .sort((a,b)=>{
      const da = a.due ? new Date(a.due) : new Date("2999-01-01");
      const db = b.due ? new Date(b.due) : new Date("2999-01-01");
      return da - db;
    });

  items.forEach(a=>{
    const tr = document.createElement("tr");
    const dleft = daysLeft(a.due);
    tr.innerHTML = `
      <td><input type="checkbox" ${a.status==="Completado"?"checked":""} data-done="${a.id}" title="Marcar completado" /></td>
      <td>${escape(a.title)}</td>
      <td>${escape(a.course||"—")}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${a.due||"—"}</td>
      <td>${daysPill(dleft)}</td>
      <td>${prioBadge(a.priority)}</td>
      <td>${escape(a.type||"—")}</td>
      <td>${escape(a.est||"—")}</td>
      <td>${escape(a.notes||"")}</td>
      <td>${escape(a.grade||"")}</td>
      <td class="actions-row">
        <span class="link" data-edit="${a.id}">Editar</span> ·
        <span class="link" data-del="${a.id}">Eliminar</span>
      </td>
    `;
    tbody.appendChild(tr);

    tr.querySelector(`[data-done="${a.id}"]`).addEventListener("change",(e)=>{
      a.status = e.target.checked ? "Completado" : "No iniciado";
      save(); renderAll();
    });
    tr.querySelector(`[data-edit="${a.id}"]`).addEventListener("click", ()=> openAssignModal(a));
    tr.querySelector(`[data-del="${a.id}"]`).addEventListener("click", ()=>{
      if(confirm("¿Eliminar tarea?")){
        state.assignments = state.assignments.filter(x=>x.id!==a.id);
        save(); renderAll();
      }
    });
  });

  if(!items.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12" style="color:#777">No hay tareas con esos filtros.</td>`;
    tbody.appendChild(tr);
  }
}

function statusBadge(st){
  const map = {
    "No iniciado":"not","En progreso":"prog","Entregado":"sub","Calificado":"grad","Completado":"done"
  };
  const key = map[st] || "not";
  return `<span class="badge status ${key}">${st||"No iniciado"}</span>`;
}
function prioBadge(p){
  const key = p==="Alta" ? "high" : p==="Media" ? "med" : "low";
  return `<span class="badge priority ${key}">${p||"—"}</span>`;
}
function daysPill(n){
  if(n===null) return "—";
  if(n<0) return `<span class="days bad">${n}</span>`;
  if(n<=2) return `<span class="days warn">${n}</span>`;
  return `<span class="days ok">${n}</span>`;
}
function escape(s){ return (s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])); }

// ===== Formularios =====
function openAssignModal(item=null){
  const isEdit = !!item;
  const data = item || {
    id: uid(), title:"", course: state.courses[0]||"", status:"No iniciado", due:"",
    priority:"Media", type: DEFAULT_TYPES[0], est:"", notes:"", grade:""
  };

  const courseOpts = state.courses.map(c=>`<option ${c===data.course?"selected":""}>${c}</option>`).join("");
  const statusOpts = DEFAULT_STATUSES.map(s=>`<option ${s===data.status?"selected":""}>${s}</option>`).join("");
  const prioOpts   = DEFAULT_PRIOS.map(s=>`<option ${s===data.priority?"selected":""}>${s}</option>`).join("");
  const typeOpts   = DEFAULT_TYPES.map(s=>`<option ${s===data.type?"selected":""}>${s}</option>`).join("");

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar tarea":"Nueva tarea"}</h3>
      <div><label>Título</label><input id="a_title" class="input" value="${escape(data.title)}" placeholder="Ej: Ensayo de 5 páginas" /></div>
      <div class="grid-3">
        <div><label>Curso</label><select id="a_course" class="input">${courseOpts}</select></div>
        <div><label>Estado</label><select id="a_status" class="input">${statusOpts}</select></div>
        <div><label>Fecha límite</label><input id="a_due" type="date" class="input" value="${data.due||""}" /></div>
      </div>
      <div class="grid-3">
        <div><label>Prioridad</label><select id="a_prio" class="input">${prioOpts}</select></div>
        <div><label>Tipo</label><select id="a_type" class="input">${typeOpts}</select></div>
        <div><label>Tiempo estimado</label><input id="a_est" class="input" value="${escape(data.est||"")}" placeholder="Ej: 3h, 45m" /></div>
      </div>
      <div><label>Notas</label><input id="a_notes" class="input" value="${escape(data.notes||"")}" /></div>
      <div><label>Calificación (A–F o número)</label><input id="a_grade" class="input" value="${escape(data.grade||"")}" /></div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="a_save" class="btn">${isEdit?"Guardar":"Crear"}</button>
    </div>
  `;

  $("#a_save").addEventListener("click",(e)=>{
    e.preventDefault();
    data.title = $("#a_title").value.trim();
    data.course= $("#a_course").value;
    data.status= $("#a_status").value;
    data.due   = $("#a_due").value || "";
    data.priority = $("#a_prio").value;
    data.type  = $("#a_type").value;
    data.est   = $("#a_est").value.trim();
    data.notes = $("#a_notes").value.trim();
    data.grade = $("#a_grade").value.trim();

    if(!data.title) return alert("Escribe un título.");
    if(isEdit){
      const i = state.assignments.findIndex(x=>x.id===data.id);
      state.assignments[i] = data;
    }else{
      state.assignments.push(data);
    }
    save(); $("#modal").close(); renderAll();
  });

  $("#modal").showModal();
}

function openCourseManager(){
  const listHtml = state.courses.map((c,i)=>`
    <div class="grid-3" style="grid-template-columns:1fr auto auto;align-items:center">
      <input class="input course-input" data-i="${i}" value="${escape(c)}" />
      <button class="btn btn-ghost" data-up="${i}">↑</button>
      <button class="btn btn-ghost" data-del="${i}" style="color:#c026d3">Eliminar</button>
    </div>
  `).join("");

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>Cursos</h3>
      <div id="courseList">${listHtml||'<small>No hay cursos</small>'}</div>
      <div class="grid-3" style="grid-template-columns:1fr auto auto;align-items:center">
        <input id="newCourse" class="input" placeholder="Nuevo curso" />
        <button id="addCourse" class="btn">Añadir</button>
        <button value="cancel" class="btn btn-ghost" onclick="document.getElementById('modal').close()">Cerrar</button>
      </div>
    </div>
    <div class="actions">
      <button id="saveCourses" class="btn">Guardar cambios</button>
    </div>
  `;

  $("#addCourse").addEventListener("click", ()=>{
    const v = $("#newCourse").value.trim(); if(!v) return;
    state.courses.push(v); save(); $("#modal").close(); openCourseManager();
  });

  $$("#courseList [data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const idx = Number(btn.dataset.del);
      const name = state.courses[idx];
      // Reasignar tareas con ese curso a vacío
      state.assignments.forEach(a=>{ if(a.course===name) a.course=""; });
      state.courses.splice(idx,1); save(); $("#modal").close(); openCourseManager();
    });
  });

  $$("#courseList [data-up]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.up);
      if(i>0){ [state.courses[i-1], state.courses[i]] = [state.courses[i], state.courses[i-1]]; save(); $("#modal").close(); openCourseManager(); }
    });
  });

  $("#saveCourses").addEventListener("click", ()=>{
    $$(".course-input").forEach(inp=>{
      const i = Number(inp.dataset.i);
      const old = state.courses[i];
      const val = inp.value.trim() || old;
      state.assignments.forEach(a=>{ if(a.course===old) a.course = val; });
      state.courses[i] = val;
    });
    save(); $("#modal").close(); renderAll();
  });

  $("#modal").showModal();
}

// ===== Métricas y gráficos =====
function renderMetrics(){
  const total = state.assignments.length;
  const done  = state.assignments.filter(a=>a.status==="Completado").length;
  $("#totalCount").textContent = total;
  $("#doneCount").textContent  = done;
}

let pieChart, barChart;
function renderCharts(){
  // Pie: Completadas vs No iniciadas
  const done = state.assignments.filter(a=>a.status==="Completado").length;
  const notStarted = state.assignments.filter(a=>a.status==="No iniciado").length;

  if(pieChart) pieChart.destroy();
  pieChart = new Chart($("#pieDone"), {
    type:"pie",
    data:{ labels:["Completadas","No iniciadas"], datasets:[{ data:[done, notStarted] }]},
    options:{ plugins:{ legend:{ position:"bottom" } } }
  });

  // Barras: distribución A–F de campo grade (se toma primera letra)
  const letters = ["A","B","C","D","F"];
  const counts = letters.map(L => state.assignments.filter(a=>(a.grade||"").trim().toUpperCase().startsWith(L)).length);
  if(barChart) barChart.destroy();
  barChart = new Chart($("#barGrades"), {
    type:"bar",
    data:{ labels:letters, datasets:[{ label:"Cantidad", data:counts }]},
    options:{ scales:{ y:{ beginAtZero:true, precision:0 } }, plugins:{ legend:{ display:false } } }
  });
}

// ===== Importar / Exportar =====
function exportJSON(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "assignment_tracker.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function importJSON(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!data || !("assignments" in data && "courses" in data)) throw new Error("Formato inválido.");
      state = {...state, ...data}; save(); location.reload();
    }catch(err){ alert("No se pudo importar: " + err.message); }
  };
  reader.readAsText(file);
}
