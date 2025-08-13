// -------------------- Persistencia --------------------
const STORAGE_KEY = "uni_planner_v1";
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const state = loadState() || {
  subjects: [
    // Ejemplo para que veas el formato:
    // { id: uid(), name:"Química General", color:"#8bc2ff", slots:[{day:1,start:"10:00",end:"11:30",room:"A-12"}] }
  ],
  tasks: [
    // { id: uid(), title:"TP1", subjectId:null, due:"2025-08-20", priority:"alta", tag:"lab", done:false }
  ],
  grades: {
    // subjectId: [ { id, name:"Controles", weight:30, score:85 } ]
  }
};

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch{ return null; } }
function uid(){ return Math.random().toString(36).slice(2,10); }
function toPct(n){ return `${(Math.round(n*100)/100).toFixed(0)}%`; }
function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }

// -------------------- Inicialización --------------------
document.addEventListener("DOMContentLoaded", () => {
  bindGlobalActions();
  renderAll();
});

// -------------------- Render raíz --------------------
function renderAll(){
  renderSubjects();
  renderTimetable();
  renderTaskFilters();
  renderTasks();
  renderGradeModule();
  renderSummary();
}

// -------------------- Resumen --------------------
function renderSummary(){
  // Asignaturas
  $("#statSubjects").textContent = state.subjects.length;

  // Tareas pendientes
  const pending = state.tasks.filter(t=>!t.done).length;
  $("#statTodos").textContent = pending;

  // Progreso promedio (promedio de notas actuales por asignatura)
  const perSubj = state.subjects.map(s => {
    const {current} = computeGradeForSubject(s.id);
    return isNaN(current) ? 0 : current;
  });
  const avg = perSubj.length ? Math.round(perSubj.reduce((a,b)=>a+b,0)/perSubj.length) : 0;
  $("#statAvgProgress").textContent = `${avg}%`;

  // Próxima entrega
  const upcoming = state.tasks
    .filter(t => !t.done && t.due)
    .sort((a,b)=> new Date(a.due) - new Date(b.due))[0];
  $("#statNextDue").textContent = upcoming ? formatDate(upcoming.due) : "—";
}

function formatDate(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
}

