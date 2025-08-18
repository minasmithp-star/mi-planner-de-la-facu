/* ========== Utils & State ========== */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,10);

const STORAGE_KEY = 'assignment_tracker_pro_v1';
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } };

const todayISO = () => new Date().toISOString().slice(0,10);
// Hoy visible con año de 4 dígitos (p.ej., 2025)
const fmtToday4Y = iso => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
};
// Fechas en tabla con año de 2 dígitos (p.ej., 25)
const fmtShort2Y = iso => {
  if(!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es', { day:'2-digit', month:'2-digit', year:'2-digit' });
};
const daysLeft = iso => {
  if(!iso) return null;
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(iso + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};
const parseEst = s => {
  if(!s) return 0;
  const m = String(s).trim();
  let mins = 0;
  const rH = m.match(/(\d+(?:\.\d+)?)\s*h/);
  if(rH) mins += parseFloat(rH[1]) * 60;
  const rM = m.match(/(\d+)\s*m/);
  if(rM) mins += parseInt(rM[1]);
  if(!rH && !rM && /^\d+$/.test(m)) mins = parseInt(m);
  return Math.round(mins);
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const esc = s => (s||'').replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

// Paletas
const pinks10 = (() => { const arr=[]; for(let i=1;i<=10;i++){ const t=(i-1)/9; const L=92 - t*40; arr.push(`hsl(340,85%,${L}%)`);} return arr; })();
const statusPinks = {
  "No iniciado":"hsl(340,85%,90%)","En progreso":"hsl(340,80%,83%)",
  "Entregado":"hsl(340,75%,76%)","Calificado":"hsl(340,70%,69%)","Completado":"hsl(340,65%,62%)"
};

// Defaults
const DEFAULT_COURSES = ['Historia 101','Álgebra','Química','Inglés'];
const DEFAULT_TYPES   = ['Ensayo','Tarea','Presentación','Proyecto','Examen','Laboratorio'];
const DEFAULT_STATUS  = ['No iniciado','En progreso','Entregado','Calificado','Completado'];
const DEFAULT_PRIOS   = ['Alta','Media','Baja'];

let state = load() || { courses:[...DEFAULT_COURSES], assignments:[], tags:[], goals:{}, timers:{}, activity:[] };

/* ========== App Init & Tabs ========== */
document.addEventListener('DOMContentLoaded', ()=>{
  $('#todayStr').textContent = fmtToday4Y(todayISO());
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b=>b.classList.remove('active'));
    $$('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    if(id==='tabla'){
      ['#p-tabla-0','#p-tabla-1','#p-tabla-2','#p-tabla-3'].forEach(s => $(s).classList.add('active'));
    } else {
      ['#p-tabla-0','#p-tabla-1','#p-tabla-2','#p-tabla-3'].forEach(s => $(s).classList.remove('active'));
    }
    if(id==='kanban') $('#p-kanban').classList.add('active');
    if(id==='analitica'){ $('#p-analitica').classList.add('active'); renderAnalytics(); }
    if(id==='plan') $('#p-plan').classList.add('active');
    if(id==='kanban') renderKanban();
  }));

  bindGlobal();
  renderAll();
});

function bindGlobal(){
  $('#addAssignBtn').addEventListener('click', ()=> openAssignModal());
  $('#manageCoursesBtn').addEventListener('click', openCourseManager);
  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importInput').addEventListener('change', importJSON);
  $('#exportCSV').addEventListener('click', exportCSV);
  $('#importCSV').addEventListener('change', importCSV);
  $('#resetBtn').addEventListener('click', ()=>{
    if(confirm('Esto borrará todos tus datos locales. ¿Continuar?')){
      localStorage.removeItem(STORAGE_KEY); location.reload();
    }
  });

  $('#searchInput').addEventListener('input', renderTable);
  $('#filterStatus').addEventListener('change', renderTable);
  $('#filterPriority').addEventListener('change', renderTable);
  $('#filterCourse').addEventListener('change', renderTable);

  $('#checkAll').addEventListener('change', (e)=>{
    $$('#tbody input[type="checkbox"][data-row]').forEach(ch => { ch.checked = e.target.checked; });
    state.assignments.forEach(a => a._checked = e.target.checked);
  });
  $('#bulkIcs').addEventListener('click', bulkICS);
  $('#bulkDone').addEventListener('click', bulkDone);

  $('#quickAdd').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ quickAddFromInput(); }});

  // Atajos de teclado
  document.addEventListener('keydown', (e)=>{
    if(e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if(k==='/'){ e.preventDefault(); $('#searchInput').focus(); }
    else if(k==='n'){ e.preventDefault(); openAssignModal(); }
    else if(k==='e'){ e.preventDefault(); if(currentRowId) openAssignModal(findById(currentRowId)); }
    else if(k==='c'){ e.preventDefault(); if(currentRowId){ const a=findById(currentRowId); completeTask(a); } }
  });

  // Plan semanal
  $('#genPlan').addEventListener('click', generatePlan);
  $('#dlPlanIcs').addEventListener('click', downloadPlanICS);
}

