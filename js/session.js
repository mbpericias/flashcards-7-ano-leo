/* session.js — montagem e condução das sessões de estudo e do simulado.
   Sessões curtas, adequadas a um estudante de 12 anos. */
window.App = window.App || {};

App.session = (function () {
  "use strict";
  var util = App.util, srs = App.srs, content = App.content, state = App.state;

  // Modos de sessão disponíveis (rótulos amigáveis).
  var MODOS = [
    { id: "revisao", rotulo: "Revisão inteligente", dica: "Mistura cartões para revisar hoje com alguns novos." },
    { id: "novos", rotulo: "Cartões novos", dica: "Só cartões que você ainda não estudou." },
    { id: "erros", rotulo: "Meus erros", dica: "Cartões em que você errou na última vez." },
    { id: "dificeis", rotulo: "Difíceis", dica: "Cartões que ainda estão custando a entrar na cabeça." },
    { id: "certo_errado", rotulo: "Certo ou errado", dica: "Só perguntas de certo ou errado." },
    { id: "comparacao", rotulo: "Comparação entre grupos", dica: "Cartões que comparam grupos e características." },
    { id: "favoritos", rotulo: "Favoritos", dica: "Cartões que você marcou com estrela." }
  ];

  var atual = null;

  // ------------------------------------------------------------------
  // Seleção de cartões
  // ------------------------------------------------------------------
  function poolPorEscopo(escopo) {
    escopo = escopo || {};
    if (escopo.ids && escopo.ids.length) {
      return escopo.ids.map(content.getById).filter(Boolean);
    }
    if (escopo.disciplina) {
      return content.cardsDe(escopo.disciplina, escopo.assunto || null, escopo.subassunto || null);
    }
    return content.getAll();
  }

  function filtrarPorModo(pool, modo) {
    var agora = new Date();
    var prog = state.todoProgresso();
    function p(c) { return prog[c.id] || null; }

    switch (modo) {
      case "lista":
        return pool.slice();
      case "novos":
        return pool.filter(function (c) { return srs.eNovo(p(c)); })
          .sort(function (a, b) { return b.prioridade - a.prioridade; });
      case "erros":
        return pool.filter(function (c) { return srs.temErroRecente(p(c)); });
      case "dificeis":
        return pool.filter(function (c) { return srs.eDificil(p(c)); });
      case "certo_errado":
        return pool.filter(function (c) { return c.tipo === "certo_errado"; });
      case "comparacao":
        return pool.filter(function (c) { return c.tipo === "comparacao"; });
      case "favoritos":
        return pool.filter(function (c) { return state.isFavorito(c.id); });
      case "revisao":
      default:
        var devidos = pool.filter(function (c) { return srs.estaDevido(p(c), agora); })
          .sort(function (a, b) {
            var pa = p(a), pb = p(b);
            var da = pa && pa.proximaRevisao ? pa.proximaRevisao : "";
            var db = pb && pb.proximaRevisao ? pb.proximaRevisao : "";
            return da < db ? -1 : da > db ? 1 : b.prioridade - a.prioridade;
          });
        var novos = pool.filter(function (c) { return srs.eNovo(p(c)); })
          .sort(function (a, b) { return b.prioridade - a.prioridade; });
        return devidos.concat(novos);
    }
  }

  function contar(opts) {
    return filtrarPorModo(poolPorEscopo(opts.escopo), opts.modo || "revisao").length;
  }

  // ------------------------------------------------------------------
  // Construção da sessão
  // ------------------------------------------------------------------
  function construir(opts) {
    opts = opts || {};
    var modo = opts.modo || "revisao";
    var lista = filtrarPorModo(poolPorEscopo(opts.escopo), modo);

    if (modo === "novos" || modo === "certo_errado" || modo === "comparacao" || modo === "favoritos" || modo === "lista") {
      // mantém ordem já definida
    } else if (modo === "revisao") {
      // ordem já definida (devidos, depois novos)
    } else {
      lista = util.shuffle(lista);
    }

    var qtd = opts.quantidade;
    if (qtd !== "todos" && qtd != null) {
      var n = parseInt(qtd, 10);
      if (!isNaN(n) && n > 0) lista = lista.slice(0, n);
    }

    atual = {
      modo: modo,
      escopo: opts.escopo || {},
      titulo: opts.titulo || rotuloModo(modo),
      fila: lista.map(function (c) { return c.id; }),
      planejado: lista.length,
      pos: 0,
      concluidos: {},        // id -> true (contabilizado na barra)
      lapsos: {},            // id -> nº de vezes que voltou por "errei"/"dificil"
      respostas: [],         // [{ id, nota }]
      iniciadoEm: util.nowISO()
    };
    return resumo();
  }

  function construirLista(ids, titulo) {
    return construir({ modo: "lista", escopo: { ids: ids }, quantidade: "todos", titulo: titulo || "Revisar erros" });
  }

  function rotuloModo(id) {
    for (var i = 0; i < MODOS.length; i++) if (MODOS[i].id === id) return MODOS[i].rotulo;
    return "Estudo";
  }

  // ------------------------------------------------------------------
  // Condução
  // ------------------------------------------------------------------
  function ativa() { return !!atual && atual.pos < atual.fila.length; }
  function resumo() {
    return {
      titulo: atual.titulo, modo: atual.modo, escopo: atual.escopo,
      planejado: atual.planejado, restantesNaFila: atual.fila.length
    };
  }
  function cartaoAtual() { return atual ? content.getById(atual.fila[atual.pos]) : null; }

  function progressoInfo() {
    var feitos = Object.keys(atual.concluidos).length;
    var naFila = Math.max(0, atual.fila.length - atual.pos); // ainda por mostrar (inclui os que voltaram)
    return {
      feitos: feitos,
      total: atual.planejado,
      restantes: naFila,
      posicao: Math.min(feitos + 1, atual.planejado),
      pct: util.pct(feitos, atual.planejado)
    };
  }

  // Registra a avaliação do cartão atual e decide se ele volta nesta sessão.
  function responder(nota) {
    var card = cartaoAtual();
    if (!card) return { fim: true };

    state.registrarRevisao(card, nota);
    atual.respostas.push({ id: card.id, nota: nota });

    var restantes = atual.fila.length - atual.pos - 1;

    if (nota === "errei") {
      if (restantes >= 1 && atual.planejado > 1) {
        var gap = Math.min(3, Math.max(1, restantes));
        inserir(atual.pos + 1 + gap, card.id);
        atual.lapsos[card.id] = (atual.lapsos[card.id] || 0) + 1;
      }
      // não marca como concluído: precisa acertar depois
    } else if (nota === "dificil" && !atual.concluidos[card.id] && !atual.lapsos[card.id] && restantes >= 2) {
      var gap2 = Math.min(6, Math.max(2, restantes));
      inserir(atual.pos + 1 + gap2, card.id);
      atual.lapsos[card.id] = (atual.lapsos[card.id] || 0) + 1;
      atual.concluidos[card.id] = true; // conta na barra, mas ainda reaparece uma vez
    } else {
      atual.concluidos[card.id] = true;
    }

    atual.pos += 1;
    if (atual.pos >= atual.fila.length) return finalizar();
    return { fim: false };
  }

  function inserir(idx, id) {
    idx = Math.min(idx, atual.fila.length);
    atual.fila.splice(idx, 0, id);
  }

  function pular() {
    if (!ativa()) return { fim: true };
    atual.pos += 1;
    if (atual.pos >= atual.fila.length) return finalizar();
    return { fim: false };
  }

  function finalizar() {
    var r = atual.respostas;
    var acertos = 0, erros = 0, dificeis = 0;
    r.forEach(function (x) {
      if (x.nota === "acertei" || x.nota === "facil") acertos += 1;
      else if (x.nota === "errei") erros += 1;
      else if (x.nota === "dificil") dificeis += 1;
    });
    state.registrarSessaoConcluida("estudo");
    var resumoFinal = {
      fim: true,
      titulo: atual.titulo,
      avaliacoes: r.length,
      cartoesUnicos: Object.keys(atual.concluidos).length + Object.keys(atual.lapsos).filter(function (id) { return !atual.concluidos[id]; }).length,
      acertos: acertos, erros: erros, dificeis: dificeis,
      taxa: util.pct(acertos, r.length),
      errados: r.filter(function (x) { return x.nota === "errei"; }).map(function (x) { return x.id; })
    };
    atual = null;
    return resumoFinal;
  }

  function abortar() {
    var houve = atual && atual.respostas.length;
    if (houve) state.registrarSessaoConcluida("estudo");
    atual = null;
  }

  return {
    MODOS: MODOS,
    contar: contar, construir: construir, construirLista: construirLista,
    ativa: ativa, resumo: resumo, cartaoAtual: cartaoAtual, progressoInfo: progressoInfo,
    responder: responder, pular: pular, abortar: abortar, rotuloModo: rotuloModo
  };
})();