// -------------------- Subjects --------------------
function renderSubjects(){
  const list = $("#subjectList");
  const q = ($("#subjectSearch").value || "").toLowerCase();
  list.innerHTML = "";

  state.subjects
    .filter(s => s.name.toLowerCase().includes(q))
    .forEach(subj => {
      const el = document.createElement("div");
      el.className = "subject-item";
      el.innerHTML = `
        <div>
          <div class="title" style="display:flex;align-items:center;gap:8px">
            <span class="chip" style="background:${lighten(subj.color,0.6)};border-color:${lighten(subj.color,0.3)}">${subj.name}</span>
          </div>
          <div class="meta">
            ${subj.slots?.length ? subj.slots.map(s=>`<span class="badge">${weekday(s.day)} ${s.start}-${s.end}${s.room?` · ${s.room}`:""}</span>`).join("") : '<span class="badge">Sin horarios</span>'}
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
        if(confirm(`¿Eliminar "${subj.name}"?`)){
          // limpiar tareas/grades asociadas
          state.tasks = state.tasks.filter(t=>t.subjectId !== subj.id);
          delete state.grades[subj.id];
          state.subjects = state.subjects.filter(s=>s.id!==subj.id);
          saveState(); renderAll();
        }
      });
    });

  // placeholder vacío
  if(!list.children.length){
    list.innerHTML = `<div class="subject-item"><div class="meta">Aún no tienes asignaturas. Añade la primera 👇</div><div class="subject-actions"><button class="btn" id="firstAddSubject">Añadir</button></div></div>`;
    $("#firstAddSubject")?.addEventListener("click", ()=>openSubjectModal());
  }
}

function openSubjectModal(subj=null){
  const modal = $("#modal");
  const isEdit = !!subj;
  const data = subj || { id: uid(), name:"", color:"#8bc2ff", slots:[] };

  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit ? "Editar asignatura" : "Nueva asignatura"}</h3>
      <div class="row">
        <label>Nombre</label>
        <input id="m_name" class="input" value="${escapeHtml(data.name)}" placeholder="Ej: Química Orgánica" required />
      </div>
      <div class="grid-2">
        <div class="row">
          <label>Color</label>
          <input id="m_color" type="color" class="input" value="${data.color}" />
        </div>
        <div class="row">
          <label>Agregar horario</label>
          <div class="cat-controls">
            <select id="m_day" class="input">
              <option value="1">Lunes</option><option value="2">Martes</option><option value="3">Miércoles</option>
              <option value="4">Jueves</option><option value="5">Viernes</option><option value="6">Sábado</option>
            </select>
            <input id="m_start" type="time" class="input" />
            <input id="m_end" type="time" class="input" />
            <input id="m_room" class="input" placeholder="Sala (opcional)" />
            <button id="m_addSlot" class="btn">Añadir</button>
          </div>
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
        <div class="meta">
          <span class="badge">${weekday(s.day)} ${s.start}-${s.end}${s.room?` · ${escapeHtml(s.room)}`:""}</span>
        </div>
        <div class="subject-actions">
          <button class="btn btn-ghost" data-rm="${i}" style="color:#b42318">Quitar</button>
        </div>
      </div>
    `).join("");
    $$("#m_slots [data-rm]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const idx = +btn.getAttribute("data-rm");
        data.slots.splice(idx,1);
        renderSlots();
      });
    });
  };
  renderSlots();

  $("#m_addSlot").addEventListener("click", (e)=>{
    e.preventDefault();
    const day = +$("#m_day").value;
    const start = $("#m_start").value;
    const end = $("#m_end").value;
    if(!start || !end) return alert("Completa inicio y fin.");
    data.slots.push({day,start,end,room:$("#m_room").value.trim()});
    $("#m_start").value=""; $("#m_end").value=""; $("#m_room").value="";
    renderSlots();
  });

  $("#m_save").addEventListener("click", (e)=>{
    e.preventDefault();
    data.name = $("#m_name").value.trim();
    data.color = $("#m_color").value;
    if(!data.name) return alert("Pon un nombre.");
    if(isEdit){
      const i = state.subjects.findIndex(s=>s.id===data.id);
      state.subjects[i] = data;
    } else {
      state.subjects.push(data);
    }
    saveState(); modal.close(); renderAll();
  });

  modal.showModal();
}

