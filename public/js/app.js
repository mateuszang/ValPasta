/* SGM ValPasta - front-end (JS puro, hash router) */
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');
if (!token || !user) { sessionStorage.setItem('destino', location.hash); location.replace('index.html'); }

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (s) => s ? s.slice(0, 10).split('-').reverse().join('/') : '—';
const dth = (s) => s ? `${dt(s)} ${s.slice(11, 16)}` : '—';
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COR = { 'Operando': 'ok', 'Manutenção próxima': 'warn', 'Parada': 'bad', 'Em manutenção': 'off' };
const gerente = user?.perfil === 'gerente';

/* ---------- infraestrutura ---------- */
function sair() { localStorage.clear(); location.replace('index.html'); }

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + url, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  });
  if (r.status === 401) { sair(); throw new Error('Sessão expirada'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Erro inesperado');
  return d;
}

function toast(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = tipo; el.textContent = msg;
  $('#toast').append(el);
  setTimeout(() => el.remove(), 4000);
}
// executa uma ação mostrando erro em toast
const tentar = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'erro'); } };

function abrirModal(html) {
  fecharModal();
  const f = document.createElement('div');
  f.className = 'fundo-modal'; f.id = 'modal';
  f.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  f.addEventListener('mousedown', e => { if (e.target === f) fecharModal(); });
  document.body.append(f);
  f.querySelector('input,select,textarea,button')?.focus();
  return f;
}
const fecharModal = () => $('#modal')?.remove();
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

/* ---------- menu por perfil ---------- */
const ICONES = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  maquinas: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  funcionarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.6.2 4.5 2 4.5 5.3"/>',
  os: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  estoque: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  relatorios: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V7M18 17v-8"/>',
};
const MENU = [
  { rota: 'dashboard', nome: 'Dashboard', perfis: ['gerente', 'tecnico', 'operador'] },
  { rota: 'maquinas', nome: 'Máquinas', perfis: ['gerente', 'tecnico'] },
  { rota: 'funcionarios', nome: 'Funcionários', perfis: ['gerente'] },
  { rota: 'os', nome: 'Ordens de Serviço', perfis: ['gerente', 'tecnico', 'operador'] },
  { rota: 'estoque', nome: 'Estoque', perfis: ['gerente', 'tecnico'] },
  { rota: 'relatorios', nome: 'Relatórios', perfis: ['gerente'] },
];
$('#perfilNome').textContent = user.perfil;
$('#usuarioNome').textContent = user.nome;
$('#nav').innerHTML = MENU.filter(m => m.perfis.includes(user.perfil))
.map(m => `<a href="#/${m.rota}" data-rota="${m.rota}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[m.rota]}</svg><span>${m.nome}</span></a>`).join('');
$('#sair').onclick = sair;
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('aberta');

/* ---------- cache de listas auxiliares ---------- */
let setores = [], tiposFalha = [];
async function carregarAuxiliares() {
  [setores, tiposFalha] = await Promise.all([api('/maquinas/setores'), api('/maquinas/tipos-falha')]);
}
const opcoes = (lista, val, txt, sel) => lista.map(i => `<option value="${esc(i[val])}" ${i[val] == sel ? 'selected' : ''}>${esc(typeof txt === 'function' ? txt(i) : i[txt])}</option>`).join('');

/* ---------- roteador ---------- */
let timer = null, atual = '';
const TITULOS = { dashboard: 'Dashboard', maquinas: 'Máquinas', funcionarios: 'Funcionários', os: 'Ordens de Serviço', estoque: 'Estoque', relatorios: 'Relatórios', maquina: 'Ficha da máquina' };
const TELAS = () => ({ dashboard: telaDashboard, maquinas: telaMaquinas, funcionarios: telaFuncionarios, os: telaOS, estoque: telaEstoque, relatorios: telaRelatorios, maquina: telaFicha });

async function rotear() {
  clearInterval(timer);
  const [, rota = 'dashboard', param] = location.hash.split('/');
  const permitido = MENU.find(m => m.rota === rota)?.perfis.includes(user.perfil) || rota === 'maquina';
  const nome = permitido && TELAS()[rota] ? rota : 'dashboard';
  atual = nome;
  $('#titulo').textContent = TITULOS[nome];
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('ativo', a.dataset.rota === (nome === 'maquina' ? 'maquinas' : nome)));
  $('#sidebar').classList.remove('aberta');
  view.innerHTML = '<p class="vazio">Carregando…</p>';
  try { await carregarAuxiliares(); await TELAS()[nome](decodeURIComponent(param || '')); }
  catch (e) { view.innerHTML = `<div class="card vazio">${esc(e.message)}</div>`; }
  if (nome !== 'dashboard') atualizarAlertas();
}
window.addEventListener('hashchange', rotear);

