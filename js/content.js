/* content.js — camada de CONTEÚDO.
   Carrega o catálogo e os bancos de flashcards (arquivos JSON em data/),
   junta com os bancos importados pelo usuário e monta a hierarquia
   disciplina -> assunto -> subassunto de forma dinâmica.

   O MOTOR do aplicativo (app.js, state.js, ui.js, srs.js...) nunca precisa
   ser alterado para incluir novas disciplinas, assuntos ou bancos.
   Basta acrescentar o arquivo JSON em data/ e citá-lo em data/catalog.json. */
window.App = window.App || {};

App.content = (function () {
  "use strict";
  var util = App.util;

  var K_IMPORTED = "app.content.imported";     // [ card, ... ]  -> bancos adicionados pelo usuário
  var K_SUPPRESSED = "app.content.suppressed";  // [ id, ... ]     -> cartões oficiais ocultados pelo responsável
  var K_OVERRIDES = "app.content.overrides";     // { id: card }    -> edições feitas pelo responsável
  var K_CACHE = "app.content.officialCache";     // cópia do conteúdo oficial para uso offline

  var TIPOS_CONHECIDOS = [
    "pergunta_direta", "certo_errado", "multipla_escolha", "completar", "comparacao"
  ];

  var state = {
    catalogo: null,
    oficiais: [],        // cartões vindos do catálogo (ordem de carregamento)
    importados: [],
    suprimidos: {},
    overrides: {},
    porId: {},           // id -> card efetivo
    ordem: [],           // ids na ordem de descoberta
    arvore: null,
    avisos: []           // mensagens para o responsável (ex.: IDs duplicados)
  };

  // ------------------------------------------------------------------
  // Carregamento
  // ------------------------------------------------------------------
  function fetchJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " em " + url);
      return r.json();
    });
  }

  function init() {
    state.importados = util.storage.load(K_IMPORTED, []);
    state.overrides = util.storage.load(K_OVERRIDES, {});
    (util.storage.load(K_SUPPRESSED, [])).forEach(function (id) { state.suprimidos[id] = true; });

    return carregarOficiais().then(function (res) {
      state.catalogo = res.catalogo;
      state.oficiais = res.cards;
      rebuild();
      return snapshot();
    });
  }

  function carregarOficiais() {
    var embedded = App.embeddedContent || null;

    return fetchJSON("data/catalog.json").then(function (cat) {
      var bancos = (cat && cat.bancos) || [];
      return Promise.all(bancos.map(function (b) {
        return fetchJSON(b.arquivo)
          .then(function (data) { return { banco: b, data: data }; })
          .catch(function (err) {
            console.warn("Falha ao carregar", b.arquivo, "-", err.message);
            if (embedded && embedded.banks && embedded.banks[b.id]) {
              return { banco: b, data: embedded.banks[b.id] };
            }
            return { banco: b, data: { cards: [] } };
          });
      })).then(function (partes) {
        var cards = juntarBancos(partes);
        util.storage.save(K_CACHE, { catalogo: cat, cards: cards });
        return { catalogo: cat, cards: cards };
      });
    }).catch(function (err) {
      console.warn("Sem acesso a data/catalog.json (" + err.message + "). Usando conteúdo local embutido.");
      var cache = util.storage.load(K_CACHE, null);
      if (cache && cache.cards && cache.cards.length) return cache;
      if (embedded) {
        var partes = (embedded.catalog.bancos || []).map(function (b) {
          return { banco: b, data: embedded.banks[b.id] || { cards: [] } };
        });
        return { catalogo: embedded.catalog, cards: juntarBancos(partes) };
      }
      return { catalogo: { titulo: "Estudo de Ciências", ano_escolar: "", bancos: [] }, cards: [] };
    });
  }

  function juntarBancos(partes) {
    var vistos = {};
    var out = [];
    partes.forEach(function (p) {
      var lista = (p.data && p.data.cards) || [];
      lista.forEach(function (raw) {
        var card = normalizarCard(raw, (p.data && p.data.fonte) || "");
        if (!card.id) {
          state.avisos.push("Cartão sem id ignorado no banco " + (p.banco && p.banco.id));
          return;
        }
        if (vistos[card.id]) {
          state.avisos.push("ID repetido nos bancos oficiais: " + card.id + " (mantida a primeira ocorrência)");
          return;
        }
        vistos[card.id] = true;
        card._banco = p.banco && p.banco.id;
        out.push(card);
      });
    });
    return out;
  }

  function normalizarCard(raw, fonteBanco) {
    var c = {};
    for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) c[k] = raw[k];
    c.id = String(c.id || "").trim();
    c.disciplina = (c.disciplina || "").trim() || "Sem disciplina";
    c.assunto = (c.assunto || "").trim() || "Sem assunto";
    c.subassunto = (c.subassunto || "").trim() || "Geral";
    c.tipo = (c.tipo || "pergunta_direta").trim();
    c.pergunta = (c.pergunta || "").trim();
    c.resposta = (c.resposta || "").trim();
    c.explicacao = (c.explicacao || "").trim();
    c.fonte = (c.fonte || fonteBanco || "").trim();
    c.ano_escolar = (c.ano_escolar || "").trim();
    c.pegadinha = c.pegadinha === true;
    var p = parseInt(c.prioridade, 10);
    c.prioridade = isNaN(p) ? 3 : util.clamp(p, 1, 5);
    if (c.tipo === "multipla_escolha" && Array.isArray(c.alternativas)) {
      c.alternativas = c.alternativas.map(function (a) { return String(a); });
    }
    return c;
  }

  // ------------------------------------------------------------------
  // Reconstrução do índice e da árvore
  // ------------------------------------------------------------------
  function rebuild() {
    state.porId = {};
    state.ordem = [];

    function adicionar(card) {
      if (state.suprimidos[card.id]) return;
      if (!state.porId[card.id]) state.ordem.push(card.id);
      var efetivo = card;
      if (state.overrides[card.id]) {
        efetivo = normalizarCard(mesclar(card, state.overrides[card.id]), card.fonte);
        efetivo._banco = card._banco;
        efetivo._editado = true;
      }
      state.porId[card.id] = efetivo;
    }

    state.oficiais.forEach(function (c) { c._oficial = true; adicionar(c); });
    state.importados.forEach(function (c) {
      var card = normalizarCard(c, "");
      card._importado = true;
      if (state.suprimidos[card.id]) return;
      if (state.porId[card.id]) {
        // Já existe (oficial ou importado anterior): nunca sobrescreve automaticamente.
        return;
      }
      if (state.overrides[card.id]) {
        card = normalizarCard(mesclar(card, state.overrides[card.id]), "");
        card._importado = true;
        card._editado = true;
      }
      state.ordem.push(card.id);
      state.porId[card.id] = card;
    });

    state.arvore = montarArvore(state.ordem.map(function (id) { return state.porId[id]; }));
    util.emit("content-changed", snapshot());
  }

  function mesclar(base, patch) {
    var o = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k];
    for (var j in patch) if (Object.prototype.hasOwnProperty.call(patch, j)) o[j] = patch[j];
    o.id = base.id; // id é imutável
    return o;
  }

  function montarArvore(cards) {
    var arvore = { ordem: [], map: {} };
    cards.forEach(function (card) {
      var d = card.disciplina, a = card.assunto, s = card.subassunto;
      if (!arvore.map[d]) { arvore.map[d] = { nome: d, ordem: [], map: {} }; arvore.ordem.push(d); }
      var nd = arvore.map[d];
      if (!nd.map[a]) { nd.map[a] = { nome: a, ordem: [], map: {} }; nd.ordem.push(a); }
      var na = nd.map[a];
      if (!na.map[s]) { na.map[s] = { nome: s, ids: [] }; na.ordem.push(s); }
      na.map[s].ids.push(card.id);
    });
    return arvore;
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  function snapshot() {
    return {
      titulo: (state.catalogo && state.catalogo.titulo) || "Estudo de Ciências",
      ano_escolar: (state.catalogo && state.catalogo.ano_escolar) || "",
      total: state.ordem.length,
      avisos: state.avisos.slice()
    };
  }
  function meta() { return snapshot(); }
  function getAll() { return state.ordem.map(function (id) { return state.porId[id]; }); }
  function getById(id) { return state.porId[id] || null; }
  function exists(id) { return !!state.porId[id]; }
  function tree() { return state.arvore; }
  function avisos() { return state.avisos.slice(); }

  function disciplinas() { return state.arvore.ordem.slice(); }
  function assuntos(disc) {
    var nd = state.arvore.map[disc];
    return nd ? nd.ordem.slice() : [];
  }
  function subassuntos(disc, assunto) {
    var nd = state.arvore.map[disc];
    var na = nd && nd.map[assunto];
    return na ? na.ordem.slice() : [];
  }
  function idsDe(disc, assunto, sub) {
    var nd = state.arvore.map[disc];
    if (!nd) return [];
    if (!assunto) {
      var acc = [];
      nd.ordem.forEach(function (a) {
        nd.map[a].ordem.forEach(function (s) { acc = acc.concat(nd.map[a].map[s].ids); });
      });
      return acc;
    }
    var na = nd.map[assunto];
    if (!na) return [];
    if (!sub) {
      var out = [];
      na.ordem.forEach(function (s) { out = out.concat(na.map[s].ids); });
      return out;
    }
    return na.map[sub] ? na.map[sub].ids.slice() : [];
  }
  function cardsDe(disc, assunto, sub) {
    return idsDe(disc, assunto, sub).map(getById).filter(Boolean);
  }

  function tipos() {
    var set = {};
    getAll().forEach(function (c) { set[c.tipo] = true; });
    return Object.keys(set);
  }
  function tiposConhecidos() { return TIPOS_CONHECIDOS.slice(); }

  // ------------------------------------------------------------------
  // Alterações (importação incremental, edição e exclusão)
  // ------------------------------------------------------------------
  function addImportados(cards) {
    var adicionados = 0;
    cards.forEach(function (raw) {
      var card = normalizarCard(raw, "");
      if (!card.id) return;
      if (exists(card.id)) return;            // nunca sobrescreve
      if (state.suprimidos[card.id]) {        // estava oculto: reativa com o novo conteúdo
        delete state.suprimidos[card.id];
        salvarSuprimidos();
      }
      state.importados.push(card);
      adicionados++;
    });
    if (adicionados) { salvarImportados(); rebuild(); }
    return adicionados;
  }

  // Atualização explícita de um cartão existente. Preserva o id e o histórico.
  function updateCard(id, patch) {
    var atual = getById(id);
    if (!atual) return false;
    if (atual._importado && !atual._oficial) {
      // edita direto no banco importado
      for (var i = 0; i < state.importados.length; i++) {
        if (state.importados[i].id === id) {
          state.importados[i] = normalizarCard(mesclar(state.importados[i], patch), "");
          break;
        }
      }
      salvarImportados();
    } else {
      // cartão oficial: guarda a diferença como override (não altera os arquivos data/)
      state.overrides[id] = mesclar(state.overrides[id] || {}, patch);
      delete state.overrides[id].id;
      salvarOverrides();
    }
    rebuild();
    return true;
  }

  function deleteCard(id) {
    var atual = getById(id);
    if (!atual) return false;
    if (atual._importado && !atual._oficial) {
      state.importados = state.importados.filter(function (c) { return c.id !== id; });
      salvarImportados();
    } else {
      state.suprimidos[id] = true;
      salvarSuprimidos();
    }
    rebuild();
    return true;
  }

  function restoreCard(id) {
    if (state.suprimidos[id]) {
      delete state.suprimidos[id];
      salvarSuprimidos();
      rebuild();
      return true;
    }
    return false;
  }

  function ocultados() {
    return Object.keys(state.suprimidos).map(function (id) {
      var oficial = null;
      for (var i = 0; i < state.oficiais.length; i++) if (state.oficiais[i].id === id) { oficial = state.oficiais[i]; break; }
      return oficial || { id: id, pergunta: "(cartão)" };
    });
  }

  function salvarImportados() { util.storage.save(K_IMPORTED, state.importados); }
  function salvarOverrides() { util.storage.save(K_OVERRIDES, state.overrides); }
  function salvarSuprimidos() { util.storage.save(K_SUPPRESSED, Object.keys(state.suprimidos)); }

  // ------------------------------------------------------------------
  // Import/export para backup
  // ------------------------------------------------------------------
  function exportarCamadaUsuario() {
    return {
      importados: state.importados,
      suprimidos: Object.keys(state.suprimidos),
      overrides: state.overrides
    };
  }
  function importarCamadaUsuario(obj) {
    obj = obj || {};
    state.importados = Array.isArray(obj.importados) ? obj.importados : [];
    state.overrides = obj.overrides && typeof obj.overrides === "object" ? obj.overrides : {};
    state.suprimidos = {};
    (Array.isArray(obj.suprimidos) ? obj.suprimidos : []).forEach(function (id) { state.suprimidos[id] = true; });
    salvarImportados(); salvarOverrides(); salvarSuprimidos();
    rebuild();
  }

  return {
    init: init, meta: meta, snapshot: snapshot,
    getAll: getAll, getById: getById, exists: exists, tree: tree, avisos: avisos,
    disciplinas: disciplinas, assuntos: assuntos, subassuntos: subassuntos,
    idsDe: idsDe, cardsDe: cardsDe, tipos: tipos, tiposConhecidos: tiposConhecidos,
    addImportados: addImportados, updateCard: updateCard, deleteCard: deleteCard,
    restoreCard: restoreCard, ocultados: ocultados,
    normalizarCard: normalizarCard,
    exportarCamadaUsuario: exportarCamadaUsuario, importarCamadaUsuario: importarCamadaUsuario
  };
})();