function weekday(n){ return ["","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][n] || ""; }
function lighten(hex, amt=0.3){
  const c = hex.replace("#",""); const num = parseInt(c,16);
  let r=(num>>16)&255, g=(num>>8)&255, b=num&255;
  r = Math.round(r + (255-r)*amt); g = Math.round(g + (255-g)*amt); b = Math.round(b + (255-b)*amt);
  return `#${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}

// Timetable grid (08:00–22:00)
function renderTimetable(){
  const grid = $("#timetableGrid");
  grid.innerHTML = "";
  const hours = Array.from({length:14}, (_,i)=>i+8); // 8..21 => 14 filas
  hours.forEach(h=>{
    const hh = h.toString().padStart(2,"0")+":00";
    const timeCell = document.createElement("div");
    timeCell.className="time-cell";
    timeCell.textContent = hh;
    grid.appendChild(timeCell);

    for(let d=1; d<=6; d++){
      const slotCell = document.createElement("div");
      slotCell.className="slot";
      grid.appendChild(slotCell);

      // bloques por materia que caigan en esta hora
      state.subjects.forEach(s=>{
        (s.slots||[]).forEach(sl=>{
          if(sl.day!==d) return;
          const startMin = toMinutes(sl.start); const endMin = toMinutes(sl.end);
          const topMin = Math.max(0, startMin - h*60);
          const blockMin = Math.min(60, endMin - h*60) - Math.max(0, 0);
          if(startMin < (h+1)*60 && endMin > h*60){
            const b = document.createElement("div");
            b.className="block";
            b.style.background = `linear-gradient(180deg, ${lighten(s.color,0.25)}, ${s.color})`;
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
function toMinutes(t){ const [h,m] = t.split(":").map(Number); return h*60+m; }

// -------------------- Tareas --------------------
function renderTaskFilters(){
  const sel = $("#filterSubject");
  sel.innerHTML = `<option value="all">Todas las asignaturas</option>` +
    state.subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}
function renderTasks(){
  const list = $("#taskList");
  list.innerHTML = "";

  const status = $("#filterStatus").value || "all";
  const subj = $("#filterSubject").value || "all";
  const query = ($("#taskSearch").value || "").toLowerCase();

  const tasks = state.tasks
    .filter(t => status==="all" ? true : status==="open" ? !t.done : t.done)
    .filter(t => subj==="all" ? true : t.subjectId===subj)
    .filter(t => (t.title.toLowerCase().includes(query) || (t.tag||"").toLowerCase().includes(query)))
    .sort((a,b)=>{
      const da = a.due ? new Date(a.due) : new Date("2999-01-01");
      const db = b.due ? new Date(b.due) : new Date("2999-01-01");
      return da - db;
    });

  tasks.forEach(t=>{
    const s = state.subjects.find(x=>x.id===t.subjectId);
    const el = document.createElement("div");
    el.className = "task";
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

    el.querySelector(`[data-toggle="${t.id}"]`).addEventListener("click", ()=>{
      t.done = !t.done; saveState(); renderAll();
    });
    el.querySelector(`[data-edit="${t.id}"]`).addEventListener("click", ()=> openTaskModal(t));
    el.querySelector(`[data-del="${t.id}"]`).addEventListener("click", ()=>{
      if(confirm(`¿Eliminar tarea "${t.title}"?`)){
        state.tasks = state.tasks.filter(x=>x.id!==t.id);
        saveState(); renderAll();
      }
    });
  });

  if(!tasks.length){
    list.innerHTML = `<div class="task"><div class="meta">No hay tareas que coincidan con el filtro.</div></div>`;
  }
}
function openTaskModal(task=null){
  const subjectsOpts = state.subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  const data = task || { id: uid(), title:"", subjectId:"", due:"", priority:"media", tag:"", done:false };
  const isEdit = !!task;
  const modal = $("#modal");
  $("#modalContent").innerHTML = `
    <div class="form">
      <h3>${isEdit?"Editar tarea":"Nueva tarea"}</h3>
      <div class="row"><label>Título</label><input id="t_title" class="input" value="${escapeHtml(data.title)}" placeholder="Ej: Informe laboratorio 2" required /></div>
      <div class="grid-2">
        <div class="row"><label>Asignatura</label><select id="t_subject" class="input"><option value="">General</option>${subjectsOpts}</select></div>
        <div class="row"><label>Entrega</label><input id="t_due" type="date" class="input" value="${data.due||""}" /></div>
      </div>
      <div class="grid-2">
        <div class="row"><label>Prioridad</label>
          <select id="t_priority" class="input">
            <option value="alta" ${data.priority==="alta"?"selected":""}>Alta</option>
            <option value="media" ${data.priority==="media"?"selected":""}>Media</option>
            <option value="baja" ${data.priority==="baja"?"selected":""}>Baja</option>
          </select>
        </div>
        <div class="row"><label>Etiqueta</label><input id="t_tag" class="input" value="${escapeHtml(data.tag||"")}" placeholder="Ej: lab, lectura..." /></div>
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
      const i = state.tasks.findIndex(x=>x.id===data.id);
      state.tasks[i]=data;
    } else {
      state.tasks.push(data);
    }
    saveState(); modal.close(); renderAll();
  });
  $("#modal").showModal();
}

// -------------------- Notas / Porcentajes --------------------
function renderGradeModule(){
  const sel = $("#gradeSubjectSelect");
  sel.innerHTML = state.subjects.length
    ? state.subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")
    : `<option value="">(Agrega asignaturas para gestionar notas)</option>`;
  sel.onchange = renderCategories;
  renderCategories();
}