async function atualizarAlertas(n) {
  try { if (n === undefined) n = (await api('/dashboard')).total_alertas; } catch { return; }
  const el = $('#alertas');
  el.textContent = n === 1 ? '1 alerta' : `${n} alertas`;
  el.classList.toggle('zero', n === 0);
}

/* ---------- gráficos simples (CSS) ---------- */
function barrasH(itens, { rotulo, valor, sufixo = '', cor = '' }) {
  if (!itens.length) return '<p class="vazio">Sem dados ainda</p>';
  const max = Math.max(...itens.map(i => i[valor]), 1);
  return itens.map(i => `<div class="barra-h"><span>${esc(i[rotulo])}</span>
    <div class="trilho"><i class="${cor}" style="width:${(i[valor] / max) * 100}%"></i></div><b>${i[valor]}${sufixo}</b></div>`).join('');
}

/* =========================================================
   DASHBOARD
   ========================================================= */
async function telaDashboard() {
  let ultimo = '';
  const desenhar = async () => {
    const d = await api('/dashboard');
    const json = JSON.stringify(d);
    if (json === ultimo) return;           // só redesenha se algo mudou
    ultimo = json;
    atualizarAlertas(d.total_alertas);
    const m = d.maquinas, k = d.kpis;
    const operando = m.length ? Math.round(100 * m.filter(x => x.status === 'Operando').length / m.length) : 0;
    const maxH = Math.max(...m.flatMap(x => [x.horas_funcionamento, x.limite_horas]), 1);

    view.innerHTML = `
      ${k ? `<div class="grade g4" style="margin-bottom:20px">
        <div class="kpi destaque"><small>Disponibilidade</small><strong>${k.disponibilidade}%</strong></div>
        <div class="kpi"><small>MTBF</small><strong>${k.mtbf ?? '—'}${k.mtbf != null ? 'h' : ''}</strong></div>
        <div class="kpi"><small>MTTR</small><strong>${k.mttr != null ? k.mttr.toFixed(1) + 'h' : '—'}</strong></div>
        <div class="kpi"><small>Alertas</small><strong>${k.alertas}</strong></div>
      </div>` : ''}
      <div class="grade g-dash">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <h2 style="margin:0">Horas de operação vs limite</h2>
            ${gerente ? '<button class="btn verde mini" id="simular">Simular +50h</button>' : ''}
          </div>
          <div class="col-chart">${m.map(x => `<div class="col-par"><div class="col-barras">
              <i class="h" title="${x.horas_funcionamento}h" style="height:${(x.horas_funcionamento / maxH) * 100}%"></i>
              <i class="l" title="${x.limite_horas}h" style="height:${(x.limite_horas / maxH) * 100}%"></i></div></div>`).join('')}</div>
          <div class="col-legenda">${m.map(x => `<span>${esc(x.id_maquina)}</span>`).join('')}</div>
          <div class="leg"><span><i style="background:var(--verde)"></i>Horas no ciclo</span><span><i style="background:var(--azul)"></i>Limite</span></div>
        </div>
        <div class="card">
          <h2 style="text-align:center">Máquinas operando</h2>
          <div class="donut" style="background:conic-gradient(var(--verde) ${operando}%, var(--azul) 0)"><div>${operando}%</div></div>
          <ul class="lista-alertas">${d.alertas.length ? d.alertas.map(a => `<li>${a.tipo === 'estoque' ? '📦' : '⚠'} ${esc(a.texto)}</li>`).join('') : '<li>Nenhum alerta no momento</li>'}</ul>
        </div>
      </div>
      <div class="card"><h2>Status dos equipamentos</h2>
        <div class="maquinas-status">${m.map(x => `<a class="mq ${COR[x.status]}" href="#/maquina/${encodeURIComponent(x.id_maquina)}">
          <h3>${esc(x.id_maquina)}</h3><small>${esc(x.modelo)} · ${esc(x.setor)}</small>
          <span><i class="ponto ${COR[x.status]}"></i>${esc(x.status)}</span></a>`).join('') || '<p class="vazio">Nenhuma máquina cadastrada</p>'}</div>
      </div>`;
    $('#simular')?.addEventListener('click', tentar(async () => {
      const r = await api('/simulador', { method: 'POST', body: { horas: 50 } });
      toast(r.os_geradas ? `+50h simuladas. ${r.os_geradas} OS preventiva(s) gerada(s)` : '+50h simuladas', 'ok');
      ultimo = ''; await desenhar();
    }));
  };
  await desenhar();
  timer = setInterval(() => desenhar().catch(() => {}), 3000);   // RNF-004: status em até 3s
}

