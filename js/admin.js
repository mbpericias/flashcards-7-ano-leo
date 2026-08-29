/* admin.js — funções do responsável: importação incremental e backup.
   Nunca apaga nem substitui cartões ou progresso automaticamente. */
window.App = window.App || {};

/* ---------------------------------------------------------------------------
   Importação incremental de novos bancos JSON
   --------------------------------------------------------------------------- */
App.importador = (function () {
  "use strict";
  var util = App.util, content = App.content;

  var CAMPOS_COMPARADOS = [
    "disciplina", "assunto", "subassunto", "ano_escolar", "prioridade", "tipo",
    "pegadinha", "pergunta", "resposta", "explicacao", "fonte", "gabarito",
    "alternativas", "correta"
  ];

  function extrairCards(entrada) {
    var dados;
    if (typeof entrada === "string") {
      dados = JSON.parse(entrada); // pode lançar SyntaxError -> tratado por quem chama
    } else {
      dados = entrada;
    }
    if (Array.isArray(dados)) return dados;
    if (dados && Array.isArray(dados.cards)) return dados.cards;
    if (dados && Array.isArray(dados.flashcards)) return dados.flashcards;
    throw new Error("O JSON precisa ser uma lista de cartões ou um objeto com a propriedade \"cards\".");
  }

  function validarCard(raw, idsNoLote) {
    var erros = [], avisos = [];
    if (!raw || typeof raw !== "object") { erros.push("cartão não é um objeto"); return { ok: false, erros: erros }; }

    var id = String(raw.id == null ? "" : raw.id).trim();
    if (!id) erros.push("sem \"id\"");
    if (id && !/^[A-Za-z0-9._-]+$/.test(id)) avisos.push("id com caracteres incomuns (use letras, números, ponto, hífen e sublinhado)");
    if (id && idsNoLote[id]) erros.push("id repetido dentro deste arquivo");

    if (!String(raw.pergunta || "").trim()) erros.push("sem \"pergunta\"");
    if (!String(raw.resposta || "").trim()) erros.push("sem \"resposta\"");
    if (!String(raw.disciplina || "").trim()) avisos.push("sem \"disciplina\" (vai para \"Sem disciplina\")");
    if (!String(raw.assunto || "").trim()) avisos.push("sem \"assunto\" (vai para \"Sem assunto\")");
    if (!String(raw.subassunto || "").trim()) avisos.push("sem \"subassunto\" (vai para \"Geral\")");

    var tipo = String(raw.tipo || "pergunta_direta").trim();
    if (content.tiposConhecidos().indexOf(tipo) === -1) avisos.push("tipo \"" + tipo + "\" não é um dos tipos padrão (será aceito mesmo assim)");

    if (tipo === "multipla_escolha") {
      if (!Array.isArray(raw.alternativas) || raw.alternativas.length < 2) {
        erros.push("múltipla escolha sem \"alternativas\" suficientes");
      } else if (raw.correta == null) {
        erros.push("múltipla escolha sem \"correta\"");
      } else if (raw.alternativas.map(String).indexOf(String(raw.correta)) === -1) {
        erros.push("\"correta\" não está entre as \"alternativas\"");
      }
    }
    if (tipo === "certo_errado" && typeof raw.gabarito !== "boolean") {
      avisos.push("certo/errado sem \"gabarito\" booleano (não entrará no Simulado)");
    }
    if (raw.prioridade != null) {
      var p = parseInt(raw.prioridade, 10);
      if (isNaN(p) || p < 1 || p > 5) avisos.push("\"prioridade\" fora de 1 a 5 (será ajustada)");
    }

    if (id) idsNoLote[id] = true;
    return { ok: erros.length === 0, erros: erros, avisos: avisos, id: id };
  }

  function diferencas(atual, novoNormalizado) {
    var chaves = [];
    CAMPOS_COMPARADOS.forEach(function (k) {
      var a = atual[k], b = novoNormalizado[k];
      if (JSON.stringify(a == null ? null : a) !== JSON.stringify(b == null ? null : b)) chaves.push(k);
    });
    return chaves;
  }

  // Analisa o texto/objeto e classifica cada cartão, sem gravar nada.
  function analisar(entrada) {
    var brutos;
    try {
      brutos = extrairCards(entrada);
    } catch (e) {
      return { erroGeral: e.message || String(e) };
    }

    var idsNoLote = {};
    var novos = [], iguais = [], diferentes = [], invalidos = [];

    brutos.forEach(function (raw, i) {
      var v = validarCard(raw, idsNoLote);
      if (!v.ok) { invalidos.push({ indice: i, id: v.id || ("#" + (i + 1)), erros: v.erros, raw: raw }); return; }

      var norm = content.normalizarCard(raw, "");
      var existente = content.getById(norm.id);
      if (!existente) {
        novos.push({ card: norm, avisos: v.avisos });
      } else {
        var difs = diferencas(existente, norm);
        if (difs.length === 0) iguais.push({ id: norm.id });
        else diferentes.push({ id: norm.id, atual: existente, novo: norm, campos: difs, avisos: v.avisos });
      }
    });

    return {
      total: brutos.length,
      novos: novos,
      iguais: iguais,
      diferentes: diferentes,
      invalidos: invalidos
    };
  }

  // Grava apenas os cartões novos (ids ainda inexistentes).
  function importarNovos(novos) {
    return content.addImportados(novos.map(function (n) { return n.card; }));
  }

  // Atualiza cartões existentes escolhidos explicitamente pelo responsável.
  // Preserva o id e todo o histórico/progresso associado.
  function aplicarAtualizacoes(diferentes) {
    var n = 0;
    diferentes.forEach(function (d) {
      var patch = {};
      d.campos.forEach(function (k) { patch[k] = d.novo[k]; });
      if (content.updateCard(d.id, patch)) n += 1;
    });
    return n;
  }

  return { analisar: analisar, importarNovos: importarNovos, aplicarAtualizacoes: aplicarAtualizacoes, validarCard: validarCard };
})();


/* ---------------------------------------------------------------------------
   Backup completo e restauração
   --------------------------------------------------------------------------- */
App.backup = (function () {
  "use strict";
  var util = App.util, state = App.state;

  function exportar() {
    var dados = state.exportarTudo();
    var hoje = util.dayKey();
    util.downloadJSON("backup-estudo-ciencias-" + hoje + ".json", dados);
    return dados;
  }

  function lerArquivo(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        try { resolve(JSON.parse(fr.result)); }
        catch (e) { reject(new Error("O arquivo não é um JSON válido.")); }
      };
      fr.onerror = function () { reject(new Error("Não foi possível ler o arquivo.")); };
      fr.readAsText(file);
    });
  }

  // Substitui TODOS os dados locais. Só deve ser chamado após confirmação.
  function restaurar(obj) {
    state.importarTudo(obj);
    return true;
  }

  function resumoDoBackup(obj) {
    if (!obj || typeof obj !== "object") return null;
    var prog = obj.progresso || {};
    var imp = (obj.conteudo && obj.conteudo.importados) || [];
    return {
      geradoEm: obj.geradoEm || "(sem data)",
      cartoesComProgresso: Object.keys(prog).length,
      cartoesImportados: imp.length,
      favoritos: (obj.favoritos || []).length,
      temStats: !!(obj.stats && obj.stats.dias),
      sequencia: obj.streak ? obj.streak.atual : 0
    };
  }

  return { exportar: exportar, lerArquivo: lerArquivo, restaurar: restaurar, resumoDoBackup: resumoDoBackup };
})();
