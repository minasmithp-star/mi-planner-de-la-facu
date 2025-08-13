/* ========== Utilidades y estado ========== */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,10);

// HOY (año 2 dígitos)
const fmtToday2Y = iso => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es", {weekday:"long", day:"2-digit", month:"long", year:"2-digit"});
};
// Fecha corta DD/MM/YY
const fmtShort2Y = iso => {
  if(!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es",{day:"2-digit",month:"2-digit",year:"2-digit"});
};
const daysLeft = iso => {
  if(!iso) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d - today) / 86400000);
};

const STORAGE_KEY = "assignment_tracker_v1";
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const load = () => { try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch{ return null; } };

const DEFAULT_COURSES = ["Historia 101","Álgebra","Química","Inglés"];
const DEFAULT_TYPES    = ["Ensayo","Tarea","Presentación","Proyecto","Examen","Laboratorio"];
const DEFAULT_STATUS   = ["No iniciado","En progreso","Entregado","Calificado","Completado"];
const DEFAULT_PRIOS    = ["Alta","Media","Baja"];

let state = load() || { courses:[...DEFAULT_COURSES], assignments:[] };

/* ========== Inicio ========== */
document.addEventListener("DOMContentLoaded", ()=>{
  const todayISO = new Date().toISOString().slice(0,10);
  $("#todayStr").textContent = fmtToday2Y(todayISO);
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
  renderFocusPanel();
}

function renderFilters(){
  const sel = $("#filterCourse");
  sel.innerHTML = `<option value="all">Todos los cursos</option>` +
    state.courses.map(c=>`<option value="${c}">${c}</option>`).join("");
  sel.addEventListener("change", renderTable);
}

/* ========== Tabla principal ========== */
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
    if(a.priority==="Alta") tr.classList.add("row-high");
    else if(a.priority==="Media") tr.classList.add("row-med");
    else tr.classList.add("row-low");

    const dleft = daysLeft(a.due);
    const subTxt = subProgressText(a);
    tr.innerHTML = `
      <td><input type="checkbox" ${a.status==="Completado"?"checked":""} data-done="${a.id}" title="Marcar completado" /></td>
      <td>${esc(a.title)}</td>
      <td>${esc(a.course||"—")}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${fmtShort2Y(a.due)}</td>
      <td>${daysThermo(dleft)}</td>
      <td>${prioBadge(a.priority)}</td>
      <td>${esc(a.type||"—")}</td>
      <td>${esc(a.est||"—")}</td>
      <td>${esc(a.notes||"")}${subTxt}</td>
      <td>${esc(a.grade||"")}</td>
      <td class="actions-row">
        <span class="link" data-ics="${a.id}">Calendario</span> ·
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
    tr.querySelector(`[data-ics="${a.id}"]`).addEventListener("click", ()=> downloadICS(a));
  });

  if(!items.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12" style="color:#777">No hay tareas con esos filtros.</td>`;
    tbody.appendChild(tr);
  }
}

function statusBadge(st){
  const map = {"No iniciado":"not","En progreso":"prog","Entregado":"sub","Calificado":"grad","Completado":"done"};
  const key = map[st] || "not";
  return `<span class="badge status ${key}">${st||"No iniciado"}</span>`;
}
function prioBadge(p){
  const key = p==="Alta" ? "high" : p==="Media" ? "med" : "low";
  return `<span class="badge priority ${key}">${p||"—"}</span>`;
}

function subProgressText(a){
  const subs = a.subs||[];
  if(!subs.length) return "";
  const done = subs.filter(x=>x.done).length;
  return ` <span class="badge" title="Subtareas">✓${done}/${subs.length}</span>`;
}

/* Termómetro de días */
function daysThermo(n){
  if(n===null) return "—";
  const horizon = 21;
  const urg = Math.max(0, Math.min(1, 1 - (n / horizon)));
  const width = Math.round((n < 0 ? 1 : urg) * 100);
  const light = 90 - urg * 28;   // más oscuro si urgente
  const color = `hsl(350,75%,${light}%)`;
  const title = n<0 ? `${n} (atrasado)` : `${n} días`;
  return `
    <div class="thermo" title="${title}">
      <div class="thermo-bar" style="width:${width}%; background:${color}"></div>
      <span class="thermo-label">${n}</span>
    </div>
  `;
}

function esc(s){ return (s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])); }