/* =========================================================
   MÁQUINAS
   ========================================================= */
let listaMaquinas = [];
async function telaMaquinas() {
  listaMaquinas = await api('/maquinas');
  view.innerHTML = `
    ${gerente ? `<div class="card"><form id="fm" class="form">
      <label class="campo">ID<input name="id_maquina" placeholder="ex: MQ-05" required></label>
      <label class="campo">Modelo<input name="modelo" required></label>
      <label class="campo">Setor<select name="id_setor" required>${opcoes(setores, 'id_setor', 'nome')}</select></label>
      <label class="campo">Aquisição<input type="date" name="data_aquisicao"></label>
      <label class="campo">Última manutenção<input type="date" name="ultima_manutencao"></label>
      <label class="campo">Horas no ciclo<input type="number" name="horas_funcionamento" min="0" step="0.1" value="0"></label>
      <label class="campo">Limite de horas<input type="number" name="limite_horas" min="1" step="0.1" required></label>
      <div class="form-acoes"><button class="btn verde" id="salvar">Salvar máquina</button><button type="button" class="btn claro oculto" id="cancelar">Cancelar</button></div>
    </form></div>` : ''}
    <div class="card tabela"><table>
      <thead><tr><th>ID</th><th>Modelo</th><th>Setor</th><th>Aquisição</th><th>Últ. manut.</th><th>Horas</th><th>Status</th><th></th></tr></thead>
      <tbody>${listaMaquinas.map(m => `<tr>
        <td><a class="link" href="#/maquina/${encodeURIComponent(m.id_maquina)}">${esc(m.id_maquina)}</a></td>
        <td>${esc(m.modelo)}</td><td>${esc(m.setor)}</td><td>${dt(m.data_aquisicao)}</td><td>${dt(m.ultima_manutencao)}</td>
        <td>${m.horas_funcionamento}/${m.limite_horas}</td>
        <td><i class="ponto ${COR[m.status]}"></i>${esc(m.status)}</td>
        <td class="acoes"><button class="link" data-acao="qr" data-id="${esc(m.id_maquina)}">QR</button>
          ${gerente ? `<button class="link" data-acao="editar-maq" data-id="${esc(m.id_maquina)}">Editar</button>
          <button class="link perigo" data-acao="excluir-maq" data-id="${esc(m.id_maquina)}">Excluir</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="vazio">Nenhuma máquina cadastrada</td></tr>'}</tbody></table></div>`;

  const f = $('#fm');
  if (!f) return;
  f.onsubmit = tentar(async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(f));
    const editando = f.id_maquina.readOnly;
    await api(editando ? `/maquinas/${encodeURIComponent(dados.id_maquina)}` : '/maquinas', { method: editando ? 'PUT' : 'POST', body: dados });
    toast(editando ? 'Máquina atualizada' : 'Máquina cadastrada', 'ok');
    telaMaquinas();
  });
  $('#cancelar').onclick = () => telaMaquinas();
}

function mostrarQR(id) {
  const url = `${location.origin}/app.html#/maquina/${encodeURIComponent(id)}`;
  abrirModal(`<h2>QR Code · ${esc(id)}</h2><div id="qrbox" style="display:grid;place-items:center;padding:10px"></div>
    <p style="font-size:.8rem;color:var(--suave);word-break:break-all;text-align:center">${esc(url)}</p>
    <div class="form-acoes" style="justify-content:flex-end"><button class="btn claro" data-acao="fechar">Fechar</button><button class="btn" data-acao="imprimir-qr">Imprimir</button></div>`);
  if (window.QRCode) new QRCode($('#qrbox'), { text: url, width: 200, height: 200 });
  else $('#qrbox').textContent = 'Biblioteca de QR Code indisponível (sem internet).';
}

