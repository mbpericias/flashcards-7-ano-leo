/* state.js — estado pessoal do estudante (motor do aplicativo).
   Guarda, separado do conteúdo:
     - progresso por cartão (revisões, acertos, erros, domínio, intervalo, histórico...)
     - estatísticas diárias
     - sequência de dias estudados
     - configurações
     - favoritos

   Novos bancos oficiais NUNCA apagam nem zeram este estado.
   Só a restauração de backup pode substituir tudo (com confirmação). */
window.App = window.App || {};

App.state = (function () {
  "use strict";
  var util = App.util, srs = App.srs;

  var K = {
    progresso: "app.progress",
    config: "app.config",
    stats: "app.stats",
    streak: "app.streak",
    favoritos: "app.favorites"
  };

  var CONFIG_PADRAO = {
    metaDiaria: 15,
    tamanhoSessaoPadrao: 10,
    mostrarAtalhos: true,
    tema: "auto"        // auto | claro | escuro
  };

  var progresso = util.storage.load(K.progresso, {});
  var config = mescladoComPadrao(util.storage.load(K.config, {}));
  var stats = util.storage.load(K.stats, { dias: {}, totalEstudados: 0, totalSessoes: 0, totalSimulados: 0 });
  var streak = util.storage.load(K.streak, { atual: 0, recorde: 0, ultimoDia: null });
  var favoritos = util.storage.load(K.favoritos, []);

  function mescladoComPadrao(c) {
    var o = {};
    Object.keys(CONFIG_PADRAO).forEach(function (k) {
      o[k] = (c && c[k] != null) ? c[k] : CONFIG_PADRAO[k];
    });
    return o;
  }

  // ------------------------------------------------------------------
  // Progresso
  // ------------------------------------------------------------------
  function getProgresso(id) { return progresso[id] || null; }
  function todoProgresso() { return progresso; }

  function registrarRevisao(card, nota) {
    var novo = srs.agendar(progresso[card.id] || null, nota, util.nowISO());
    progresso[card.id] = novo;
    util.storage.save(K.progresso, progresso);

    var dk = util.dayKey();
    var dia = stats.dias[dk] || { estudados: 0, acertos: 0, erros: 0, dificeis: 0 };
    dia.estudados += 1;
    if (nota === "acertei" || nota === "facil") dia.acertos += 1;
    else if (nota === "errei") dia.erros += 1;
    else if (nota === "dificil") dia.dificeis += 1;
    stats.dias[dk] = dia;
    stats.totalEstudados += 1;
    util.storage.save(K.stats, stats);

    atualizarSequencia(dk);
    util.emit("progress-changed", { cardId: card.id, nota: nota });
    return novo;
  }

  function atualizarSequencia(dk) {
    if (streak.ultimoDia === dk) return;
    if (streak.ultimoDia && util.daysBetweenKeys(streak.ultimoDia, dk) === 1) {
      streak.atual += 1;
    } else {
      streak.atual = 1;
    }
    streak.recorde = Math.max(streak.recorde || 0, streak.atual);
    streak.ultimoDia = dk;
    util.storage.save(K.streak, streak);
  }

  // A sequência "quebra" se passou mais de 1 dia sem estudar.
  function sequenciaAtual() {
    if (!streak.ultimoDia) return 0;
    var hoje = util.dayKey();
    var dif = util.daysBetweenKeys(streak.ultimoDia, hoje);
    if (dif <= 0) return streak.atual;
    if (dif === 1) return streak.atual; // ontem: ainda vale, pode continuar hoje
    return 0;
  }
  function sequenciaRecorde() { return streak.recorde || 0; }

  // ------------------------------------------------------------------
  // Estatísticas
  // ------------------------------------------------------------------
  function statsHoje() {
    return stats.dias[util.dayKey()] || { estudados: 0, acertos: 0, erros: 0, dificeis: 0 };
  }
  function metaDiaria() {
    var h = statsHoje();
    var meta = config.metaDiaria;
    return { feito: h.estudados, meta: meta, pct: util.pct(h.estudados, meta), atingida: h.estudados >= meta };
  }
  function statsGerais() { return stats; }

  function contarSituacoes(ids) {
    var agora = new Date();
    var r = { total: 0, novos: 0, revisar: 0, emDia: 0, estudados: 0, dominados: 0, dificeis: 0, errosRecentes: 0, somaTaxa: 0, comTaxa: 0 };
    (ids || []).forEach(function (id) {
      var p = progresso[id];
      r.total += 1;
      var s = srs.situacao(p, agora);
      if (s === "novo") r.novos += 1;
      else { r.estudados += 1; if (s === "revisar") r.revisar += 1; else r.emDia += 1; }
      if (p) {
        if (p.dominio >= 3) r.dominados += 1;
        if (srs.eDificil(p)) r.dificeis += 1;
        if (srs.temErroRecente(p)) r.errosRecentes += 1;
        var t = srs.taxaAcerto(p);
        if (t != null) { r.somaTaxa += t; r.comTaxa += 1; }
      }
    });
    r.taxaAcerto = r.comTaxa ? Math.round(r.somaTaxa / r.comTaxa) : null;
    r.pctDominio = util.pct(r.dominados, r.total);
    r.pctEstudado = util.pct(r.estudados, r.total);
    return r;
  }

  function totalDominados() {
    var n = 0;
    Object.keys(progresso).forEach(function (id) { if (progresso[id].dominio >= 3) n += 1; });
    return n;
  }
  function totalRevisoesPrevistas() {
    var agora = new Date(), n = 0;
    App.content.getAll().forEach(function (c) {
      if (srs.situacao(progresso[c.id], agora) === "revisar") n += 1;
    });
    return n;
  }

  // ------------------------------------------------------------------
  // Configurações
  // ------------------------------------------------------------------
  function getConfig() { return mescladoComPadrao(config); }
  function setConfig(patch) {
    Object.keys(patch || {}).forEach(function (k) { config[k] = patch[k]; });
    util.storage.save(K.config, config);
    util.emit("config-changed", getConfig());
  }

  // ------------------------------------------------------------------
  // Favoritos
  // ------------------------------------------------------------------
  function isFavorito(id) { return favoritos.indexOf(id) !== -1; }
  function alternarFavorito(id) {
    var i = favoritos.indexOf(id);
    if (i === -1) favoritos.push(id); else favoritos.splice(i, 1);
    util.storage.save(K.favoritos, favoritos);
    util.emit("progress-changed", { cardId: id, favorito: true });
    return isFavorito(id);
  }
  function listaFavoritos() { return favoritos.slice(); }

  // ------------------------------------------------------------------
  // Backup / restauração
  // ------------------------------------------------------------------
  function exportarTudo() {
    return {
      app: "estudo-ciencias",
      versaoBackup: 2,
      geradoEm: util.nowISO(),
      progresso: progresso,
      config: config,
      stats: stats,
      streak: streak,
      favoritos: favoritos,
      conteudo: App.content.exportarCamadaUsuario()
    };
  }

  function importarTudo(obj) {
    if (!obj || typeof obj !== "object") throw new Error("Arquivo de backup inválido.");
    if (!obj.progresso || typeof obj.progresso !== "object") throw new Error("Backup sem dados de progresso.");
    progresso = obj.progresso || {};
    config = mescladoComPadrao(obj.config || {});
    stats = obj.stats && obj.stats.dias ? obj.stats : { dias: {}, totalEstudados: 0, totalSessoes: 0, totalSimulados: 0 };
    streak = obj.streak && typeof obj.streak === "object" ? obj.streak : { atual: 0, recorde: 0, ultimoDia: null };
    favoritos = Array.isArray(obj.favoritos) ? obj.favoritos : [];
    util.storage.save(K.progresso, progresso);
    util.storage.save(K.config, config);
    util.storage.save(K.stats, stats);
    util.storage.save(K.streak, streak);
    util.storage.save(K.favoritos, favoritos);
    if (obj.conteudo) App.content.importarCamadaUsuario(obj.conteudo);
    util.emit("config-changed", getConfig());
    util.emit("progress-changed", { restaurado: true });
  }

  function apagarProgresso() {
    progresso = {};
    stats = { dias: {}, totalEstudados: 0, totalSessoes: 0, totalSimulados: 0 };
    streak = { atual: 0, recorde: 0, ultimoDia: null };
    util.storage.save(K.progresso, progresso);
    util.storage.save(K.stats, stats);
    util.storage.save(K.streak, streak);
    util.emit("progress-changed", { zerado: true });
  }

  function registrarSessaoConcluida(tipo) {
    if (tipo === "simulado") stats.totalSimulados = (stats.totalSimulados || 0) + 1;
    else stats.totalSessoes = (stats.totalSessoes || 0) + 1;
    util.storage.save(K.stats, stats);
  }

  return {
    getProgresso: getProgresso, todoProgresso: todoProgresso, registrarRevisao: registrarRevisao,
    sequenciaAtual: sequenciaAtual, sequenciaRecorde: sequenciaRecorde,
    statsHoje: statsHoje, metaDiaria: metaDiaria, statsGerais: statsGerais,
    contarSituacoes: contarSituacoes, totalDominados: totalDominados, totalRevisoesPrevistas: totalRevisoesPrevistas,
    getConfig: getConfig, setConfig: setConfig,
    isFavorito: isFavorito, alternarFavorito: alternarFavorito, listaFavoritos: listaFavoritos,
    exportarTudo: exportarTudo, importarTudo: importarTudo, apagarProgresso: apagarProgresso,
    registrarSessaoConcluida: registrarSessaoConcluida,
    CONFIG_PADRAO: CONFIG_PADRAO
  };
})();
