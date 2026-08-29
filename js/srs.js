/* srs.js — repetição espaçada (motor do aplicativo).
   Algoritmo simples, transparente e previsível, inspirado no SM-2.

   Notas de avaliação (o estudante escolhe uma a cada cartão):
     errei    -> intervalo curto, reaparece logo
     dificil  -> intervalo cresce pouco
     acertei  -> intervalo cresce normalmente
     facil    -> intervalo cresce mais

   Um cartão nunca é considerado "Dominado" com um único acerto:
   é preciso ter 3 acertos seguidos e intervalo de pelo menos 7 dias. */
window.App = window.App || {};

App.srs = (function () {
  "use strict";
  var util = App.util;

  var FACIL_INICIAL = 2.4;
  var FACIL_MIN = 1.4;
  var FACIL_MAX = 3.0;
  var INTERVALO_MAX = 365;

  var DOMINIO = [
    { nivel: 0, chave: "praticar", rotulo: "Precisa praticar", cor: "#ef4444", emoji: "🔴" },
    { nivel: 1, chave: "aprendendo", rotulo: "Aprendendo", cor: "#f59e0b", emoji: "🟠" },
    { nivel: 2, chave: "quase", rotulo: "Quase lá", cor: "#eab308", emoji: "🟡" },
    { nivel: 3, chave: "dominado", rotulo: "Dominado", cor: "#22c55e", emoji: "🟢" }
  ];

  function novoProgresso() {
    return {
      revisoes: 0,
      acertos: 0,      // conta "acertei" e "foi fácil"
      erros: 0,        // conta "errei"
      dificeis: 0,     // conta "foi difícil"
      sequencia: 0,    // acertos seguidos (zera ao errar)
      facilidade: FACIL_INICIAL,
      intervalo: 0,    // em dias (0 = revisar já / próxima sessão)
      ultimaRevisao: null,
      proximaRevisao: null,
      dominio: 0,
      historico: [],   // [{ data, nota }]
      criadoEm: util.nowISO()
    };
  }

  function clonar(p) { return JSON.parse(JSON.stringify(p)); }

  // Agenda o próximo aparecimento do cartão a partir da nota dada.
  function agendar(progresso, nota, agoraISO) {
    var agora = agoraISO ? new Date(agoraISO) : new Date();
    var p = progresso ? clonar(progresso) : novoProgresso();

    p.revisoes += 1;
    p.ultimaRevisao = agora.toISOString();

    if (nota === "errei") {
      p.erros += 1;
      p.sequencia = 0;
      p.facilidade = util.clamp(p.facilidade - 0.2, FACIL_MIN, FACIL_MAX);
      p.intervalo = 0;
    } else if (nota === "dificil") {
      p.dificeis += 1;
      // "foi difícil" faz o intervalo crescer pouco, mas sozinho não leva a "Dominado":
      // a sequência de acertos não passa de 2 só com respostas "difícil".
      p.sequencia = Math.min(p.sequencia + 1, 2);
      p.facilidade = util.clamp(p.facilidade - 0.05, FACIL_MIN, FACIL_MAX);
      p.intervalo = p.intervalo <= 0 ? 1 : Math.max(1, Math.round(p.intervalo * 1.2));
    } else if (nota === "acertei") {
      p.acertos += 1;
      p.sequencia += 1;
      p.intervalo = p.intervalo <= 0 ? 1 : (p.intervalo === 1 ? 3 : Math.round(p.intervalo * p.facilidade));
    } else if (nota === "facil") {
      p.acertos += 1;
      p.sequencia += 1;
      p.facilidade = util.clamp(p.facilidade + 0.1, FACIL_MIN, FACIL_MAX);
      p.intervalo = p.intervalo <= 0 ? 2 : (p.intervalo === 1 ? 4 : Math.round(p.intervalo * p.facilidade * 1.4));
    } else {
      return p; // nota desconhecida: não mexe
    }

    p.intervalo = util.clamp(p.intervalo, 0, INTERVALO_MAX);

    var base = util.startOfToday();
    p.proximaRevisao = (p.intervalo <= 0 ? base : util.addDays(base, p.intervalo)).toISOString();

    p.historico.push({ data: agora.toISOString(), nota: nota });
    if (p.historico.length > 60) p.historico = p.historico.slice(-60);

    p.dominio = nivelDominio(p);
    return p;
  }

  function nivelDominio(p) {
    if (!p || p.revisoes === 0) return 0;
    var ultima = p.historico.length ? p.historico[p.historico.length - 1].nota : null;
    if (ultima === "errei") return 0;
    if (p.sequencia >= 3 && p.intervalo >= 7) return 3;
    if (p.sequencia >= 2) return 2;
    if (p.sequencia >= 1) return 1;
    return 0;
  }

  function infoDominio(nivel) { return DOMINIO[util.clamp(nivel || 0, 0, 3)]; }

  // Situação do cartão hoje, para montar as sessões.
  function situacao(p, agora) {
    agora = agora || new Date();
    if (!p || p.revisoes === 0) return "novo";
    if (!p.proximaRevisao) return "novo";
    return new Date(p.proximaRevisao) <= agora ? "revisar" : "em_dia";
  }

  function estaDevido(p, agora) { return situacao(p, agora) === "revisar"; }

  function eNovo(p) { return !p || p.revisoes === 0; }

  // Cartão "difícil": última nota fraca ou facilidade baixa.
  function eDificil(p) {
    if (!p || p.revisoes === 0) return false;
    var ultima = p.historico.length ? p.historico[p.historico.length - 1].nota : null;
    if (ultima === "errei" || ultima === "dificil") return true;
    return p.facilidade < 2.0 || p.dominio <= 1 && p.revisoes >= 2 && ultima !== "facil";
  }

  // Cartão com "erro recente": errou na última avaliação.
  function temErroRecente(p) {
    if (!p || !p.historico.length) return false;
    return p.historico[p.historico.length - 1].nota === "errei";
  }

  function taxaAcerto(p) {
    if (!p || p.revisoes === 0) return null;
    return util.pct(p.acertos, p.revisoes);
  }

  return {
    novoProgresso: novoProgresso,
    agendar: agendar,
    nivelDominio: nivelDominio,
    infoDominio: infoDominio,
    situacao: situacao,
    estaDevido: estaDevido,
    eNovo: eNovo,
    eDificil: eDificil,
    temErroRecente: temErroRecente,
    taxaAcerto: taxaAcerto,
    DOMINIO: DOMINIO,
    NOTAS: ["errei", "dificil", "acertei", "facil"]
  };
})();