/* ========== Panel En Foco ========== */
function renderFocusPanel(){
  const overdue = [];
  const today = [];
  const soon = [];
  const now = new Date(); now.setHours(0,0,0,0);

  state.assignments.forEach(a=>{
    if(a.status==="Completado") return;
    const d = a.due ? new Date(a.due+"T00:00:00") : null;
    if(!d) return;
    const diff = Math.round((d - now)/86400000);
    if(diff < 0) overdue.push(a);
    else if(diff === 0) today.push(a);
    else if(diff > 0 && diff <= 7) soon.push(a);
  });

  const fill = (elId, arr) => {
    const ul = $(elId); ul.innerHTML = "";
    if(arr.length === 0){ ul.innerHTML = `<li class="focus-item"><span class="focus-main">Sin tareas</span></li>`; return; }
    arr.sort((a,b)=> new Date(a.due)-new Date(b.due)).slice(0,10).forEach(a=>{
      const li = document.createElement("li");
      li.className = "focus-item";
      li.innerHTML = `
        <div class="focus-main">
          <span class="focus-title">${esc(a.title)}</span>
          <span class="focus-chip">${esc(a.course||"General")}</span>
          <span class="focus-chip">vence: ${fmtShort2Y(a.due)}</span>
        </div>
        <div class="focus-actions">
          <button class="mini-btn" data-done="${a.id}">✔</button>
          <button class="mini-btn" data-plus1="${a.id}">+1d</button>
          <button class="mini-btn" data-edit="${a.id}">✎</button>
          <button class="mini-btn" data-ics="${a.id}">📅</button>
        </div>
      `;
      ul.appendChild(li);
      li.querySelector(`[data-done="${a.id}"]`).addEventListener("click", ()=>{ a.status="Completado"; save(); renderAll(); });
      li.querySelector(`[data-plus1="${a.id}"]`).addEventListener("click", ()=>{ postponeDays(a,1); });
      li.querySelector(`[data-edit="${a.id}"]`).addEventListener("click", ()=> openAssignModal(a));
      li.querySelector(`[data-ics="${a.id}"]`).addEventListener("click", ()=> downloadICS(a));
    });
  };

  fill("#listOverdue", overdue);
  fill("#listToday", today);
  fill("#listWeek", soon);
}

function postponeDays(a, days=1){
  if(!a.due) return;
  const d = new Date(a.due+"T00:00:00");
  d.setDate(d.getDate()+days);
  a.due = d.toISOString().slice(0,10);
  save(); renderAll();
}