/* ---------- Ficha da máquina (destino do QR Code) ---------- */
async function telaFicha(id) {
  const m = await api('/maquinas/' + encodeURIComponent(id));
  const pct = Math.min(100, Math.round(100 * m.horas_funcionamento / m.limite_horas));
  view.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <h2 style="font-size:1.3rem;margin:0">${esc(m.id_maquina)} · ${esc(m.modelo)}</h2>
        <div class="acoes-topo"><button class="btn claro mini" data-acao="qr" data-id="${esc(m.id_maquina)}">QR Code</button>
          <button class="btn verde mini" data-acao="chamado" data-id="${esc(m.id_maquina)}">Abrir chamado</button></div>
      </div>
      <div class="ficha">
        <div><small>Status</small><i class="ponto ${COR[m.status]}"></i>${esc(m.status)}</div>
        <div><small>Setor</small>${esc(m.setor)}</div>
        <div><small>Aquisição</small>${dt(m.data_aquisicao)}</div>
        <div><small>Última manutenção</small>${dt(m.ultima_manutencao)}</div>
        <div><small>Horímetro acumulado</small>${m.horas_totais}h</div>
        <div><small>Horas no ciclo / limite</small>${m.horas_funcionamento}h / ${m.limite_horas}h
          <div class="prog"><i class="${pct >= 100 ? 'bad' : pct >= 90 ? 'warn' : ''}" style="width:${pct}%"></i></div></div>
      </div>
    </div>
    <div class="card tabela"><h2>Histórico de intervenções</h2><table>
      <thead><tr><th>OS</th><th>Data</th><th>Tipo</th><th>Status</th><th>Técnico</th><th>Peças</th><th>Tempo</th><th>Descrição</th></tr></thead>
      <tbody>${m.historico.map(h => `<tr><td>#${h.id_os}</td><td>${dt(h.data_abertura)}</td><td><span class="etq ${h.tipo}">${h.tipo}</span></td>
        <td><span class="etq ${h.status}">${h.status}</span></td><td>${esc(h.tecnico || '—')}</td><td>${esc(h.pecas || '—')}</td>
        <td>${h.tempo_reparo != null ? h.tempo_reparo + 'h' : '—'}</td><td>${esc(h.descricao)}</td></tr>`).join('')
        || '<tr><td colspan="8" class="vazio">Sem intervenções registradas</td></tr>'}</tbody></table></div>`;
}

/* =========================================================
   FUNCIONÁRIOS
   ========================================================= */
let listaFunc = [];
async function telaFuncionarios() {
  listaFunc = await api('/funcionarios');
  view.innerHTML = `
    <div class="card"><form id="ff" class="form">
      <label class="campo">ID<input name="id_funcionario" placeholder="ex: F-04" required></label>
      <label class="campo">Nome<input name="nome" required></label>
      <label class="campo">Cargo<input name="cargo" required></label>
      <label class="campo">Turno<select name="turno"><option>Manhã</option><option>Tarde</option><option>Noite</option><option>Administrativo</option></select></label>
      <label class="campo">Especialidade<input name="especialidade"></label>
      <label class="campo" data-login>E-mail de acesso (opcional)<input type="email" name="email"></label>
      <label class="campo" data-login>Senha (mín. 6)<input type="password" name="senha" minlength="6" autocomplete="new-password"></label>
      <label class="campo" data-login>Perfil<select name="perfil"><option value="tecnico">Técnico</option><option value="gerente">Gerente / Supervisor</option></select></label>
      <div class="form-acoes"><button class="btn verde">Salvar</button><button type="button" class="btn claro oculto" id="cancelar">Cancelar</button></div>
    </form></div>
    <div class="card tabela"><table>
      <thead><tr><th>ID</th><th>Nome</th><th>Cargo</th><th>Turno</th><th>Especialidade</th><th>Acesso</th><th></th></tr></thead>
      <tbody>${listaFunc.map(f => `<tr><td>${esc(f.id_funcionario)}</td><td>${esc(f.nome)}</td><td>${esc(f.cargo)}</td><td>${esc(f.turno)}</td>
        <td>${esc(f.especialidade || '—')}</td><td>${f.perfil ? esc(f.perfil) : '—'}</td>
        <td class="acoes"><button class="link" data-acao="editar-func" data-id="${esc(f.id_funcionario)}">Editar</button>
        <button class="link perigo" data-acao="excluir-func" data-id="${esc(f.id_funcionario)}">Excluir</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="vazio">Nenhum funcionário cadastrado</td></tr>'}</tbody></table></div>`;
  const f = $('#ff');
  f.onsubmit = tentar(async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(f));
    const editando = f.id_funcionario.readOnly;
    await api(editando ? `/funcionarios/${encodeURIComponent(dados.id_funcionario)}` : '/funcionarios', { method: editando ? 'PUT' : 'POST', body: dados });
    toast(editando ? 'Funcionário atualizado' : 'Funcionário cadastrado', 'ok');
    telaFuncionarios();
  });
  $('#cancelar').onclick = () => telaFuncionarios();
}