function renderAll(){
  renderFilters();
  renderTable();
  renderMetrics();
  renderCharts();
  renderFocusPanel();
  renderTagSuggestions();
}

function renderFilters(){
  const sel = $('#filterCourse');
  sel.innerHTML = `<option value="all">Todos los cursos</option>` + state.courses.map(c=>`<option>${esc(c)}</option>`).join('');
}

/* ========== Tabla ========== */
let currentRowId = null;
function findById(id){ return state.assignments.find(a=>a.id===id); }

function renderTable(){
  const tbody = $('#tbody'); tbody.innerHTML = '';
  const q = ($('#searchInput').value||'').toLowerCase();
  const c = $('#filterCourse').value || 'all';
  const s = $('#filterStatus').value || 'all';
  const p = $('#filterPriority').value || 'all';
  const hasTag = q.includes('#'); const qTag = hasTag ? q.split(/\s+/).find(w=>w.startsWith('#'))?.slice(1) : null;

  const items = state.assignments
    .filter(a => c==='all' ? true : a.course===c)
    .filter(a => s==='all' ? true : a.status===s)
    .filter(a => p==='all' ? true : a.priority===p)
    .filter(a => {
      const text = ((a.title||'')+' '+(a.notes||'')+' '+(a.tags||[]).map(t=>'#'+t).join(' ')).toLowerCase();
      if(hasTag && qTag) return text.includes('#'+qTag);
      return text.includes(q);
    })
    .sort((a,b)=> {
      const da = a.due?new Date(a.due):new Date('2999-01-01');
      const db = b.due?new Date(b.due):new Date('2999-01-01');
      return da - db;
    });

  items.forEach(a=>{
    const tr = document.createElement('tr');
    tr.dataset.id = a.id;
    if(a.priority==='Alta') tr.classList.add('row-high');
    else if(a.priority==='Media') tr.classList.add('row-med');
    else tr.classList.add('row-low');
    if(currentRowId===a.id) tr.classList.add('selected-row');

    const dleft = daysLeft(a.due);
    const subs = a.subs||[]; const done = subs.filter(x=>x.done).length;
    const subTxt = subs.length ? ` <span class="badge" title="Subtareas">✓${done}/${subs.length}</span>` : '';
    const tagPills = (a.tags||[]).map(t=>`<span class="badge">#${esc(t)}</span>`).join(' ');

    tr.innerHTML = `
      <td><input type="checkbox" data-row="${a.id}" ${a._checked?'checked':''}></td>
      <td>${esc(a.title)}</td>
      <td>${esc(a.course||'—')}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${fmtShort2Y(a.due)}</td>
      <td>${daysThermo(dleft)}</td>
      <td>${prioBadge(a.priority)}</td>
      <td>${esc(a.type||'—')}</td>
      <td>${esc(a.est||'—')}</td>
      <td>${tagPills}</td>
      <td>${esc(a.notes||'')}${subTxt}</td>
      <td>${esc(a.grade||'')}</td>
      <td>
        <button class="mini-btn" data-timer="${a.id}">⏱</button>
        <button class="mini-btn" data-ics="${a.id}">📅</button>
        <button class="mini-btn" data-edit="${a.id}">✎</button>
        <button class="mini-btn" data-del="${a.id}">🗑</button>
      </td>`;

    tbody.appendChild(tr);

    tr.addEventListener('click', (e)=>{
      if(e.target.closest('button') || e.target.type==='checkbox') return;
      currentRowId = a.id; renderTable();
    });
    tr.querySelector(`[data-ics="${a.id}"]`).addEventListener('click', ()=> downloadICS(a));
    tr.querySelector(`[data-edit="${a.id}"]`).addEventListener('click', ()=> openAssignModal(a));
    tr.querySelector(`[data-del="${a.id}"]`).addEventListener('click', ()=>{
      if(confirm('¿Eliminar tarea?')){
        state.assignments = state.assignments.filter(x=>x.id!==a.id);
        save(); renderAll();
      }
    });
    tr.querySelector(`[data-timer="${a.id}"]`).addEventListener('click', ()=> openTimerModal(a));
    tr.querySelector(`[data-row]`).addEventListener('change', (e)=>{ a._checked = e.target.checked; });
  });

  if(!items.length){
    const tr=document.createElement('tr');
    tr.innerHTML='<td colspan="13" style="color:#777">No hay tareas.</td>';
    tbody.appendChild(tr);
  }
}

function statusBadge(st){
  const map = {"No iniciado":"not","En progreso":"prog","Entregado":"sub","Calificado":"grad","Completado":"done"};
  const key = map[st] || 'not';
  return `<span class="badge status ${key}">${st||'No iniciado'}</span>`;
}
function prioBadge(p){
  const key = p==='Alta'?'high':p==='Media'?'med':'low';
  return `<span class="badge priority ${key}">${p||'—'}</span>`;
}
function daysThermo(n){
  if(n===null) return '—';
  const horizon = 21;
  const urg = Math.max(0, Math.min(1, 1 - (n / horizon)));
  const width = Math.round((n < 0 ? 1 : urg) * 100);
  const light = 90 - urg * 28;
  const color = `hsl(350,75%,${light}%)`;
  const title = n<0 ? `${n} (atrasado)` : `${n} días`;
  return `<div class="thermo" title="${title}"><div class="thermo-bar" style="width:${width}%; background:${color}"></div><span class="thermo-label">${n}</span></div>`;
}