function renderCategories(){
  const subjId = $("#gradeSubjectSelect").value;
  const list = $("#categoryList");
  list.innerHTML = "";
  if(!subjId){ updateGradeSummary(0,0); return; }

  const items = state.grades[subjId] || [];
  items.forEach(cat=>{
    const row = document.createElement("div");
    row.className = "category";
    row.innerHTML = `
      <div class="cat-name">${escapeHtml(cat.name)}</div>
      <div class="cat-controls">
        <label>Peso (%)</label>
        <input type="number" class="input" min="0" max="100" step="1" value="${cat.weight}" data-w="${cat.id}" />
      </div>
      <div class="cat-controls">
        <label>Nota (%)</label>
        <input type="number" class="input" min="0" max="100" step="0.1" value="${cat.score}" data-s="${cat.id}" />
      </div>
      <div class="cat-controls">
        <button class="btn btn-ghost" data-edit="${cat.id}">Renombrar</button>
        <button class="btn btn-ghost" style="color:#b42318" data-del="${cat.id}">Eliminar</button>
      </div>
    `;
    list.appendChild(row);

    row.querySelector(`[data-w="${cat.id}"]`).addEventListener("input",(e)=>{
      cat.weight = clamp(parseFloat(e.target.value||0),0,100);
      saveState(); updateSubjectGrade(subjId);
    });
    row.querySelector(`[data-s="${cat.id}"]`).addEventListener("input",(e)=>{
      cat.score = clamp(parseFloat(e.target.value||0),0,100);
      saveState(); updateSubjectGrade(subjId);
    });
    row.querySelector(`[data-del="${cat.id}"]`).addEventListener("click",()=>{
      if(confirm("¿Eliminar categoría?")){
        state.grades[subjId] = (state.grades[subjId]||[]).filter(x=>x.id!==cat.id);
        saveState(); renderCategories(); renderSummary();
      }
    });
    row.querySelector(`[data-edit="${cat.id}"]`).addEventListener("click",()=>{
      const name = prompt("Nuevo nombre de categoría:", cat.name);
      if(name!==null){
        cat.name = name.trim() || cat.name;
        saveState(); renderCategories(); renderSummary();
      }
    });
  });

  updateSubjectGrade(subjId);

  if(!items.length){
    list.innerHTML = `<div class="category"><div class="cat-name">Sin categorías</div><div class="cat-controls">Añade la primera 👇</div></div>`;
  }
}

function updateSubjectGrade(subjId){
  const {current, usedWeight} = computeGradeForSubject(subjId);
  updateGradeSummary(current, usedWeight);
  renderSummary();
}
function computeGradeForSubject(subjId){
  const cats = state.grades[subjId] || [];
  const usedWeight = Math.round(cats.reduce((s,c)=> s + (Number(c.weight)||0), 0));
  const current = Math.round(
    cats.reduce((s,c)=> s + ( (Number(c.weight)||0) * (Number(c.score)||0) / 100 ), 0)
  );
  return {current, usedWeight};
}
function updateGradeSummary(current, usedWeight){
  $("#currentGrade").textContent = `${current.toFixed(0)}%`;
  $("#usedWeight").textContent = `${usedWeight}%`;
  $("#gradeProgressBar").style.width = `${clamp(current,0,100)}%`;
}

function addCategory(subjId){
  if(!subjId) return;
  const name = prompt("Nombre de la categoría (ej: Controles, Laboratorio, Examen):");
  if(!name) return;
  const obj = { id: uid(), name: name.trim(), weight: 0, score: 0 };
  state.grades[subjId] = state.grades[subjId] || [];
  state.grades[subjId].push(obj);
  saveState(); renderCategories(); renderSummary();
}

// -------------------- Utilidades UI --------------------
function bindGlobalActions(){
  // botones
  $("#addSubjectBtn").addEventListener("click", ()=> openSubjectModal());
  $("#addTaskBtn").addEventListener("click", ()=> openTaskModal());
  $("#addCategoryBtn").addEventListener("click", ()=> addCategory($("#gradeSubjectSelect").value));

  // filtros / búsquedas
  $("#subjectSearch").addEventListener("input", renderSubjects);
  $("#filterStatus").addEventListener("change", renderTasks);
  $("#filterSubject").addEventListener("change", renderTasks);
  $("#taskSearch").addEventListener("input", renderTasks);

  // exportar / importar / reset
  $("#exportBtn").addEventListener("click", exportJSON);
  $("#importInput").addEventListener("change", importJSON);
  $("#resetBtn").addEventListener("click", ()=>{
    if(confirm("Esto borrará tus datos locales del planeador. ¿Continuar?")){
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "planeador_universidad.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function importJSON(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data || !("subjects" in data && "tasks" in data && "grades" in data)) throw new Error("Formato inválido.");
      // merge simple (reemplaza)
      state.subjects = data.subjects || [];
      state.tasks = data.tasks || [];
      state.grades = data.grades || {};
      saveState(); renderAll();
    }catch(err){
      alert("No se pudo importar: " + err.message);
    }
  };
  reader.readAsText(file);
}

// helper
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