/* =========================================================
   ESTOQUE
   ========================================================= */
let listaPecas = [];
async function telaEstoque() {
  listaPecas = await api('/pecas');
  view.innerHTML = `
    ${gerente ? `<div class="card"><form id="fp" class="form">
      <input type="hidden" name="id_peca">
      <label class="campo">Peça<input name="nome" required></label>
      <label class="campo">Em estoque<input type="number" name="estoque_atual" min="0" step="1" value="0" required></label>
      <label class="campo">Estoque mínimo<input type="number" name="estoque_minimo" min="0" step="1" value="0" required></label>
      <label class="campo">Custo unitário (R$)<input type="number" name="custo_unitario" min="0" step="0.01" value="0"></label>
      <div class="form-acoes"><button class="btn verde">Salvar peça</button><button type="button" class="btn claro oculto" id="cancelar">Cancelar</button></div>
    </form></div>` : ''}
    <div class="card tabela"><table>
      <thead><tr><th>Peça</th><th>Em estoque</th><th>Mínimo</th><th>Custo unit.</th><th>Situação</th>${gerente ? '<th></th>' : ''}</tr></thead>
      <tbody>${listaPecas.map(p => {
        const baixo = p.estoque_atual <= p.estoque_minimo;
        return `<tr><td>${esc(p.nome)}</td><td>${p.estoque_atual}</td><td>${p.estoque_minimo}</td><td>${brl(p.custo_unitario)}</td>
        <td><i class="ponto ${baixo ? 'bad' : 'ok'}"></i>${baixo ? 'Estoque baixo' : 'Normal'}</td>
        ${gerente ? `<td class="acoes"><button class="link" data-acao="editar-peca" data-id="${p.id_peca}">Editar</button>
          <button class="link perigo" data-acao="excluir-peca" data-id="${p.id_peca}">Excluir</button></td>` : ''}</tr>`;
      }).join('') || '<tr><td colspan="6" class="vazio">Nenhuma peça cadastrada</td></tr>'}</tbody></table></div>`;
  const f = $('#fp');
  if (!f) return;
  f.onsubmit = tentar(async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await api(d.id_peca ? `/pecas/${d.id_peca}` : '/pecas', { method: d.id_peca ? 'PUT' : 'POST', body: d });
    toast('Peça salva', 'ok');
    telaEstoque();
  });
  $('#cancelar').onclick = () => telaEstoque();
}

/* =========================================================
   ORDENS DE SERVIÇO
   ========================================================= */
let listaOS = [], tecnicos = [];
async function telaOS() {
  const [os, maquinas] = await Promise.all([api('/os'), api('/maquinas')]);
  listaOS = os;
  if (gerente) tecnicos = await api('/funcionarios');
  view.innerHTML = `
    <div class="card"><form id="fo" class="form">
      <label class="campo">Máquina<select name="id_maquina" required>${opcoes(maquinas, 'id_maquina', m => `${m.id_maquina} · ${m.modelo}`)}</select></label>
      ${gerente ? '<label class="campo">Tipo<select name="tipo"><option>Corretiva</option><option>Preventiva</option></select></label>' : ''}
      <label class="campo">Tipo de falha<select name="id_tipo_falha"><option value="">Não sei / n/a</option>${opcoes(tiposFalha, 'id_tipo_falha', 'nome')}</select></label>
      <label class="campo">Foto do defeito<input type="file" name="foto" accept="image/*"></label>
      <label class="campo largo">O que está acontecendo?<textarea name="descricao" required placeholder="Ex.: ruído estranho no eixo, vazamento de óleo…"></textarea></label>
      <div class="form-acoes"><button class="btn verde" id="abrir">Abrir chamado</button></div>
    </form></div>
    <div class="card tabela"><table>
      <thead><tr><th>OS</th><th>Data</th><th>Máquina</th><th>Tipo</th><th>Status</th><th>Técnico</th><th>Peças</th><th>Tempo</th><th>Descrição</th><th>Foto</th><th></th></tr></thead>
      <tbody>${os.map(o => `<tr>
        <td>#${o.id_os}${o.automatica ? '' : ''}</td><td>${dt(o.data_abertura)}</td><td>${esc(o.id_maquina)}</td>
        <td><span class="etq ${o.tipo}">${o.tipo}</span></td><td><span class="etq ${o.status}">${o.status}</span></td>
        <td>${esc(o.tecnico || '—')}</td><td>${esc(o.pecas || '—')}</td>
        <td>${o.tempo_reparo != null ? o.tempo_reparo + 'h' : o.tempo_estimado != null ? '~' + o.tempo_estimado + 'h' : '—'}</td>
        <td>${esc(o.descricao)}</td>
        <td>${o.tem_foto ? `<button class="link" data-acao="foto" data-id="${o.id_os}">Ver</button>` : '—'}</td>
        <td class="acoes">${botoesOS(o)}</td></tr>`).join('') || '<tr><td colspan="11" class="vazio">Nenhuma OS por aqui ainda</td></tr>'}</tbody></table></div>`;

  $('#fo').onsubmit = tentar(async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('#abrir'); btn.disabled = true;
    try {
      const d = Object.fromEntries(new FormData(f));
      const arq = f.foto.files[0];
      d.foto = arq ? await lerFoto(arq) : null;
      await api('/os', { method: 'POST', body: d });
      toast('Chamado aberto', 'ok');
      telaOS();
    } finally { btn.disabled = false; }
  });
}