/* ========== En foco ========== */
function renderFocusPanel(){
  const overdue=[], today=[], soon=[];
  const now = new Date(); now.setHours(0,0,0,0);
  state.assignments.forEach(a=>{
    if(a.status==='Completado' || !a.due) return;
    const d=new Date(a.due+'T00:00:00');
    const diff=Math.round((d-now)/86400000);
    if(diff<0) overdue.push(a);
    else if(diff===0) today.push(a);
    else if(diff>0 && diff<=7) soon.push(a);
  });

  const fill = (id, arr) => {
    const ul = $(id); ul.innerHTML = '';
    if(!arr.length){ ul.innerHTML = '<li class="focus-item">Sin tareas</li>'; return; }
    arr.sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,10).forEach(a=>{
      const li = document.createElement('li');
      li.className = 'focus-item';
      li.innerHTML = `
        <div class="focus-main">
          <span class="focus-title">${esc(a.title)}</span>
          <span class="chip">${esc(a.course||'General')}</span>
          <span class="chip">vence: ${fmtShort2Y(a.due)}</span>
        </div>
        <div class="focus-actions">
          <button class="mini-btn" data-done="${a.id}">✔</button>
          <button class="mini-btn" data-plus1="${a.id}">+1d</button>
          <button class="mini-btn" data-edit="${a.id}">✎</button>
          <button class="mini-btn" data-ics="${a.id}">📅</button>
        </div>`;
      ul.appendChild(li);
      li.querySelector(`[data-done="${a.id}"]`).addEventListener('click', ()=> completeTask(a));
      li.querySelector(`[data-plus1="${a.id}"]`).addEventListener('click', ()=>{
        if(!a.due) return;
        const d=new Date(a.due+'T00:00:00'); d.setDate(d.getDate()+1);
        a.due=d.toISOString().slice(0,10); save(); renderAll();
      });
      li.querySelector(`[data-edit="${a.id}"]`).addEventListener('click', ()=> openAssignModal(a));
      li.querySelector(`[data-ics="${a.id}"]`).addEventListener('click', ()=> downloadICS(a));
    });
  };

  fill('#listOverdue', overdue);
  fill('#listToday', today);
  fill('#listWeek', soon);
}

/* ========== Gráficas ========== */
let pieChart, barChart;
function renderCharts(){
  const statuses = ["No iniciado","En progreso","Entregado","Calificado","Completado"];
  const counts = statuses.map(s=>state.assignments.filter(a=>a.status===s).length);
  if(pieChart) pieChart.destroy();
  pieChart = new Chart($('#pieStatus'), {
    type:'pie',
    data:{ labels:statuses, datasets:[{ data:counts, backgroundColor:statuses.map(s=>statusPinks[s]) }] },
    options:{ plugins:{ legend:{ position:'bottom' } }, maintainAspectRatio:false }
  });

  const bins = Array.from({length:10},(_,i)=>i+1), binCounts=new Array(10).fill(0);
  state.assignments.forEach(a=>{
    const raw=(a.grade||'').toString().replace(',','.').trim();
    const v=parseFloat(raw);
    if(!isNaN(v)){ const r=Math.round(v); if(r>=1 && r<=10) binCounts[r-1]++; }
  });
  if(barChart) barChart.destroy();
  barChart = new Chart($('#barGrades'), {
    type:'bar',
    data:{ labels:bins.map(String), datasets:[{ label:'Cantidad', data:binCounts, backgroundColor:pinks10, borderColor:pinks10, borderWidth:1, borderRadius:6 }] },
    options:{ maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, precision:0 } }, plugins:{ legend:{ display:false } } }
  });
}

function renderMetrics(){
  $('#totalCount').textContent = state.assignments.length;
  $('#doneCount').textContent  = state.assignments.filter(a=>a.status==='Completado').length;
}

