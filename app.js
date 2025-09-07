(function () {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const db = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    push(key, value) { const arr = db.get(key, []); arr.push(value); db.set(key, arr); },
  };

  function createChannel(name, onMessage) {
    let bc;
    try {
      bc = new BroadcastChannel(name);
      bc.onmessage = (ev) => onMessage(ev.data);
    } catch {
      window.addEventListener('storage', (ev) => {
        if (ev.key === `bc:${name}` && ev.newValue) {
          try { onMessage(JSON.parse(ev.newValue)); } catch {}
        }
      });
    }
    const post = (data) => {
      if (bc) bc.postMessage(data);
      else localStorage.setItem(`bc:${name}`, JSON.stringify(data));
    };
    return { post };
  }

  function seedDemo() {
    if (db.get('seeded', false)) return;
    db.set('currentUser', { name: 'Dra. García', dept: 'Medicina Interna', id: 'u1' });
    db.set('patients', [
      { id: 'p1', name: 'Juan Pérez' },
      { id: 'p2', name: 'Ana López' },
      { id: 'p3', name: 'Carlos Ruiz' },
    ]);
    const now = Date.now();
    db.set('activity', [
      { id: 'a1', type: 'chat', icon: '💬', text: 'Mensaje en Radiología: Informe preliminar TC', ts: now - 3600e3 },
      { id: 'a2', type: 'appt', icon: '🗓️', text: 'Cita creada con Juan Pérez para hoy 16:30', ts: now - 3200e3 },
      { id: 'a3', type: 'ai', icon: '🧠', text: 'Análisis IA generado para Ana López', ts: now - 1800e3 },
    ]);
    db.set('deptMessages', []);
    db.set('patientThreads', {});
    db.set('appointments', []);
    db.set('seeded', true);
  }

  function formatTime(ts) { return new Date(ts).toLocaleString(); }

  function addActivity(item) {
    const items = db.get('activity', []);
    items.unshift(item);
    db.set('activity', items.slice(0, 200));
    renderActivity();
  }

  function setupNav() {
    const buttons = $$('.nav-link');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const section = btn.dataset.section;
        $$('.section').forEach((s) => s.classList.remove('visible'));
        $(section).classList.add('visible');
        if (section === 'appointments') renderCalendar();
      });
    });
  }

  function setupTheme() {
    const theme = db.get('theme', 'dark');
    if (theme === 'light') document.body.classList.add('light');
    $('themeToggle').addEventListener('click', () => {
      document.body.classList.toggle('light');
      db.set('theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });
  }

  function renderActivity() {
    const feed = $('activityFeed');
    const items = db.get('activity', []);
    feed.innerHTML = items.map((it) => `
      <div class="item">
        <div class="icon">${it.icon || '•'}</div>
        <div>
          <div>${it.text}</div>
          <div class="meta">${formatTime(it.ts)}</div>
        </div>
        <div class="tag">${it.type}</div>
      </div>
    `).join('');
  }

  const deptChannel = createChannel('dept-chat', (msg) => {
    if (msg.kind !== 'dept-message') return;
    const arr = db.get('deptMessages', []);
    arr.push(msg.payload);
    db.set('deptMessages', arr);
    renderDeptMessages();
    addActivity({ id: `act-${Date.now()}`, type: 'chat', icon: '💬', text: `[Dept] ${msg.payload.dept}: ${msg.payload.text || '(adjunto)'} `, ts: Date.now() });
  });

  function renderDeptMessages() {
    const list = $('deptMessages');
    const data = db.get('deptMessages', []);
    list.innerHTML = data.slice(-200).map(renderMessage).join('');
    list.scrollTop = list.scrollHeight;
  }

  function renderMessage(m) {
    const attachments = (m.attachments || []).map((a) => `<a class="attachment" href="${a.url}" download="${a.name}">📎 ${a.name}</a>`).join('');
    return `
      <div class="message">
        <div>${m.text || ''}</div>
        ${attachments ? `<div class="attachments">${attachments}</div>` : ''}
        <div class="meta">
          <span>${m.authorName} · ${m.dept || m.patientName || ''}</span>
          <span>${new Date(m.ts).toLocaleTimeString()}</span>
        </div>
      </div>
    `;
  }

  function setupDeptChat() {
    const current = db.get('currentUser');
    $('currentUserName').textContent = current.name;
    $('deptSelect').value = current.dept;
    $('switchDept').addEventListener('click', () => {
      current.dept = $('deptSelect').value;
      db.set('currentUser', current);
      addActivity({ id: `dept-${Date.now()}`, type: 'info', icon: '🏷️', text: `Departamento actual: ${current.dept}`, ts: Date.now() });
    });
    $('sendDept').addEventListener('click', async () => {
      const text = $('deptText').value.trim();
      const files = $('deptFile').files;
      const attachments = await readFiles(files);
      if (!text && attachments.length === 0) return;
      const msg = { id: `m-${Date.now()}`, text, attachments, dept: current.dept, authorId: current.id, authorName: current.name, ts: Date.now() };
      deptChannel.post({ kind: 'dept-message', payload: msg });
      $('deptText').value = '';
      $('deptFile').value = '';
    });
    renderDeptMessages();
  }

  function readFiles(fileList) {
    const arr = Array.from(fileList || []);
    return Promise.all(arr.map((f) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, url: reader.result });
      reader.readAsDataURL(f);
    })));
  }

  const patientChannel = createChannel('patient-chat', (msg) => {
    if (msg.kind === 'patient-message') {
      const threads = db.get('patientThreads', {});
      const arr = threads[msg.payload.patientId] || [];
      arr.push(msg.payload);
      threads[msg.payload.patientId] = arr;
      db.set('patientThreads', threads);
      if (($('patientSelect') || {}).value === msg.payload.patientId) renderPatientMessages();
      addActivity({ id: `pmsg-${Date.now()}`, type: 'chat', icon: '👥', text: `[Paciente] ${msg.payload.patientName}: ${msg.payload.text || '(adjunto)'} `, ts: Date.now() });
    }
    if (msg.kind === 'appointment') {
      const appts = db.get('appointments', []);
      appts.push(msg.payload);
      db.set('appointments', appts);
      renderCalendar();
      if (($('patientSelect') || {}).value === msg.payload.patientId) renderPatientAppointments();
      addActivity({ id: `appt-${Date.now()}`, type: 'appt', icon: '🗓️', text: `Cita propuesta para ${msg.payload.patientName} el ${new Date(msg.payload.when).toLocaleString()} (${msg.payload.mode})`, ts: Date.now() });
    }
  });

  function setupPatients() {
    const patients = db.get('patients', []);
    const sel = $('patientSelect');
    sel.innerHTML = patients.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.addEventListener('change', () => {
      renderPatientMessages();
      renderPatientAppointments();
    });
    $('newPatient').addEventListener('click', () => {
      const name = prompt('Nombre del paciente');
      if (!name) return;
      const id = `p${Date.now()}`;
      const pts = db.get('patients', []);
      pts.push({ id, name });
      db.set('patients', pts);
      sel.innerHTML = pts.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
      sel.value = id;
      renderPatientMessages();
      renderPatientAppointments();
      addActivity({ id: `pnew-${Date.now()}`, type: 'info', icon: '➕', text: `Paciente creado: ${name}`, ts: Date.now() });
    });

    $('sendPatient').addEventListener('click', async () => {
      const text = $('patientText').value.trim();
      const files = $('patientFile').files;
      const attachments = await readFiles(files);
      if (!text && attachments.length === 0) return;
      const current = db.get('currentUser');
      const patientId = sel.value;
      const patientName = (db.get('patients', []).find((p) => p.id === patientId) || {}).name || 'Paciente';
      const msg = { id: `pm-${Date.now()}`, text, attachments, patientId, patientName, authorId: current.id, authorName: current.name, ts: Date.now() };
      patientChannel.post({ kind: 'patient-message', payload: msg });
      $('patientText').value = '';
      $('patientFile').value = '';
    });

    const timeSel = $('apptTime');
    const times = [];
    for (let h = 8; h <= 18; h++) for (let m of [0, 30]) times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    timeSel.innerHTML = times.map((t) => `<option value="${t}">${t}</option>`).join('');
    $('apptDate').valueAsDate = new Date();

    $('createAppt').addEventListener('click', () => {
      const dateStr = $('apptDate').value;
      const timeStr = $('apptTime').value;
      const mode = $('apptMode').value;
      if (!dateStr || !timeStr) return;
      const when = new Date(`${dateStr}T${timeStr}:00`).getTime();
      const patientId = sel.value;
      const patientName = (db.get('patients', []).find((p) => p.id === patientId) || {}).name || 'Paciente';
      const appt = { id: `appt-${Date.now()}`, patientId, patientName, when, mode, status: 'Propuesta' };
      patientChannel.post({ kind: 'appointment', payload: appt });
    });

    renderPatientMessages();
    renderPatientAppointments();
  }

  function renderPatientMessages() {
    const sel = $('patientSelect');
    const pid = sel.value;
    const threads = db.get('patientThreads', {});
    const arr = threads[pid] || [];
    const list = $('patientMessages');
    list.innerHTML = arr.slice(-200).map(renderMessage).join('');
    list.scrollTop = list.scrollHeight;
  }

  function renderPatientAppointments() {
    const sel = $('patientSelect');
    const pid = sel.value;
    const appts = db.get('appointments', []).filter((a) => a.patientId === pid).sort((a,b) => a.when - b.when);
    const list = $('patientAppointments');
    list.innerHTML = appts.map((a) => `<div class="slot"><span>${new Date(a.when).toLocaleString()} · ${a.mode}</span><span class="tag">${a.status}</span></div>`).join('');
  }

  function renderCalendar() {
    const root = $('calendar');
    const day0 = $('filterApptDate').valueAsDate || new Date();
    day0.setHours(0,0,0,0);
    const days = [...Array(7)].map((_,i) => new Date(day0.getTime() + i*864e5));
    const appts = db.get('appointments', []);
    root.innerHTML = days.map((d) => {
      const items = appts.filter((a) => sameDay(new Date(a.when), d)).sort((a,b) => a.when-b.when);
      const body = items.length
        ? items.map((a) => `<div class="slot"><span>${new Date(a.when).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} · ${a.patientName}</span><span class="tag">${a.mode}</span></div>`).join('')
        : '<div class="muted">Sin citas</div>';
      return `<div class="day"><h4>${d.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' })}</h4>${body}</div>`;
    }).join('');
  }

  function sameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

  function setupAI() {
    $('runAI').addEventListener('click', () => {
      const age = parseInt(($('aiAge').value || '0'), 10);
      const symptomsText = ($('aiSymptoms').value || '').toLowerCase();
      let labs = {};
      try { labs = JSON.parse($('aiLabs').value || '{}'); }
      catch { return $('aiOutput').textContent = 'Error: JSON de laboratorio inválido.'; }
      const report = generateAIReport({ age, symptomsText, labs });
      $('aiOutput').textContent = report.text;
      $('saveAIReport').onclick = () => addActivity({ id: `ai-${Date.now()}`, type: 'ai', icon: '🧠', text: `Informe IA: ${report.summary}`, ts: Date.now() });
    });
  }

  function generateAIReport(input) {
    const findings = [];
    const advice = [];
    const risks = [];
    const labs = input.labs || {};

    const lab = (k) => Number(labs[k] ?? NaN);
    const has = (kw) => input.symptomsText.includes(kw);

    if (has('fiebre') || has('febril')) findings.push('Síndrome febril');
    if (has('tos') && has('seca')) findings.push('Tos seca');
    if (has('disnea') || has('dificultad para respirar')) findings.push('Disnea');
    if (!Number.isNaN(lab('PCR')) && lab('PCR') > 10) findings.push('PCR elevada (inflamación)');
    if (!Number.isNaN(lab('Leucocitos')) && lab('Leucocitos') > 11000) findings.push('Leucocitosis');
    if (!Number.isNaN(lab('Glucosa')) && lab('Glucosa') >= 126) findings.push('Glucemia elevada');

    if (input.age >= 65) risks.push('Edad avanzada');
    if (has('dolor torácico')) risks.push('Dolor torácico (descartar evento cardiovascular)');

    const differentials = [];
    if (findings.includes('Síndrome febril') && findings.includes('Tos seca')) differentials.push('Infección respiratoria alta/viral');
    if (findings.includes('Leucocitosis') && findings.includes('PCR elevada (inflamación)')) differentials.push('Procesos infecciosos bacterianos');
    if (findings.includes('Glucemia elevada')) { differentials.push('Alteración del metabolismo de la glucosa'); advice.push('Solicitar HbA1c y perfil lipídico'); }
    if (risks.includes('Dolor torácico (descartar evento cardiovascular)')) advice.push('Considerar ECG y troponinas de alta sensibilidad');
    if (risks.includes('Edad avanzada')) advice.push('Valorar fragilidad y medicación concomitante');

    if (findings.length === 0 && differentials.length === 0) advice.push('Los datos no sugieren alteraciones relevantes. Correlacionar clínico.');

    const summary = [...differentials.slice(0, 2), ...findings.slice(0, 2)].join('; ') || 'Sin hallazgos relevantes';
    const text = [
      `Edad: ${input.age} años.`,
      findings.length ? `Hallazgos: ${findings.join(', ')}.` : 'Hallazgos: no se identifican alteraciones mayores.',
      differentials.length ? `Posibles diagnósticos diferenciales: ${differentials.join(', ')}.` : '',
      risks.length ? `Factores de riesgo: ${risks.join(', ')}.` : '',
      advice.length ? `Recomendaciones: ${advice.join('; ')}.` : 'Recomendaciones: seguimiento según evolución clínica.',
      'Nota: Informe de referencia, no reemplaza juicio clínico.'
    ].filter(Boolean).join('\n\n');

    return { summary, text };
  }

  function setupGlobal() {
    $('todayBtn').addEventListener('click', () => {
      $('filterApptDate').valueAsDate = new Date();
      renderCalendar();
    });
    $('filterApptDate').addEventListener('change', renderCalendar);
    $('clearDemoData').addEventListener('click', () => {
      if (confirm('Esto borrará los datos locales de la demo. ¿Continuar?')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  seedDemo();
  setupNav();
  setupTheme();
  setupGlobal();
  renderActivity();
  setupDeptChat();
  setupPatients();
  setupAI();
  renderCalendar();
})();