/* ---------------------------------------------------------------------------
   simulado.js embutido — modo Simulado (correção objetiva, resultado ao final)
   --------------------------------------------------------------------------- */
App.simulado = (function () {
  "use strict";
  var util = App.util, content = App.content, state = App.state;

  var atual = null;

  function elegivel(c) {
    if (c.tipo === "certo_errado") return typeof c.gabarito === "boolean";
    if (c.tipo === "multipla_escolha") return Array.isArray(c.alternativas) && c.alternativas.length >= 2 && c.correta != null;
    return false;
  }

  function pool(escopo) {
    var base = (escopo && escopo.disciplina)
      ? content.cardsDe(escopo.disciplina, escopo.assunto || null, escopo.subassunto || null)
      : content.getAll();
    return base.filter(elegivel);
  }

  function contar(escopo) { return pool(escopo).length; }

  function construir(opts) {
    opts = opts || {};
    var lista = util.shuffle(pool(opts.escopo));
    var qtd = opts.quantidade;
    if (qtd !== "todos" && qtd != null) {
      var n = parseInt(qtd, 10);
      if (!isNaN(n) && n > 0) lista = lista.slice(0, n);
    }
    atual = {
      escopo: opts.escopo || {},
      itens: lista.map(function (c) { return { id: c.id, resposta: null }; }),
      pos: 0,
      iniciadoEm: util.nowISO(),
      gravarNoProgresso: opts.gravarNoProgresso !== false
    };
    return { total: atual.itens.length };
  }

  function ativa() { return !!atual && atual.pos < atual.itens.length; }
  function itemAtual() {
    if (!atual) return null;
    var it = atual.itens[atual.pos];
    return { card: content.getById(it.id), indice: atual.pos, total: atual.itens.length, resposta: it.resposta };
  }
  function responder(valor) {
    if (!atual) return;
    atual.itens[atual.pos].resposta = valor;
  }
  function avancar() {
    if (!atual) return { fim: true };
    atual.pos += 1;
    return atual.pos >= atual.itens.length ? finalizar() : { fim: false };
  }
  function voltar() {
    if (atual && atual.pos > 0) atual.pos -= 1;
  }

  function corrigirItem(it) {
    var c = content.getById(it.id);
    if (!c) return { card: null, correta: false, semResposta: true };
    var acertou = false;
    var respostaTxt = "";
    if (c.tipo === "certo_errado") {
      respostaTxt = it.resposta == null ? "(em branco)" : (it.resposta ? "Certo" : "Errado");
      acertou = it.resposta != null && it.resposta === c.gabarito;
    } else {
      respostaTxt = it.resposta == null ? "(em branco)" : String(it.resposta);
      acertou = it.resposta != null && String(it.resposta) === String(c.correta);
    }
    return { card: c, correta: acertou, semResposta: it.resposta == null, respostaTexto: respostaTxt };
  }

  function finalizar() {
    var itens = atual.itens.map(corrigirItem);
    var total = itens.length;
    var acertos = itens.filter(function (x) { return x.correta; }).length;

    var porAssunto = {}, porSub = {};
    itens.forEach(function (x) {
      if (!x.card) return;
      agrega(porAssunto, x.card.disciplina + " › " + x.card.assunto, x.correta);
      agrega(porSub, x.card.assunto + " › " + x.card.subassunto, x.correta);
    });

    if (atual.gravarNoProgresso) {
      atual.itens.forEach(function (it) {
        var card = content.getById(it.id);
        if (!card) return;
        var c = corrigirItem(it);
        if (c.semResposta) return;
        state.registrarRevisao(card, c.correta ? "acertei" : "errei");
      });
    }
    state.registrarSessaoConcluida("simulado");

    var resultado = {
      total: total,
      acertos: acertos,
      pct: util.pct(acertos, total),
      porAssunto: mapToArray(porAssunto),
      porSubassunto: mapToArray(porSub),
      erradas: itens.filter(function (x) { return !x.correta; }),
      idsErrados: itens.filter(function (x) { return !x.correta && x.card; }).map(function (x) { return x.card.id; })
    };
    atual = null;
    return { fim: true, resultado: resultado };
  }

  function agrega(mapa, chave, acertou) {
    var e = mapa[chave] || { chave: chave, total: 0, acertos: 0 };
    e.total += 1; if (acertou) e.acertos += 1;
    mapa[chave] = e;
  }
  function mapToArray(mapa) {
    return Object.keys(mapa).map(function (k) {
      var e = mapa[k]; e.pct = util.pct(e.acertos, e.total); return e;
    }).sort(function (a, b) { return a.pct - b.pct; });
  }

  function abortar() { atual = null; }

  return {
    contar: contar, construir: construir, ativa: ativa, itemAtual: itemAtual,
    responder: responder, avancar: avancar, voltar: voltar, abortar: abortar, elegivel: elegivel
  };
})();