/* ========== Modal Tarea (subtareas, tags, recurrencia, objetivo) ========== */
function openAssignModal(item=null){
  const isEdit = !!item;
  const data = item || {
    id: uid(), title:'', course: state.courses[0]||'', status:'No iniciado', due:'',
    priority:'Media', type: DEFAULT_TYPES[0], est:'', notes:'', grade:'',
    subs:[], tags:[], recur:{type:'none',x:7}, weight:0, createdAt:Date.now()
  };
  if(!data.subs) data.subs=[]; if(!data.tags) data.tags=[]; if(!data.recur) data.recur={type:'none',x:7}; if(!data.createdAt) data.createdAt=Date.now();

  const courseOpts = state.courses.map(c=>`<option ${c===data.course?'selected':''}>${esc(c)}</option>`).join('');
  const statusOpts = DEFAULT_STATUS.map(s=>`<option ${s===data.status?'selected':''}>${s}</option>`).join('');
  const prioOpts   = DEFAULT_PRIOS.map(s=>`<option ${s===data.priority?'selected':''}>${s}</option>`).join('');
  const typeOpts   = DEFAULT_TYPES.map(s=>`<option ${s===data.type?'selected':''}>${s}</option>`).join('');
  const tagStr = data.tags.join(' ');
  const goal = state.goals[data.course]||'';

  $('#modalContent').innerHTML = `
    <div class="form">
      <h3>${isEdit?'Editar tarea':'Nueva tarea'}</h3>
      <div><label>Título</label><input id="a_title" class="input" value="${esc(data.title)}" placeholder="Ej: Ensayo de 5 páginas"/></div>
      <div class="grid-3">
        <div><label>Curso</label><select id="a_course" class="input">${courseOpts}</select></div>
        <div><label>Estado</label><select id="a_status" class="input">${statusOpts}</select></div>
        <div><label>Fecha límite</label><input id="a_due" type="date" class="input" value="${data.due||''}"/></div>
      </div>
      <div class="grid-3">
        <div><label>Prioridad</label><select id="a_prio" class="input">${prioOpts}</select></div>
        <div><label>Tipo</label><select id="a_type" class="input">${typeOpts}</select></div>
        <div><label>Tiempo estimado</label><input id="a_est" class="input" value="${esc(data.est||'')}" placeholder="3h 30m o 210"/></div>
      </div>
      <div class="grid-3">
        <div><label>Peso (%)</label><input id="a_weight" type="number" min="0" max="100" class="input" value="${data.weight||0}"/></div>
        <div><label>Calificación (1–10)</label><input id="a_grade" class="input" value="${esc(data.grade||'')}" placeholder="8.5"/></div>
        <div><label>Etiquetas</label><input id="a_tags" class="input" list="taglist" value="${esc(tagStr)}" placeholder="#lectura #lab"/></div>
      </div>
      <div class="grid-3">
        <div><label>Recurrencia</label>
          <select id="a_recur" class="input">
            <option value="none" ${data.recur.type==='none'?'selected':''}>Sin repetir</option>
            <option value="weekly" ${data.recur.type==='weekly'?'selected':''}>Semanal</option>
            <option value="monthly" ${data.recur.type==='monthly'?'selected':''}>Mensual</option>
            <option value="xdays" ${data.recur.type==='xdays'?'selected':''}>Cada X días</option>
          </select>
        </div>
        <div><label>Si X días</label><input id="a_recur_x" type="number" class="input" value="${data.recur.x||7}"/></div>
        <div><label>Notas</label><input id="a_notes" class="input" value="${esc(data.notes||'')}"/></div>
      </div>

      <div>
        <strong>Subtareas</strong>
        <div id="subList" class="sublist"></div>
        <div class="subrow"><input id="subText" type="text" placeholder="Nueva subtarea…"/><button id="subAdd" class="mini-btn" type="button">Añadir</button><span></span></div>
      </div>

      <div id="goalBox" style="font-size:.9rem;color:#6d5f7a"></div>
    </div>
    <div class="actions">
      <button value="cancel" class="btn btn-ghost">Cancelar</button>
      <button id="a_save" class="btn">${isEdit?'Guardar':'Crear'}</button>
    </div>`;

  const renderSubs = ()=>{
    const cont = $('#subList'); cont.innerHTML = '';
    data.subs.forEach(s=>{
      const row=document.createElement('div'); row.className='subrow';
      row.innerHTML = `<input type="checkbox" ${s.done?'checked':''} data-toggle="${s.id}">
        <input type="text" value="${esc(s.text)}" data-text="${s.id}">
        <button class="mini-btn" data-del="${s.id}" type="button">Eliminar</button>`;
      cont.appendChild(row);
      row.querySelector(`[data-toggle="${s.id}"]`).addEventListener('change',(e)=>{ s.done=e.target.checked; save(); });
      row.querySelector(`[data-text="${s.id}"]`).addEventListener('input',(e)=>{ s.text=e.target.value; });
      row.querySelector(`[data-del="${s.id}"]`).addEventListener('click',()=>{ data.subs = data.subs.filter(x=>x.id!==s.id); renderSubs(); });
    });
  };
  renderSubs();
  $('#subAdd').addEventListener('click', ()=>{
    const v = $('#subText').value.trim(); if(!v) return;
    data.subs.push({id:uid(), text:v, done:false});
    $('#subText').value=''; renderSubs();
  });

  const updateGoalBox = ()=>{
    const goal = parseFloat(state.goals[$('#a_course').value]||NaN);
    const graded = state.assignments.filter(t=>t.course===$('#a_course').value && t.grade).concat(isEdit && data.grade? [data]:[]);
    let used=0, sum=0;
    graded.forEach(t=>{ const w=Number(t.weight||0); const gr=Number(t.grade||0); used += w; sum += w*gr; });
    const rem = clamp(100-used,0,100);
    let msg='';
    if(!isNaN(goal) && rem>0){
      const need=(goal*100 - sum)/rem;
      const needClamped=clamp(need,0,10).toFixed(2);
      msg = `Objetivo curso: <b>${goal.toFixed(1)}</b>. Con ${rem}% pendiente, necesitas promedio <b>${needClamped}</b> en el resto.`;
    }
    $('#goalBox').innerHTML = msg;
  };
  updateGoalBox();
  $('#a_course').addEventListener('change', updateGoalBox);

  $('#a_save').addEventListener('click',(e)=>{
    e.preventDefault();
    data.title = $('#a_title').value.trim();
    data.course= $('#a_course').value;
    data.status= $('#a_status').value;
    data.due   = $('#a_due').value || '';
    data.priority = $('#a_prio').value;
    data.type  = $('#a_type').value;
    data.est   = $('#a_est').value.trim();
    data.notes = $('#a_notes').value.trim();
    data.grade = $('#a_grade').value.trim();
    data.tags  = $('#a_tags').value.trim().split(/\s+/).filter(Boolean).map(t=>t.replace(/^#/,''));
    data.weight= Number($('#a_weight').value||0);
    data.recur = { type:$('#a_recur').value, x:Number($('#a_recur_x').value||7) };

    data.tags.forEach(t=>{ if(!state.tags.includes(t)) state.tags.push(t); });

    if(!data.title) return alert('Escribe un título.');
    if(isEdit){
      const i = state.assignments.findIndex(x=>x.id===data.id);
      state.assignments[i] = data;
    } else {
      state.assignments.push(data);
    }
    save(); $('#modal').close(); renderAll();
  });

  $('#modal').showModal();
}

/* ========== Timer (Pomodoro) ========== */
function openTimerModal(a){
  const elapsed = timerElapsed(a.id);
  $('#modalContent').innerHTML = `
    <div class="form"><h3>Temporizador — ${esc(a.title)}</h3>
      <div class="grid-3">
        <button class="btn" id="t25">Pomodoro 25'</button>
        <button class="btn btn-ghost" id="t50">Sesión 50'</button>
        <button class="btn btn-ghost" id="tStop">Detener</button>
      </div>
      <div><strong>Transcurrido:</strong> <span id="elapsed">${formatMins(elapsed)}</span></div>
    </div>
    <div class="actions"><button value="cancel" class="btn btn-ghost">Cerrar</button></div>`;
  $('#t25').addEventListener('click', ()=> startTimer(a.id,25));
  $('#t50').addEventListener('click', ()=> startTimer(a.id,50));
  $('#tStop').addEventListener('click', ()=> stopTimer(a.id));
  $('#modal').showModal();
}
function startTimer(id,mins){ state.timers[id]={running:true,start:Date.now(),target:Date.now()+mins*60000,acc:(state.timers[id]?.acc||0)}; save(); tickTimer(id); }
function stopTimer(id){ if(state.timers[id]){ const e=timerElapsed(id); state.timers[id]={running:false,start:0,target:0,acc:e}; save(); renderAll(); } }
function timerElapsed(id){ const t=state.timers[id]; if(!t) return 0; const base=t.acc||0; if(t.running){ return base + Math.floor((Date.now()-t.start)/60000); } return base; }
function tickTimer(id){ const int=setInterval(()=>{ if(!state.timers[id]||!state.timers[id].running){ clearInterval(int); return; } const m=timerElapsed(id); const el=$('#elapsed'); if(el) el.textContent=formatMins(m); },1000); }
function formatMins(m){ return `${m|0} min`; }

/* ========== Quick Add ========== */
function quickAddFromInput(){
  const v = $('#quickAdd').value.trim(); if(!v) return; // "Curso · Título · dd/mm [#tag] [3h]"
  const parts = v.split('·').map(s=>s.trim());
  if(parts.length<2){ alert('Usa: Curso · Título · dd/mm [#tag] [3h]'); return; }
  const course = parts[0];
  const rest = parts.slice(1).join(' · ');
  const mDate = rest.match(/(\b\d{1,2})\/(\d{1,2})(?:\/(\d{2}))?/);
  let due = '';
  if(mDate){
    const dd = String(mDate[1]).padStart(2,'0');
    const mm = String(mDate[2]).padStart(2,'0');
    const yy2 = mDate[3] ? mDate[3] : String(new Date().getFullYear()).slice(-2); // autocompleta "25"
    const full = `20${yy2}`; // guarda como 2025
    due = `${full}-${mm}-${dd}`;
  }
  const tags = [ ...(rest.match(/#\w+/g)||[]) ].map(t=>t.slice(1));
  const estMatch = rest.match(/(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*m|\b\d+\b)(?!\w)/);
  const est = estMatch? estMatch[1] : '';
  const title = rest.replace(mDate?.[0]||'','').replace(/#\w+/g,'').replace(est,'').replace(/\s+/g,' ').trim();

  const obj = { id:uid(), title, course, status:'No iniciado', due, priority:'Media', type:'Tarea', est, notes:'', grade:'', subs:[], tags, recur:{type:'none',x:7}, weight:0, createdAt:Date.now() };
  tags.forEach(t=>{ if(!state.tags.includes(t)) state.tags.push(t); });
  if(course && !state.courses.includes(course)) state.courses.push(course);

  state.assignments.push(obj); save(); $('#quickAdd').value=''; renderAll();
}
function renderTagSuggestions(){ const dl=$('#taglist'); dl.innerHTML=''; state.tags.forEach(t=>{ const o=document.createElement('option'); o.value='#'+t; dl.appendChild(o); }); }

/* ========== Bulk & ICS ========== */
function bulkICS(){ const sel=state.assignments.filter(a=>a._checked); if(!sel.length) return alert('Selecciona tareas.'); downloadICS(null, sel); }
function bulkDone(){ const sel=state.assignments.filter(a=>a._checked); if(!sel.length) return alert('Selecciona tareas.'); sel.forEach(a=>completeTask(a)); }

function downloadICS(a=null, list=null){
  const items = list || [a];
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Assignment Tracker//ES'];
  items.forEach(t=>{
    if(!t.due) return;
    const ymd = t.due.replaceAll('-','');
    const dtEnd = (()=>{ const d=new Date(t.due+'T00:00:00'); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10).replaceAll('-',''); })();
    const title = `Entrega: ${t.title}`;
    const desc = `Curso: ${t.course||'—'}\nEstado: ${t.status}\nPrioridad: ${t.priority}\nNotas: ${(t.notes||'').replace(/\n/g,' ')}`;
    lines.push('BEGIN:VEVENT',`UID:${t.id}@assignment-tracker`,`SUMMARY:${title.replace(/([,;])/g,'\\$1')}`,`DTSTART;VALUE=DATE:${ymd}`,`DTEND;VALUE=DATE:${dtEnd}`,`DESCRIPTION:${desc.replace(/([,;])/g,'\\$1')}`,`CATEGORIES:${(t.course||'Tarea').replace(/([,;])/g,'\\$1')}`,'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const aTag=document.createElement('a');
  aTag.href=url; aTag.download=list?'tareas_seleccionadas.ics':`tarea_${(a?.title||'evento').replace(/\s+/g,'_')}.ics`;
  document.body.appendChild(aTag); aTag.click(); aTag.remove(); URL.revokeObjectURL(url);
}

/* ========== Completar & Recurrencia ========== */
function completeTask(a){
  if(!a || a.status==='Completado') return;
  a.status='Completado';
  a.completedAt = Date.now();
  handleRecurrenceOnComplete(a);
  save(); renderAll();
}
function handleRecurrenceOnComplete(a){
  if(!a.due) return;
  const r=a.recur||{type:'none'}; if(r.type==='none') return;
  const next=new Date(a.due+'T00:00:00');
  if(r.type==='weekly') next.setDate(next.getDate()+7);
  else if(r.type==='monthly') next.setMonth(next.getMonth()+1);
  else if(r.type==='xdays') next.setDate(next.getDate()+(r.x||7));
  const copy={...a, id:uid(), status:'No iniciado', due:next.toISOString().slice(0,10), createdAt:Date.now(), completedAt:null};
  state.assignments.push(copy);
}

/* ========== Kanban ========== */
function renderKanban(){
  const cols = ["No iniciado","En progreso","Entregado","Calificado","Completado"];
  const wrap = $('#kanban'); wrap.innerHTML = '';
  cols.forEach(st=>{
    const col = document.createElement('div');
    col.className='col';
    col.innerHTML = `<h4>${st}</h4><div class="klist" data-col="${st}"></div>`;
    wrap.appendChild(col);
  });
  state.assignments.forEach(a=>{
    const div = document.createElement('div');
    div.className='cardk'; div.draggable=true; div.dataset.id=a.id;
    div.innerHTML = `<div class="title">${esc(a.title)}</div><div class="meta">${esc(a.course||'—')} · vence ${fmtShort2Y(a.due)}</div>`;
    const col = $(`.klist[data-col='${a.status}']`) || $('.klist');
    col.appendChild(div);
    div.addEventListener('dragstart',(e)=>{ e.dataTransfer.setData('text/plain', a.id); });
  });
  $$('.klist').forEach(list=>{
    list.addEventListener('dragover',(e)=>{ e.preventDefault(); list.style.background='#f8f3f7'; });
    list.addEventListener('dragleave',()=>{ list.style.background=''; });
    list.addEventListener('drop',(e)=>{
      e.preventDefault(); list.style.background='';
      const id=e.dataTransfer.getData('text/plain');
      const t=findById(id);
      if(t){ t.status=list.dataset.col; save(); renderAll(); renderKanban(); }
    });
  });
}

/* ========== Analytics ========== */
let chActivity, chHours;
function renderAnalytics(){
  const weeks = Array.from({length:10},(_,i)=>i).map(x=>weekKey(Date.now() - (9-x)*7*86400000));
  const created   = weeks.map(w=>state.assignments.filter(a=>weekKey(a.createdAt||Date.now())===w).length);
  const completed = weeks.map(w=>state.assignments.filter(a=>a.completedAt && weekKey(a.completedAt)===w).length);
  if(chActivity) chActivity.destroy();
  chActivity = new Chart($('#chActivity'), {
    type:'bar',
    data:{ labels:weeks, datasets:[{label:'Creadas',data:created},{label:'Completadas',data:completed}] },
    options:{ plugins:{ legend:{ position:'bottom' } }, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, precision:0 } } }
  });

  const byCourse = {};
  Object.entries(state.timers).forEach(([id,t])=>{
    const a=findById(id); if(!a) return;
    const m=timerElapsed(id);
    const c=a.course||'General';
    byCourse[c]=(byCourse[c]||0)+m;
  });
  const labels = Object.keys(byCourse), data = labels.map(k=>byCourse[k]);
  if(chHours) chHours.destroy();
  chHours = new Chart($('#chHours'), {
    type:'bar', data:{ labels, datasets:[{label:'Minutos', data}] },
    options:{ plugins:{ legend:{ display:false } }, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
  });

  const heat = $('#heat'); heat.innerHTML = '';
  const counts = new Array(14).fill(0);
  const now = new Date(); now.setHours(0,0,0,0);
  state.assignments.forEach(a=>{
    if(!a.due) return;
    const d=new Date(a.due+'T00:00:00');
    const diff=Math.round((d-now)/86400000);
    if(diff>=0 && diff<14) counts[diff]++;
  });
  counts.forEach(n=>{
    const cell=document.createElement('div');
    const light = 95 - Math.min(n,6)*10;
    cell.style.background = `hsl(340,60%,${light}%)`;
    cell.title = `${n} tareas`;
    heat.appendChild(cell);
  });
}
function weekKey(ts){
  const d=new Date(ts);
  const onejan=new Date(d.getFullYear(),0,1);
  const day=Math.floor((d - onejan)/86400000);
  const week=Math.ceil((day + onejan.getDay()+1)/7);
  return `${String(d.getFullYear()).slice(-2)}-W${String(week).padStart(2,'0')}`;
}

/* ========== Cursos (con objetivo) ========== */
function openCourseManager(){
  const list = state.courses.map((c,i)=>`
    <div class="grid-3" style="grid-template-columns:1fr 120px auto;align-items:center">
      <input class="input course-input" data-i="${i}" value="${esc(c)}"/>
      <input class="input goal-input" data-i="${i}" type="number" step="0.1" placeholder="Objetivo nota" value="${state.goals[c]||''}"/>
      <button class="btn btn-ghost" data-del="${i}" style="color:#c026d3">Eliminar</button>
    </div>`).join('');

  $('#modalContent').innerHTML = `
    <div class="form">
      <h3>Cursos</h3>
      <div id="courseList">${list||'<small>No hay cursos</small>'}</div>
      <div class="grid-3" style="grid-template-columns:1fr auto auto;align-items:center">
        <input id="newCourse" class="input" placeholder="Nuevo curso"/>
        <button id="addCourse" class="btn">Añadir</button>
        <button value="cancel" class="btn btn-ghost" onclick="document.getElementById('modal').close()">Cerrar</button>
      </div>
    </div>
    <div class="actions">
      <button id="saveCourses" class="btn">Guardar cambios</button>
    </div>`;

  $('#addCourse').addEventListener('click', ()=>{
    const v=$('#newCourse').value.trim(); if(!v) return;
    state.courses.push(v); save(); $('#modal').close(); openCourseManager();
  });
  $$('#courseList [data-del]').forEach(btn=>btn.addEventListener('click', ()=>{
    const i=Number(btn.dataset.del); const name=state.courses[i];
    state.assignments.forEach(a=>{ if(a.course===name) a.course=''; });
    state.courses.splice(i,1); delete state.goals[name]; save(); $('#modal').close(); openCourseManager();
  }));
  $('#saveCourses').addEventListener('click', ()=>{
    $$('.course-input').forEach(inp=>{
      const i=Number(inp.dataset.i);
      const old=state.courses[i];
      const val=inp.value.trim()||old;
      state.assignments.forEach(a=>{ if(a.course===old) a.course=val; });
      state.courses[i]=val;
      const gEl = $(`.goal-input[data-i='${i}']`);
      const g = parseFloat(gEl.value);
      if(!isNaN(g)) state.goals[val]=g;
    });
    save(); $('#modal').close(); renderAll();
  });

  $('#modal').showModal();
}

/* ========== Import/Export JSON & CSV ========== */
function exportJSON(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='assignment_tracker_pro.json';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importJSON(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload = ()=>{
    try{
      const data=JSON.parse(reader.result);
      (data.assignments||[]).forEach(t=>{ if(!t.subs) t.subs=[]; if(!t.tags) t.tags=[]; });
      state={...state, ...data}; save(); location.reload();
    }catch(err){ alert('No se pudo importar: '+err.message); }
  };
  reader.readAsText(file);
}

function exportCSV(){
  const cols=['title','course','status','due','priority','type','est','notes','grade','tags','weight'];
  const rows=state.assignments.map(a=>[
    a.title,a.course,a.status,a.due,a.priority,a.type,a.est,(a.notes||'').replace(/\n/g,' '),a.grade,(a.tags||[]).map(t=>'#'+t).join(' '),a.weight
  ].map(v=>`"${String(v||'').replace(/"/g,'\"')}"`).join(','));
  const csv=[cols.join(','),...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='assignment_tracker.csv';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importCSV(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload = ()=>{
    const text=reader.result;
    const lines=text.trim().split(/\r?\n/);
    const header=lines.shift().split(',').map(s=>s.replace(/^\"|\"$/g,''));
    lines.forEach(line=>{
      const cells=parseCSV(line);
      const obj={};
      header.forEach((h,i)=>obj[h]=cells[i]?cells[i].replace(/^\"|\"$/g,''):'');
      const a={ id:uid(), title:obj.title, course:obj.course, status:obj.status||'No iniciado', due:obj.due||'',
        priority:obj.priority||'Media', type:obj.type||'Tarea', est:obj.est||'', notes:obj.notes||'', grade:obj.grade||'',
        tags:(obj.tags||'').split(/\s+/).filter(Boolean).map(t=>t.replace(/^#/,'')), subs:[], weight:Number(obj.weight||0), recur:{type:'none',x:7}, createdAt:Date.now()
      };
      state.assignments.push(a);
      a.tags.forEach(t=>{ if(!state.tags.includes(t)) state.tags.push(t); });
      if(a.course && !state.courses.includes(a.course)) state.courses.push(a.course);
    });
    save(); renderAll();
  };
  reader.readAsText(file);
}
function parseCSV(line){
  const out=[]; let cur='', inq=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch=='"'){ if(inq && line[i+1]=='"'){ cur+='"'; i++; } else inq=!inq; }
    else if(ch===',' && !inq){ out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur); return out;
}

/* ========== Plan semanal ========== */
let planCache=[];
function generatePlan(){
  const daysInput = $('#planDays').value || 'Lun,Mar,Mié,Jue,Vie';
  const hoursInput= $('#planHours').value || '18:00-20:00';
  const blockMins = Number($('#planBlock').value||90);
  const dayMap = {Lun:1,Mar:2,Mié:3,Mie:3,Jue:4,Vie:5,Sáb:6,Sab:6,Dom:0};
  const days = daysInput.split(',').map(s=>s.trim()).map(d=>dayMap[d]).filter(v=>v!==undefined);
  const [h1,h2]=hoursInput.split('-');
  const toMin=t=>{const [H,M]=t.split(':').map(Number); return H*60+M; }; const start=toMin(h1), end=toMin(h2);
  const slots = days.map(dow=>({dow,start,end}));

  const tasks = state.assignments
    .filter(a=>a.status!=='Completado' && a.due && daysLeft(a.due)>=0 && daysLeft(a.due)<=14)
    .map(a=>({a, mins:Math.max(30, parseEst(a.est)||60)}));

  const now = new Date(); now.setHours(0,0,0,0);
  const plan=[];
  for(let day=0; day<14; day++){
    const d=new Date(now); d.setDate(d.getDate()+day);
    const dow=d.getDay();
    const sl=slots.find(s=>s.dow===dow);
    if(!sl) continue;
    let cur=sl.start;
    while(cur+blockMins<=sl.end){
      const task=tasks.sort((x,y)=> new Date(x.a.due)-new Date(y.a.due))[0];
      if(!task) break;
      plan.push({title:task.a.title, course:task.a.course, start:minsToDate(d,cur), end:minsToDate(d,cur+blockMins)});
      task.mins-=blockMins; if(task.mins<=0) tasks.shift();
      cur+=blockMins;
    }
  }
  planCache=plan; renderPlanList();
}
function minsToDate(d,mins){ const nd=new Date(d); nd.setHours(0,0,0,0); nd.setMinutes(mins); return nd; }
function renderPlanList(){
  const cont=$('#planList'); cont.innerHTML='';
  if(!planCache.length){ cont.textContent='No hay bloques generados aún.'; return; }
  const ul=document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding='0';
  planCache.forEach(ev=>{
    const li=document.createElement('li'); li.className='focus-item';
    const range=`${ev.start.toLocaleString('es',{weekday:'short', day:'2-digit', month:'2-digit'})} · ${ev.start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}–${ev.end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    li.innerHTML=`<div class="focus-main"><span class="focus-title">${esc(ev.title)}</span><span class="chip">${esc(ev.course||'General')}</span><span class="chip">${range}</span></div>`;
    ul.appendChild(li);
  });
  cont.appendChild(ul);
}
function downloadPlanICS(){
  if(!planCache.length) return alert('Genera el plan primero.');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Assignment Tracker//Plan'];
  planCache.forEach((ev,i)=>{
    const fmt=(dt)=>{ const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,'0'); const d=String(dt.getDate()).padStart(2,'0'); const H=String(dt.getHours()).padStart(2,'0'); const M=String(dt.getMinutes()).padStart(2,'0'); return `${y}${m}${d}T${H}${M}00`; };
    lines.push('BEGIN:VEVENT',`UID:plan${i}@assignment-tracker`,`SUMMARY:${(ev.course?ev.course+': ':'')+ev.title}`.replace(/([,;])/g,'\\$1'),`DTSTART:${fmt(ev.start)}`,`DTEND:${fmt(ev.end)}`,'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='plan_semana.ics';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