/* ========== Formularios (con Subtareas) ========== */
function openAssignModal(item=null){
  const isEdit = !!item;
  const data = item || {
    id: uid(), title:"", course: state.courses[0]||"", status:"No iniciado", due:"",
    priority:"Media", type: DEFAULT_TYPES[0], est:"", notes:"", grade:"", subs:[]
  };
  if(!data.subs) data.subs = [];

  const courseOpts = state.courses.map(c=>`<option ${c===data.course?"selected":""}>${c}</option>`).join("");
  const statusOpts = DEFAULT_STATUS.map(s=>`<option ${s===data.status?"selected":""}>${s}</option>`).join("");
  const prioOpts   = DEFAULT_PRIOS.map(s=>`<option ${s===data.priority?"selected":""}>${s}</option>`).join("");
  const typeOpts   = DEFAULT_TYPES.map(s=>`<option ${s===data.type?"selected":""}>${s}</option>`).join("");

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar tarea":"Nueva tarea"}</h3>
      <div><label>Título</label><input id="a_title" class="input" value="${esc(data.title)}" placeholder="Ej: Ensayo de 5 páginas" /></div>
      <div class="grid-3">
        <div><label>Curso</label><select id="a_course" class="input">${courseOpts}</select></div>
        <div><label>Estado</label><select id="a_status" class="input">${statusOpts}</select></div>
        <div><label>Fecha límite</label><input id="a_due" type="date" class="input" value="${data.due||""}" /></div>
      </div>
      <div class="grid-3">
        <div><label>Prioridad</label><select id="a_prio" class="input">${prioOpts}</select></div>
        <div><label>Tipo</label><select id="a_type" class="input">${typeOpts}</select></div>
        <div><label>Tiempo estimado</label><input id="a_est" class="input" value="${esc(data.est||"")}" placeholder="Ej: 3h, 45m" /></div>
      </div>
      <div><label>Notas</label><input id="a_notes" class="input" value="${esc(data.notes||"")}" /></div>
      <div><label>Calificación (1–10)</label><input id="a_grade" class="input" value="${esc(data.grade||"")}" placeholder="Ej: 8.5" /></div>

      <div>
        <label>Subtareas</label>
        <div id="subList" class="sublist"></div>
        <div class="subrow">
          <input id="subText" type="text" placeholder="Nueva subtarea…" />
          <button id="subAdd" class="mini-btn" type="button">Añadir</button>
          <span></span>
        </div>
      </div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="a_save" class="btn">${isEdit?"Guardar":"Crear"}</button>
    </div>
  `;

  const renderSubs = ()=>{
    const cont = $("#subList"); cont.innerHTML = "";
    data.subs.forEach(s=>{
      const row = document.createElement("div");
      row.className = "subrow";
      row.innerHTML = `
        <input type="checkbox" ${s.done?"checked":""} data-toggle="${s.id}">
        <input type="text" value="${esc(s.text)}" data-text="${s.id}">
        <button class="mini-btn" data-del="${s.id}" type="button">Eliminar</button>
      `;
      cont.appendChild(row);
      row.querySelector(`[data-toggle="${s.id}"]`).addEventListener("change",(e)=>{ s.done = e.target.checked; save(); });
      row.querySelector(`[data-text="${s.id}"]`).addEventListener("input",(e)=>{ s.text = e.target.value; });
      row.querySelector(`[data-del="${s.id}"]`).addEventListener("click",()=>{ data.subs = data.subs.filter(x=>x.id!==s.id); renderSubs(); });
    });
  };
  renderSubs();

  $("#subAdd").addEventListener("click", ()=>{
    const v = $("#subText").value.trim(); if(!v) return;
    data.subs.push({id:uid(), text:v, done:false});
    $("#subText").value = ""; renderSubs();
  });

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
      <input class="input course-input" data-i="${i}" value="${esc(c)}" />
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

/* ========== Métricas y gráficas ========== */
function renderMetrics(){
  $("#totalCount").textContent = state.assignments.length;
  $("#doneCount").textContent  = state.assignments.filter(a=>a.status==="Completado").length;
}

let pieChart, barChart;
const pinks10 = (()=>{ const arr=[]; for(let i=1;i<=10;i++){ const t=(i-1)/9; const L=92 - t*40; arr.push(`hsl(340,85%,${L}%)`);} return arr; })();
const statusPinks = {
  "No iniciado": "hsl(340,85%,90%)",
  "En progreso": "hsl(340,80%,83%)",
  "Entregado":   "hsl(340,75%,76%)",
  "Calificado":  "hsl(340,70%,69%)",
  "Completado":  "hsl(340,65%,62%)"
};

function renderCharts(){
  // Pie estados
  const statuses = ["No iniciado","En progreso","Entregado","Calificado","Completado"];
  const counts = statuses.map(s => state.assignments.filter(a=>a.status===s).length);
  if(pieChart) pieChart.destroy();
  pieChart = new Chart($("#pieStatus"), {
    type:"pie",
    data:{ labels:statuses, datasets:[{ data:counts, backgroundColor:statuses.map(s=>statusPinks[s]) }] },
    options:{ plugins:{ legend:{ position:"bottom" } }, maintainAspectRatio:false }
  });

  // Barras 1..10
  const bins = Array.from({length:10},(_,i)=>i+1);
  const binCounts = new Array(10).fill(0);
  state.assignments.forEach(a=>{
    const raw = (a.grade||"").toString().replace(",",".").trim();
    const val = parseFloat(raw);
    if(!isNaN(val)){
      const r = Math.round(val);
      if(r>=1 && r<=10) binCounts[r-1] += 1;
    }
  });
  if(barChart) barChart.destroy();
  barChart = new Chart($("#barGrades"), {
    type:"bar",
    data:{ labels: bins.map(String), datasets:[{ label:"Cantidad", data:binCounts, backgroundColor:pinks10, borderColor:pinks10, borderWidth:1, borderRadius:6 }] },
    options:{ maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, precision:0 } }, plugins:{ legend:{ display:false } } }
  });
}

/* ========== .ICS (calendario) ========== */
function downloadICS(a){
  if(!a.due){ alert("Esta tarea no tiene fecha límite."); return; }
  const ymd = a.due.replaceAll("-","");
  const uidStr = `${a.id}@assignment-tracker`;
  const title = `Entrega: ${a.title}`;
  // Evento de día completo con DTEND día siguiente
  const dtEnd = (()=>{ const d = new Date(a.due+"T00:00:00"); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10).replaceAll("-",""); })();
  const desc = `Curso: ${a.course||"—"}\\nEstado: ${a.status}\\nPrioridad: ${a.priority}\\nNotas: ${(a.notes||"").replace(/\n/g," ")}`;
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Assignment Tracker//ES",
    "BEGIN:VEVENT",
    `UID:${uidStr}`,
    `SUMMARY:${escapeICS(title)}`,
    `DTSTART;VALUE=DATE:${ymd}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `DESCRIPTION:${escapeICS(desc)}`,
    `CATEGORIES:${escapeICS(a.course||"Tarea")}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics],{type:"text/calendar"});
  const url = URL.createObjectURL(blob);
  const aTag = document.createElement("a");
  aTag.href = url; aTag.download = `tarea_${a.title.replace(/\s+/g,"_")}.ics`;
  document.body.appendChild(aTag); aTag.click(); aTag.remove(); URL.revokeObjectURL(url);
}
function escapeICS(s){ return (s||"").replace(/([,;])/g,"\\$1"); }

/* ========== Importar / Exportar ========== */
function exportJSON(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "assignment_tracker.json";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importJSON(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!data || !("assignments" in data && "courses" in data)) throw new Error("Formato inválido.");
      // Asegurar que cada tarea tenga arreglo de subtareas
      (data.assignments||[]).forEach(t=>{ if(!t.subs) t.subs=[]; });
      state = {...state, ...data}; save(); location.reload();
    }catch(err){ alert("No se pudo importar: " + err.message); }
  };
  reader.readAsText(file);
}