function botoesOS(o) {
  const b = [];
  const meu = gerente || (user.perfil === 'tecnico' && o.id_tecnico === user.id_funcionario);
  if (gerente && (o.status === 'Aberta' || o.status === 'Atribuída')) b.push(`<button class="link" data-acao="atribuir" data-id="${o.id_os}">${o.status === 'Aberta' ? 'Atribuir' : 'Reatribuir'}</button>`);
  if (meu && o.status === 'Atribuída') b.push(`<button class="link" data-acao="iniciar" data-id="${o.id_os}">Iniciar</button>`);
  if (meu && o.status === 'Em andamento') b.push(`<button class="link" data-acao="encerrar" data-id="${o.id_os}">Encerrar</button>`);
  return b.join('');
}

// Reduz a foto (celular) para no máx. 1280px em JPEG antes de enviar
function lerFoto(arq) {
  return new Promise((ok, falha) => {
    const img = new Image(), url = URL.createObjectURL(arq);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => falha(new Error('Não foi possível ler a imagem'));
    img.src = url;
  });
}

function modalChamado(idMaquina) {
  abrirModal(`<h2>Abrir chamado · ${esc(idMaquina)}</h2><form id="fc" class="form">
    <label class="campo">Tipo de falha<select name="id_tipo_falha"><option value="">Não sei / n/a</option>${opcoes(tiposFalha, 'id_tipo_falha', 'nome')}</select></label>
    <label class="campo">Foto do defeito<input type="file" name="foto" accept="image/*"></label>
    <label class="campo">O que está acontecendo?<textarea name="descricao" required></textarea></label>
    <div class="form-acoes"><button class="btn verde">Abrir chamado</button><button type="button" class="btn claro" data-acao="fechar">Cancelar</button></div></form>`);
  $('#fc').onsubmit = tentar(async (e) => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f));
    d.id_maquina = idMaquina; d.foto = f.foto.files[0] ? await lerFoto(f.foto.files[0]) : null;
    await api('/os', { method: 'POST', body: d });
    fecharModal(); toast('Chamado aberto', 'ok'); rotear();
  });
}

function modalAtribuir(id) {
  const o = listaOS.find(x => x.id_os == id);
  abrirModal(`<h2>Atribuir OS #${o.id_os} · ${esc(o.id_maquina)}</h2><form id="fa" class="form">
    <label class="campo">Técnico<select name="id_tecnico" required>${opcoes(tecnicos, 'id_funcionario', t => `${t.nome} — ${t.especialidade || t.cargo}`, o.id_tecnico)}</select></label>
    <label class="campo">Tempo estimado (h)<input type="number" name="tempo_estimado" min="0.5" step="0.5" value="${o.tempo_estimado || ''}" required></label>
    <div class="form-acoes"><button class="btn verde">Atribuir</button><button type="button" class="btn claro" data-acao="fechar">Cancelar</button></div></form>`);
  $('#fa').onsubmit = tentar(async (e) => {
    e.preventDefault();
    await api(`/os/${id}/atribuir`, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
    fecharModal(); toast('OS atribuída', 'ok'); telaOS();
  });
}

async function modalEncerrar(id) {
  const o = listaOS.find(x => x.id_os == id);
  const pecas = await api('/pecas');
  abrirModal(`<h2>Encerrar OS #${o.id_os} · ${esc(o.id_maquina)}</h2><form id="fe" class="form">
    <label class="campo">Tempo de reparo (h)<input type="number" name="tempo_reparo" min="0.1" step="0.1" required></label>
    ${o.tipo === 'Corretiva' ? `<label class="campo">Tipo de falha<select name="id_tipo_falha" required><option value="">Selecione</option>${opcoes(tiposFalha, 'id_tipo_falha', 'nome', o.id_tipo_falha)}</select></label>` : ''}
    <div><small style="color:var(--suave)">Peças utilizadas (saem do estoque ao encerrar)</small><div id="linhas"></div>
      <button type="button" class="btn claro mini" data-acao="add-peca">+ Adicionar peça</button></div>
    <div class="form-acoes"><button class="btn verde">Encerrar OS</button><button type="button" class="btn claro" data-acao="fechar">Cancelar</button></div></form>`);
  $('#fe')._pecas = pecas;
  $('#fe').onsubmit = tentar(async (e) => {
    e.preventDefault();
    const f = e.target;
    const itens = [...f.querySelectorAll('.linha-peca')].map(l => ({ id_peca: l.querySelector('select').value, quantidade: l.querySelector('input').value })).filter(i => i.id_peca);
    await api(`/os/${id}/concluir`, { method: 'PATCH', body: { tempo_reparo: f.tempo_reparo.value, id_tipo_falha: f.id_tipo_falha?.value || null, pecas: itens } });
    fecharModal(); toast('OS encerrada. Estoque atualizado', 'ok'); telaOS();
  });
}
function addLinhaPeca() {
  const f = $('#fe');
  const l = document.createElement('div'); l.className = 'linha-peca';
  l.innerHTML = `<select><option value="">Selecione a peça</option>${opcoes(f._pecas, 'id_peca', p => `${p.nome} (estoque ${p.estoque_atual})`)}</select>
    <input type="number" min="1" step="1" value="1" aria-label="Quantidade"><button type="button" class="btn claro mini" data-acao="rm-peca" aria-label="Remover">×</button>`;
  $('#linhas').append(l);
}

/* =========================================================
   RELATÓRIOS (gerente)
   ========================================================= */
async function telaRelatorios() {
  const r = await api('/relatorios');
  const s = r.resumo, p = r.projecao_30d;
  const mes = (m) => m.slice(5) + '/' + m.slice(0, 4);
  view.innerHTML = `
    <div class="acoes-topo" style="justify-content:flex-end;margin-bottom:16px">
      <button class="btn verde" data-acao="imprimir">Imprimir / PDF</button>
      <button class="btn" data-acao="csv">Exportar CSV</button></div>
    <div class="grade g2">
      <div class="card"><h2>Falhas por máquina</h2>${barrasH(r.falhas_por_maquina, { rotulo: 'id_maquina', valor: 'falhas', cor: 'r' })}
        <h2 style="margin-top:18px">Máquina com mais avarias em cada mês</h2>
        ${r.lider_por_mes.length ? `<table style="min-width:0"><tbody>${r.lider_por_mes.map(l => `<tr><td>${mes(l.mes)}</td><td><b>${esc(l.id_maquina)}</b></td><td>${l.falhas} avaria(s)</td></tr>`).join('')}</tbody></table>` : '<p class="vazio">Sem avarias registradas</p>'}</div>
      <div class="card"><h2>Horas produtivas perdidas por setor</h2>${barrasH(r.horas_por_setor, { rotulo: 'setor', valor: 'horas', sufixo: 'h', cor: 'v' })}</div>
      <div class="card"><h2>Tempo médio de reparo por tipo de falha</h2>${barrasH(r.mttr_por_tipo, { rotulo: 'tipo_falha', valor: 'mttr', sufixo: 'h' })}</div>
      <div class="card"><h2>Preventivas concluídas por técnico</h2>${barrasH(r.preventivas_por_tecnico, { rotulo: 'tecnico', valor: 'preventivas' })}</div>
      <div class="card resumo"><h2>Resumo</h2>
        <p><span>OS concluídas</span><b>${s.total_ordens}</b></p><p><span>Tempo médio de reparo</span><b>${s.tempo_medio}h</b></p>
        <p><span>Horas totais de reparo</span><b>${s.horas_totais}h</b></p><p><span>Custo em peças</span><b>${brl(s.custo_pecas)}</b></p>
        <p><span>Disponibilidade</span><b>${s.disponibilidade}%</b></p></div>
      <div class="card resumo"><h2>Projeção de custos · próximos 30 dias</h2>
        <p><span>OS pendentes / agendadas</span><b>${p.os_pendentes}</b></p><p><span>Peças (média histórica por OS)</span><b>${brl(p.pecas)}</b></p>
        <p><span>Mão de obra (${brl(p.custo_hora)}/h)</span><b>${brl(p.mao_de_obra)}</b></p>
        <p><span>Total estimado</span><b>${brl(p.pecas + p.mao_de_obra)}</b></p></div>
    </div>`;
}

async function baixarCSV() {
  const r = await fetch('/api/relatorios/csv', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Não foi possível exportar');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob()); a.download = 'relatorio-manutencao.csv'; a.click();
  URL.revokeObjectURL(a.href);
}

/* =========================================================
   Ações (delegação de eventos)
   ========================================================= */
const confirmarExclusao = (txt) => confirm(`Excluir ${txt}? Esta ação não pode ser desfeita.`);
const ACOES = {
  fechar: fecharModal,
  qr: (d) => mostrarQR(d.id),
  'imprimir-qr': () => window.print(),
  imprimir: () => window.print(),
  csv: baixarCSV,
  chamado: (d) => modalChamado(d.id),
  atribuir: (d) => modalAtribuir(d.id),
  encerrar: (d) => modalEncerrar(d.id),
  'add-peca': addLinhaPeca,
  'rm-peca': (_d, el) => el.closest('.linha-peca').remove(),
  iniciar: async (d) => { await api(`/os/${d.id}/iniciar`, { method: 'PATCH' }); toast('OS iniciada', 'ok'); telaOS(); },
  foto: async (d) => { const r = await api(`/os/${d.id}/foto`); abrirModal(`<h2>Foto da OS #${esc(d.id)}</h2><img class="foto" src="${esc(r.foto)}" alt="Foto do defeito"><div class="form-acoes" style="margin-top:14px"><button class="btn claro" data-acao="fechar">Fechar</button></div>`); },
  'editar-maq': (d) => {
    const m = listaMaquinas.find(x => x.id_maquina === d.id), f = $('#fm');
    for (const k of ['id_maquina', 'modelo', 'id_setor', 'data_aquisicao', 'ultima_manutencao', 'horas_funcionamento', 'limite_horas']) f[k].value = m[k] ?? '';
    f.id_maquina.readOnly = true; $('#cancelar').classList.remove('oculto'); f.scrollIntoView({ behavior: 'smooth' });
  },
  'excluir-maq': async (d) => { if (confirmarExclusao(`a máquina ${d.id}`)) { await api(`/maquinas/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); toast('Máquina excluída', 'ok'); telaMaquinas(); } },
  'editar-func': (d) => {
    const x = listaFunc.find(y => y.id_funcionario === d.id), f = $('#ff');
    for (const k of ['id_funcionario', 'nome', 'cargo', 'turno', 'especialidade']) f[k].value = x[k] ?? '';
    f.id_funcionario.readOnly = true; f.querySelectorAll('[data-login]').forEach(l => l.classList.add('oculto'));
    $('#cancelar').classList.remove('oculto'); f.scrollIntoView({ behavior: 'smooth' });
  },
  'excluir-func': async (d) => { if (confirmarExclusao(`o funcionário ${d.id}`)) { await api(`/funcionarios/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); toast('Funcionário excluído', 'ok'); telaFuncionarios(); } },
  'editar-peca': (d) => {
    const p = listaPecas.find(x => x.id_peca == d.id), f = $('#fp');
    for (const k of ['id_peca', 'nome', 'estoque_atual', 'estoque_minimo', 'custo_unitario']) f[k].value = p[k];
    $('#cancelar').classList.remove('oculto'); f.scrollIntoView({ behavior: 'smooth' });
  },
  'excluir-peca': async (d) => { if (confirmarExclusao('esta peça')) { await api(`/pecas/${d.id}`, { method: 'DELETE' }); toast('Peça excluída', 'ok'); telaEstoque(); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-acao]');
  if (el && ACOES[el.dataset.acao]) tentar(ACOES[el.dataset.acao])(el.dataset, el);
});

rotear();
