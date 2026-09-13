/* ui.js — telas, navegação e componentes visuais.
   Linguagem simples e acolhedora. Gamificação leve e positiva:
   nunca há punição, ranking público ou mensagem que envergonhe por errar. */
window.App = window.App || {};

App.ui = (function () {
  "use strict";
  var util = App.util, content = App.content, state = App.state,
      session = App.session, simulado = App.simulado, srs = App.srs;
  var h = util.h;

  var VIEW = null;         // elemento onde as telas são desenhadas
  var teardown = null;     // limpeza de ouvintes da tela atual
  var vista = {};          // estado transitório entre telas (config de sessão, resultado do simulado...)

  // ==================================================================
  // Frases motivadoras (positivas ou neutras)
  // ==================================================================
  var FRASES = {
    inicio: [
      "Bom te ver por aqui. Vamos com calma.",
      "Alguns minutos de estudo já fazem diferença.",
      "Pronto para praticar um pouco?",
      "Cada revisão deixa o assunto mais fácil."
    ],
    metaAtingida: [
      "Boa! Você concluiu sua meta de hoje.",
      "Meta do dia concluída. Bom trabalho!",
      "Você chegou na meta de hoje. Pode parar ou seguir, como preferir."
    ],
    faltamPoucos: [
      "Falta pouco para completar a revisão.",
      "Mais alguns cartões e você fecha por hoje.",
      "Quase lá. Continue no seu ritmo."
    ],
    fimSessaoBoa: [
      "Sessão concluída. Você foi bem!",
      "Terminou! Esse assunto está ficando mais fácil.",
      "Bom ritmo. O conteúdo está entrando aos poucos."
    ],
    fimSessaoOk: [
      "Sessão concluída. Errar faz parte do aprendizado.",
      "Terminou. Os cartões difíceis voltam depois para você tentar de novo.",
      "Bom esforço. Rever de novo amanhã ajuda a fixar."
    ],
    assuntoForte: [
      "Esse assunto está ficando mais fácil.",
      "Você já domina boa parte deste assunto."
    ]
  };
  function frase(ctx) {
    var arr = FRASES[ctx] || FRASES.inicio;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ==================================================================
  // Componentes
  // ==================================================================
  function tile(icone, valor, rotulo) {
    return h("div", { class: "tile" }, [
      h("div", { class: "tile-ico" }, icone),
      h("div", { class: "tile-val" }, String(valor)),
      h("div", { class: "tile-lbl" }, rotulo)
    ]);
  }

  function barra(pct, classe) {
    return h("div", { class: "barra " + (classe || "") }, [
      h("div", { class: "barra-fill", style: "width:" + util.clamp(pct, 0, 100) + "%" })
    ]);
  }

  function chip(texto, tipo) {
    return h("span", { class: "chip chip-" + (tipo || "n") }, texto);
  }

  function dominioBadge(nivel) {
    var d = srs.infoDominio(nivel);
    return h("span", { class: "dom dom-" + d.chave, title: d.rotulo }, [d.emoji + " " + d.rotulo]);
  }

  function voltar(href, texto) {
    return h("a", { class: "voltar", href: href || "#/" }, "‹ " + (texto || "Voltar"));
  }

  function botao(texto, onclick, opts) {
    opts = opts || {};
    return h("button", {
      class: "btn " + (opts.classe || "btn-primario") + (opts.bloco ? " btn-bloco" : ""),
      onclick: onclick, disabled: opts.disabled, type: "button"
    }, texto);
  }

  function toast(msg) {
    var t = h("div", { class: "toast" }, msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  function modal(titulo, corpo, acoes) {
    var overlay = h("div", { class: "overlay" });
    var box = h("div", { class: "modal" }, [
      h("h3", {}, titulo),
      h("div", { class: "modal-corpo" }, corpo),
      h("div", { class: "modal-acoes" }, acoes || [])
    ]);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fechar(); });
    function fechar() { overlay.remove(); }
    document.body.appendChild(overlay);
    return { fechar: fechar, overlay: overlay };
  }

  function confirmar(mensagem, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var m;
      var btnSim = botao(opts.sim || "Confirmar", function () { m.fechar(); resolve(true); },
        { classe: opts.perigo ? "btn-perigo" : "btn-primario" });
      var btnNao = botao(opts.nao || "Cancelar", function () { m.fechar(); resolve(false); }, { classe: "btn-suave" });
      m = modal(opts.titulo || "Confirmar", h("p", {}, mensagem), [btnNao, btnSim]);
    });
  }

  function blocoAssunto(disc, assunto) {
    var ids = content.idsDe(disc, assunto, null);
    var s = state.contarSituacoes(ids);
    return h("a", { class: "cartao-assunto", href: "#/a/" + enc(disc) + "/" + enc(assunto) }, [
      h("div", { class: "ca-topo" }, [
        h("h3", {}, assunto),
        h("span", { class: "ca-total" }, ids.length + (ids.length === 1 ? " cartão" : " cartões"))
      ]),
      barra(s.pctEstudado),
      h("div", { class: "ca-nums" }, [
        chip("Novos: " + s.novos, "novo"),
        chip("Revisar: " + s.revisar, s.revisar ? "rev" : "n"),
        chip("Domínio: " + s.pctDominio + "%", "dom")
      ])
    ]);
  }

  function enc(s) { return encodeURIComponent(s); }

  // Ícone decorativo por disciplina. Puramente visual: uma disciplina nova que
  // não estiver nesta lista simplesmente usa o ícone padrão — não é preciso
  // alterar o motor para isso funcionar.
  var ICONES_DISCIPLINA = {
    "ciências": "🔬", "ciencias": "🔬",
    "história": "🏛️", "historia": "🏛️",
    "geografia": "🌎",
    "matemática": "➗", "matematica": "➗",
    "português": "📖", "portugues": "📖", "língua portuguesa": "📖",
    "inglês": "🗣️", "ingles": "🗣️",
    "artes": "🎨", "educação física": "🤸", "educacao fisica": "🤸",
    "filosofia": "🦉", "sociologia": "🧭"
  };
  function iconeDisciplina(nome) {
    return ICONES_DISCIPLINA[util.normalize(nome)] || "📘";
  }

  // ==================================================================
  // Navegação
  // ==================================================================
  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    var partesQuery = raw.split("?");
    var caminho = partesQuery[0].split("/").filter(Boolean).map(decodeURIComponent);
    var query = {};
    (partesQuery[1] || "").split("&").filter(Boolean).forEach(function (kv) {
      var p = kv.split("=");
      query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    return { caminho: caminho, query: query };
  }

  function ir(hash) { location.hash = hash; }

  // Vai para a tela de sessão. Se já estamos nela, força o redesenho
  // (mudar o hash para o mesmo valor não dispara "hashchange").
  function abrirRodar() {
    if (location.hash === "#/rodar") render();
    else location.hash = "#/rodar";
  }

  function render() {
    if (teardown) { try { teardown(); } catch (e) {} teardown = null; }
    var r = parseHash();
    var c = r.caminho, q = r.query;
    util.clear(VIEW);
    window.scrollTo(0, 0);

    var rota = c[0] || "";
    try {
      if (rota === "") telaInicial();
      else if (rota === "d") telaDisciplina(c[1]);
      else if (rota === "a") telaAssunto(c[1], c[2]);
      else if (rota === "sessao") telaConfigSessao(q);
      else if (rota === "rodar") telaRodarSessao();
      else if (rota === "simulado" && c[1] === "rodar") telaRodarSimulado();
      else if (rota === "simulado" && c[1] === "resultado") telaResultadoSimulado();
      else if (rota === "simulado") telaConfigSimulado(q);
      else if (rota === "importar") telaImportar();
      else if (rota === "banco") telaBanco(q);
      else if (rota === "progresso") telaProgresso(c[1], c[2]);
      else if (rota === "backup") telaBackup();
      else if (rota === "config") telaConfig();
      else if (rota === "responsavel") telaResponsavel();
      else if (rota === "ajuda") telaAjuda();
      else telaInicial();
    } catch (err) {
      console.error(err);
      VIEW.appendChild(h("div", { class: "aviso" }, "Algo deu errado ao abrir esta tela: " + err.message));
      VIEW.appendChild(voltar("#/", "Voltar ao início"));
    }
    marcarBarraTopo(rota);
  }

  function marcarBarraTopo(rota) {
    var emSessao = rota === "rodar" || (rota === "simulado" && parseHash().caminho[1] === "rodar");
    var bar = util.qs("#barra-topo");
    if (bar) bar.style.display = emSessao ? "none" : "";
  }

  // ==================================================================
  // TELA: início
  // ==================================================================
  function telaInicial() {
    var meta = content.meta();
    var md = state.metaDiaria();
    var hoje = state.statsHoje();

    VIEW.appendChild(h("header", { class: "capa" }, [
      h("h1", {}, (meta.titulo || "Estudo Escolar").toUpperCase()),
      h("p", { class: "sub" }, meta.ano_escolar || "")
    ]));

    VIEW.appendChild(h("div", { class: "tiles" }, [
      tile("🔥", state.sequenciaAtual(), state.sequenciaAtual() === 1 ? "dia seguido" : "dias seguidos"),
      tile("📚", hoje.estudados, "cartões hoje"),
      tile("🔁", state.totalRevisoesPrevistas(), "revisões previstas"),
      tile("🟢", state.totalDominados(), "dominados"),
      tile("🎯", md.feito + "/" + md.meta, "meta diária")
    ]));

    VIEW.appendChild(h("p", { class: "frase" }, md.atingida ? frase("metaAtingida") : frase("inicio")));

    VIEW.appendChild(botao("Começar revisão de hoje", function () {
      ir("#/sessao?modo=revisao&titulo=" + enc("Revisão de hoje"));
    }, { classe: "btn-primario", bloco: true }));

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "ESCOLHA UMA DISCIPLINA"));
    var discs = content.disciplinas();
    if (!discs.length) {
      VIEW.appendChild(h("div", { class: "aviso" }, "Nenhum banco de cartões foi carregado ainda. Veja a tela de Ajuda."));
    }
    var grade = h("div", { class: "grade-disc" });
    discs.forEach(function (d) {
      var ids = content.idsDe(d, null, null);
      var s = state.contarSituacoes(ids);
      grade.appendChild(h("a", { class: "bloco-disc", href: "#/d/" + enc(d) }, [
        h("span", { class: "bd-ico" }, iconeDisciplina(d)),
        h("span", { class: "bd-nome" }, d),
        h("span", { class: "bd-info" }, ids.length + " cartões · " + s.revisar + " p/ revisar · " + s.novos + " novos · " + s.pctDominio + "% dominado")
      ]));
    });
    VIEW.appendChild(grade);

    if (content.avisos().length) {
      VIEW.appendChild(h("details", { class: "aviso-tec" }, [
        h("summary", {}, "Avisos de carregamento (" + content.avisos().length + ")"),
        h("ul", {}, content.avisos().map(function (a) { return h("li", {}, a); }))
      ]));
    }

    VIEW.appendChild(rodapeLinks());
  }

  function rodapeLinks() {
    return h("nav", { class: "rodape" }, [
      h("a", { href: "#/progresso" }, "Progresso"),
      h("a", { href: "#/simulado" }, "Simulado"),
      h("a", { href: "#/importar" }, "Importar questões"),
      h("a", { href: "#/responsavel" }, "Área do responsável"),
      h("a", { href: "#/ajuda" }, "Ajuda")
    ]);
  }

  // ==================================================================
  // TELA: disciplina
  // ==================================================================
  function telaDisciplina(disc) {
    if (!disc || content.disciplinas().indexOf(disc) === -1) { ir("#/"); return; }
    VIEW.appendChild(voltar("#/"));
    VIEW.appendChild(h("h1", { class: "tit" }, disc));

    var ids = content.idsDe(disc, null, null);
    var s = state.contarSituacoes(ids);
    VIEW.appendChild(h("div", { class: "tiles pequenos" }, [
      tile("📦", ids.length, "cartões"),
      tile("🆕", s.novos, "novos"),
      tile("🔁", s.revisar, "p/ revisar"),
      tile("🟢", s.dominados, "dominados")
    ]));

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "ASSUNTOS"));
    var lista = h("div", { class: "col" });
    content.assuntos(disc).forEach(function (a) { lista.appendChild(blocoAssunto(disc, a)); });
    VIEW.appendChild(lista);
  }

  // ==================================================================
  // TELA: assunto
  // ==================================================================
  function telaAssunto(disc, assunto) {
    if (!disc || !assunto || content.assuntos(disc).indexOf(assunto) === -1) { ir("#/"); return; }
    VIEW.appendChild(voltar("#/d/" + enc(disc), disc));
    VIEW.appendChild(h("h1", { class: "tit" }, assunto));

    var ids = content.idsDe(disc, assunto, null);
    var s = state.contarSituacoes(ids);
    VIEW.appendChild(h("div", { class: "tiles pequenos" }, [
      tile("📦", ids.length, "cartões"),
      tile("🆕", s.novos, "novos"),
      tile("🔁", s.revisar, "p/ revisar"),
      tile("🟠", s.dificeis, "difíceis"),
      tile("🟢", s.dominados, "dominados")
    ]));

    var base = "#/sessao?d=" + enc(disc) + "&a=" + enc(assunto);
    VIEW.appendChild(h("div", { class: "acoes-assunto" }, [
      botao("ESTUDAR TODO O ASSUNTO", function () { ir(base + "&modo=revisao&titulo=" + enc(assunto)); }, { classe: "btn-primario", bloco: true }),
      h("div", { class: "acoes-linha" }, [
        botao("Revisar erros", function () { ir(base + "&modo=erros&titulo=" + enc("Erros · " + assunto)); }, { classe: "btn-suave", disabled: !s.errosRecentes }),
        botao("Revisar difíceis", function () { ir(base + "&modo=dificeis&titulo=" + enc("Difíceis · " + assunto)); }, { classe: "btn-suave", disabled: !s.dificeis }),
        botao("Revisar novos", function () { ir(base + "&modo=novos&titulo=" + enc("Novos · " + assunto)); }, { classe: "btn-suave", disabled: !s.novos })
      ]),
      h("a", { class: "link-desempenho", href: "#/progresso/" + enc(disc) + "/" + enc(assunto) }, "Ver desempenho deste assunto")
    ]));

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "SUBASSUNTOS"));
    var col = h("div", { class: "col" });
    content.subassuntos(disc, assunto).forEach(function (sub) {
      var sids = content.idsDe(disc, assunto, sub);
      var ss = state.contarSituacoes(sids);
      col.appendChild(h("div", { class: "cartao-sub" }, [
        h("div", { class: "cs-topo" }, [
          h("h3", {}, sub),
          h("span", { class: "ca-total" }, sids.length + (sids.length === 1 ? " cartão" : " cartões"))
        ]),
        barra(ss.pctEstudado),
        h("div", { class: "ca-nums" }, [
          chip("Novos: " + ss.novos, "novo"),
          chip("Estudados: " + ss.estudados, "n"),
          chip("Difíceis: " + ss.dificeis, ss.dificeis ? "dif" : "n"),
          chip("Dominados: " + ss.dominados, "dom")
        ]),
        botao("ESTUDAR ESTE SUBASSUNTO", function () {
          ir(base + "&s=" + enc(sub) + "&modo=revisao&titulo=" + enc(sub));
        }, { classe: "btn-primario", bloco: true, disabled: !sids.length })
      ]));
    });
    VIEW.appendChild(col);
  }

  // ==================================================================
  // TELA: configuração da sessão
  // ==================================================================
  function telaConfigSessao(q) {
    var cfg = state.getConfig();
    vista.sessao = {
      modo: q.modo || "revisao",
      quantidade: vista.sessao && vista.sessao.quantidade ? vista.sessao.quantidade : cfg.tamanhoSessaoPadrao,
      d: q.d || "", a: q.a || "", s: q.s || "",
      titulo: q.titulo || ""
    };
    var sc = vista.sessao;

    VIEW.appendChild(voltar(sc.a ? "#/a/" + enc(sc.d) + "/" + enc(sc.a) : "#/"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Preparar sessão"));
    if (sc.d) VIEW.appendChild(h("p", { class: "trilha" }, [sc.d, sc.a && " › " + sc.a, sc.s && " › " + sc.s].filter(Boolean).join("")));

    // Quantidade
    VIEW.appendChild(h("h2", { class: "secao-tit" }, "QUANTOS CARTÕES?"));
    var qtdWrap = h("div", { class: "segmentos" });
    ["5", "10", "15", "20", "todos"].forEach(function (opt) {
      var b = h("button", {
        type: "button",
        class: "seg" + (String(sc.quantidade) === opt ? " ativo" : ""),
        onclick: function () { sc.quantidade = opt === "todos" ? "todos" : parseInt(opt, 10); telaConfigSessaoRedesenhar(); }
      }, opt === "todos" ? "Todos" : opt);
      qtdWrap.appendChild(b);
    });
    VIEW.appendChild(qtdWrap);

    // Modo
    VIEW.appendChild(h("h2", { class: "secao-tit" }, "O QUE VOCÊ QUER PRATICAR?"));
    var modoWrap = h("div", { class: "col" });
    session.MODOS.forEach(function (m) {
      var escopo = { disciplina: sc.d || null, assunto: sc.a || null, subassunto: sc.s || null };
      var disp = session.contar({ modo: m.id, escopo: escopo });
      var linha = h("label", { class: "opcao" + (sc.modo === m.id ? " ativo" : "") + (disp === 0 ? " vazio" : "") }, [
        h("input", {
          type: "radio", name: "modo", value: m.id, checked: sc.modo === m.id,
          onchange: function () { sc.modo = m.id; telaConfigSessaoRedesenhar(); }
        }),
        h("span", { class: "op-txt" }, [
          h("strong", {}, m.rotulo),
          h("small", {}, m.dica),
          h("small", { class: "op-disp" }, disp + (disp === 1 ? " disponível" : " disponíveis"))
        ])
      ]);
      modoWrap.appendChild(linha);
    });
    VIEW.appendChild(modoWrap);

    var escopoAtual = { disciplina: sc.d || null, assunto: sc.a || null, subassunto: sc.s || null };
    var total = session.contar({ modo: sc.modo, escopo: escopoAtual });
    var qtdFinal = sc.quantidade === "todos" ? total : Math.min(total, sc.quantidade);

    VIEW.appendChild(h("p", { class: "resumo-sessao" },
      total === 0 ? "Nenhum cartão para este modo agora. Que tal escolher outro assunto ou outro modo?"
                  : ("Você vai praticar " + qtdFinal + (qtdFinal === 1 ? " cartão." : " cartões."))));

    VIEW.appendChild(botao("COMEÇAR", function () {
      session.construir({
        modo: sc.modo,
        quantidade: sc.quantidade,
        escopo: escopoAtual,
        titulo: sc.titulo || session.rotuloModo(sc.modo)
      });
      vista.fimSessao = null;
      ir("#/rodar");
    }, { classe: "btn-primario", bloco: true, disabled: total === 0 }));
  }

  function telaConfigSessaoRedesenhar() {
    var q = parseHash().query;
    util.clear(VIEW);
    telaConfigSessao(q);
  }

  // ==================================================================
  // TELA: rodar sessão de estudo
  // ==================================================================
  function telaRodarSessao() {
    if (!session.ativa()) {
      if (vista.fimSessao) { telaFimSessao(); return; }
      ir("#/"); return;
    }
    desenharCartao();

    function onKey(e) {
      if (!session.ativa()) return;
      var revelado = !!util.qs(".estudo-resposta");
      if (!revelado && (e.code === "Space" || e.key === " " || e.key === "Enter")) {
        e.preventDefault(); revelar();
      } else if (revelado && ["1", "2", "3", "4"].indexOf(e.key) !== -1) {
        e.preventDefault();
        avaliar(["errei", "dificil", "acertei", "facil"][parseInt(e.key, 10) - 1]);
      }
    }
    if (state.getConfig().mostrarAtalhos) {
      document.addEventListener("keydown", onKey);
      teardown = function () { document.removeEventListener("keydown", onKey); };
    }

    function desenharCartao() {
      util.clear(VIEW);
      var card = session.cartaoAtual();
      var pi = session.progressoInfo();
      var res = session.resumo();

      var top = h("div", { class: "estudo-top" }, [
        h("div", { class: "estudo-trilha" }, [card.disciplina, " › ", card.assunto, " › ", card.subassunto].join("")),
        h("button", { type: "button", class: "encerrar", onclick: encerrar }, "Encerrar")
      ]);
      var prog = h("div", { class: "estudo-prog" }, [barra(pi.pct), h("small", {}, progtxtSafe(pi))]);

      var pergunta = h("div", { class: "estudo-pergunta" }, [
        card.pegadinha ? h("span", { class: "tag-pegadinha" }, "⚠️ Preste atenção nos detalhes") : null,
        h("p", { class: "pergunta-txt" }, card.pergunta)
      ]);

      var area = h("div", { class: "estudo-area" });
      VIEW.appendChild(h("section", { class: "estudo" }, [top, prog, pergunta, area]));

      // Corpo específico por tipo
      vista.escolha = null;
      if (card.tipo === "multipla_escolha" && Array.isArray(card.alternativas)) {
        var opts = h("div", { class: "alternativas" });
        card.alternativas.forEach(function (alt) {
          opts.appendChild(h("button", {
            type: "button", class: "alt", onclick: function () {
              vista.escolha = alt;
              util.qsa(".alt", opts).forEach(function (b) { b.classList.remove("sel"); });
              this.classList.add("sel");
            }
          }, alt));
        });
        area.appendChild(opts);
      } else if (card.tipo === "certo_errado") {
        var ce = h("div", { class: "alternativas duas" }, [
          h("button", { type: "button", class: "alt", onclick: function () { escolherCE(true, this); } }, "Certo"),
          h("button", { type: "button", class: "alt", onclick: function () { escolherCE(false, this); } }, "Errado")
        ]);
        area.appendChild(ce);
        function escolherCE(v, btn) {
          vista.escolha = v;
          util.qsa(".alt", ce).forEach(function (b) { b.classList.remove("sel"); });
          btn.classList.add("sel");
        }
      }

      area.appendChild(botao("MOSTRAR RESPOSTA", revelar, { classe: "btn-primario", bloco: true }));
    }

    function progtxtSafe(pi) {
      var extra = pi.restantes - (pi.total - pi.feitos);
      return "Concluídos: " + pi.feitos + " de " + pi.total + (extra > 0 ? " · +" + extra + " para revisar nesta sessão" : "");
    }

    function revelar() {
      if (util.qs(".estudo-resposta")) return;
      var card = session.cartaoAtual();
      var area = util.qs(".estudo-area");
      util.clear(area);

      if (card.tipo === "multipla_escolha" && Array.isArray(card.alternativas)) {
        var opts = h("div", { class: "alternativas reveladas" });
        card.alternativas.forEach(function (alt) {
          var certa = String(alt) === String(card.correta);
          var escolhida = vista.escolha != null && String(vista.escolha) === String(alt);
          opts.appendChild(h("div", {
            class: "alt " + (certa ? "certa" : "") + (escolhida && !certa ? " errada" : "")
          }, [alt, certa ? "  ✓" : (escolhida ? "  ✗" : "")]));
        });
        area.appendChild(opts);
      }

      var bloco = h("div", { class: "estudo-resposta" }, [
        h("div", { class: "resp-linha" }, [h("span", { class: "rl-rot" }, "Resposta"), h("p", {}, card.resposta)]),
        card.explicacao ? h("div", { class: "resp-linha suave" }, [h("span", { class: "rl-rot" }, "Explicação"), h("p", {}, card.explicacao)]) : null,
        card.fonte ? h("p", { class: "resp-fonte" }, "Fonte: " + card.fonte) : null,
        h("button", {
          type: "button", class: "fav " + (state.isFavorito(card.id) ? "on" : ""),
          onclick: function () { state.alternarFavorito(card.id); this.classList.toggle("on"); }
        }, state.isFavorito(card.id) ? "★ Favorito" : "☆ Favoritar")
      ]);
      area.appendChild(bloco);

      var sugerido = null;
      if (vista.escolha != null) {
        if (card.tipo === "certo_errado") sugerido = (vista.escolha === card.gabarito) ? "acertei" : "errei";
        else if (card.tipo === "multipla_escolha") sugerido = (String(vista.escolha) === String(card.correta)) ? "acertei" : "errei";
      }

      var notas = [
        { n: "errei", t: "🔴 ERREI", c: "nota-errei" },
        { n: "dificil", t: "🟠 FOI DIFÍCIL", c: "nota-dificil" },
        { n: "acertei", t: "🟢 ACERTEI", c: "nota-acertei" },
        { n: "facil", t: "🔵 FOI FÁCIL", c: "nota-facil" }
      ];
      var grid = h("div", { class: "notas" });
      notas.forEach(function (x) {
        grid.appendChild(h("button", {
          type: "button", class: "nota " + x.c + (sugerido === x.n ? " sugerido" : ""),
          onclick: function () { avaliar(x.n); }
        }, x.t));
      });
      area.appendChild(h("p", { class: "notas-ajuda" }, "Como foi lembrar a resposta?"));
      area.appendChild(grid);
      if (state.getConfig().mostrarAtalhos) {
        area.appendChild(h("p", { class: "atalhos" }, "Atalhos: espaço = mostrar · 1 errei · 2 difícil · 3 acertei · 4 fácil"));
      }
    }

    function avaliar(nota) {
      var r = session.responder(nota);
      if (r.fim) {
        vista.fimSessao = r;
        abrirRodar();
      } else {
        desenharCartao();
      }
    }

    function encerrar() {
      confirmar("Encerrar a sessão agora? O que você já respondeu fica salvo.", { sim: "Encerrar", nao: "Continuar" })
        .then(function (ok) { if (ok) { session.abortar(); ir("#/"); } });
    }
  }

  function telaFimSessao() {
    var r = vista.fimSessao;
    util.clear(VIEW);
    var boa = r.taxa >= 60 && r.erros <= Math.ceil(r.avaliacoes / 3);
    VIEW.appendChild(h("section", { class: "fim" }, [
      h("div", { class: "fim-emoji" }, boa ? "🎉" : "💪"),
      h("h1", {}, "Sessão concluída"),
      h("p", { class: "frase" }, boa ? frase("fimSessaoBoa") : frase("fimSessaoOk")),
      h("div", { class: "tiles pequenos" }, [
        tile("📚", r.avaliacoes, "respostas"),
        tile("🟢", r.acertos, "acertos"),
        tile("🟠", r.dificeis, "difíceis"),
        tile("🔴", r.erros, "erros")
      ]),
      h("p", {}, "Taxa de acerto nesta sessão: " + r.taxa + "%"),
      r.erros ? botao("Revisar os erros desta sessão", function () {
        session.construirLista(r.errados, "Erros da sessão");
        vista.fimSessao = null; abrirRodar();
      }, { classe: "btn-suave", bloco: true }) : null,
      botao("Voltar ao início", function () { vista.fimSessao = null; ir("#/"); }, { classe: "btn-primario", bloco: true })
    ]));
  }

  // ==================================================================
  // TELA: simulado (configuração)
  // ==================================================================
  function telaConfigSimulado(q) {
    vista.sim = vista.sim || { d: "", a: "", quantidade: 10 };
    var sc = vista.sim;
    VIEW.appendChild(voltar("#/"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Simulado"));
    VIEW.appendChild(h("div", { class: "cartao-info" }, [
      h("p", {}, "No simulado, você responde tudo primeiro. As respostas certas e erradas aparecem só no final."),
      h("p", { class: "suave" }, "Entram apenas questões de certo/errado e de múltipla escolha com gabarito cadastrado.")
    ]));

    var selD = h("select", { onchange: function () { sc.d = this.value; sc.a = ""; redesenhar(); } }, [
      h("option", { value: "" }, "Todas as disciplinas")
    ].concat(content.disciplinas().map(function (d) {
      return h("option", { value: d, selected: sc.d === d }, d);
    })));
    VIEW.appendChild(campo("Disciplina", selD));

    if (sc.d) {
      var selA = h("select", { onchange: function () { sc.a = this.value; redesenhar(); } }, [
        h("option", { value: "" }, "Todos os assuntos")
      ].concat(content.assuntos(sc.d).map(function (a) {
        return h("option", { value: a, selected: sc.a === a }, a);
      })));
      VIEW.appendChild(campo("Assunto", selA));
    }

    var escopo = { disciplina: sc.d || null, assunto: sc.a || null };
    var disp = simulado.contar(escopo);

    var segs = h("div", { class: "segmentos" });
    ["5", "10", "15", "20", "todos"].forEach(function (opt) {
      segs.appendChild(h("button", {
        type: "button", class: "seg" + (String(sc.quantidade) === opt ? " ativo" : ""),
        onclick: function () { sc.quantidade = opt === "todos" ? "todos" : parseInt(opt, 10); redesenhar(); }
      }, opt === "todos" ? "Todas" : opt));
    });
    VIEW.appendChild(campo("Quantas questões?", segs));

    VIEW.appendChild(h("p", { class: "resumo-sessao" }, disp + (disp === 1 ? " questão disponível." : " questões disponíveis.")));
    VIEW.appendChild(botao("COMEÇAR SIMULADO", function () {
      simulado.construir({ escopo: escopo, quantidade: sc.quantidade });
      vista.simResultado = null;
      ir("#/simulado/rodar");
    }, { classe: "btn-primario", bloco: true, disabled: disp === 0 }));

    function redesenhar() { util.clear(VIEW); telaConfigSimulado(q); }
  }

  function campo(rot, ctrl) {
    return h("label", { class: "campo" }, [h("span", { class: "campo-rot" }, rot), ctrl]);
  }

  // ==================================================================
  // TELA: rodar simulado
  // ==================================================================
  function telaRodarSimulado() {
    if (!simulado.ativa()) {
      if (vista.simResultado) { ir("#/simulado/resultado"); return; }
      ir("#/simulado"); return;
    }
    desenhar();

    function desenhar() {
      util.clear(VIEW);
      var it = simulado.itemAtual();
      var card = it.card;
      var top = h("div", { class: "estudo-top" }, [
        h("div", { class: "estudo-trilha" }, "Questão " + (it.indice + 1) + " de " + it.total),
        h("button", { type: "button", class: "encerrar", onclick: encerrar }, "Sair")
      ]);
      VIEW.appendChild(h("section", { class: "estudo" }, [
        top,
        barra(util.pct(it.indice, it.total)),
        h("div", { class: "estudo-pergunta" }, [h("p", { class: "pergunta-txt" }, card.pergunta)]),
        montarOpcoes(card, it.resposta),
        h("div", { class: "sim-nav" }, [
          it.indice > 0 ? botao("‹ Anterior", function () { simulado.voltar(); desenhar(); }, { classe: "btn-suave" }) : h("span", {}),
          botao(it.indice + 1 >= it.total ? "Finalizar" : "Próxima ›", proxima, { classe: "btn-primario" })
        ]),
        h("p", { class: "suave centro" }, "Você pode voltar e mudar respostas antes de finalizar.")
      ]));
    }

    function montarOpcoes(card, respAtual) {
      var wrap = h("div", { class: "alternativas" });
      if (card.tipo === "certo_errado") {
        [["Certo", true], ["Errado", false]].forEach(function (par) {
          wrap.appendChild(h("button", {
            type: "button", class: "alt" + (respAtual === par[1] ? " sel" : ""),
            onclick: function () { simulado.responder(par[1]); marca(wrap, this); }
          }, par[0]));
        });
      } else {
        (card.alternativas || []).forEach(function (alt) {
          wrap.appendChild(h("button", {
            type: "button", class: "alt" + (String(respAtual) === String(alt) ? " sel" : ""),
            onclick: function () { simulado.responder(alt); marca(wrap, this); }
          }, alt));
        });
      }
      return wrap;
    }
    function marca(wrap, btn) {
      util.qsa(".alt", wrap).forEach(function (b) { b.classList.remove("sel"); });
      btn.classList.add("sel");
    }
    function proxima() {
      var r = simulado.avancar();
      if (r.fim) { vista.simResultado = r.resultado; ir("#/simulado/resultado"); }
      else desenhar();
    }
    function encerrar() {
      confirmar("Sair do simulado? As respostas deste simulado serão descartadas.", { sim: "Sair", nao: "Continuar", perigo: true })
        .then(function (ok) { if (ok) { simulado.abortar(); ir("#/simulado"); } });
    }
  }

  // ==================================================================
  // TELA: resultado do simulado
  // ==================================================================
  function telaResultadoSimulado() {
    var r = vista.simResultado;
    if (!r) { ir("#/simulado"); return; }
    VIEW.appendChild(h("h1", { class: "tit" }, "Resultado do simulado"));
    VIEW.appendChild(h("div", { class: "tiles pequenos" }, [
      tile("✅", r.acertos + "/" + r.total, "acertos"),
      tile("📊", r.pct + "%", "aproveitamento")
    ]));
    VIEW.appendChild(h("p", { class: "frase" }, r.pct >= 60 ? "Bom trabalho! Veja abaixo o que revisar." : "Tudo bem. Agora você sabe o que praticar."));

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "POR ASSUNTO"));
    VIEW.appendChild(tabelaDesempenho(r.porAssunto));
    VIEW.appendChild(h("h2", { class: "secao-tit" }, "POR SUBASSUNTO"));
    VIEW.appendChild(tabelaDesempenho(r.porSubassunto));

    if (r.erradas.length) {
      VIEW.appendChild(h("h2", { class: "secao-tit" }, "QUESTÕES PARA REVER"));
      var col = h("div", { class: "col" });
      r.erradas.forEach(function (x) {
        if (!x.card) return;
        col.appendChild(h("div", { class: "cartao-sub" }, [
          h("p", { class: "pergunta-txt" }, x.card.pergunta),
          h("p", { class: "suave" }, "Sua resposta: " + x.respostaTexto),
          h("p", {}, "Resposta certa: " + x.card.resposta),
          x.card.explicacao ? h("p", { class: "suave" }, x.card.explicacao) : null
        ]));
      });
      VIEW.appendChild(col);
      VIEW.appendChild(botao("ESTUDAR OS ERROS", function () {
        session.construirLista(r.idsErrados, "Erros do simulado");
        vista.fimSessao = null; abrirRodar();
      }, { classe: "btn-primario", bloco: true }));
    }
    VIEW.appendChild(botao("Novo simulado", function () { ir("#/simulado"); }, { classe: "btn-suave", bloco: true }));
    VIEW.appendChild(botao("Voltar ao início", function () { ir("#/"); }, { classe: "btn-suave", bloco: true }));
  }

  function tabelaDesempenho(linhas) {
    if (!linhas || !linhas.length) return h("p", { class: "suave" }, "Sem dados.");
    var t = h("div", { class: "tabela" });
    linhas.forEach(function (e) {
      t.appendChild(h("div", { class: "tabela-linha" }, [
        h("span", { class: "tl-nome" }, e.chave),
        h("span", { class: "tl-barra" }, barra(e.pct)),
        h("span", { class: "tl-val" }, e.acertos + "/" + e.total)
      ]));
    });
    return t;
  }

  // ==================================================================
  // TELA: importar novas questões
  // ==================================================================
  function telaImportar() {
    VIEW.appendChild(voltar("#/responsavel", "Área do responsável"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Importar novas questões"));
    VIEW.appendChild(h("div", { class: "cartao-info" }, [
      h("p", {}, "Cole um JSON de cartões ou escolha um arquivo .json."),
      h("p", { class: "suave" }, "O aplicativo só adiciona cartões com id novo. Nada é apagado e nenhum cartão existente é substituído sem a sua confirmação.")
    ]));

    var ta = h("textarea", { class: "json-input", rows: 10, placeholder: '[\n  { "id": "XXX-001", "disciplina": "...", "assunto": "...", "subassunto": "...", "pergunta": "...", "resposta": "..." }\n]' });
    var file = h("input", { type: "file", accept: ".json,application/json", onchange: function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { ta.value = fr.result; };
      fr.readAsText(f);
    }});
    VIEW.appendChild(campo("Arquivo .json", file));
    VIEW.appendChild(campo("ou cole o JSON aqui", ta));

    var resultado = h("div", { class: "import-resultado" });
    VIEW.appendChild(botao("Analisar", function () {
      util.clear(resultado);
      var texto = ta.value.trim();
      if (!texto) { resultado.appendChild(h("p", { class: "aviso" }, "Cole um JSON ou escolha um arquivo primeiro.")); return; }
      var an;
      try { an = App.importador.analisar(texto); }
      catch (e) { resultado.appendChild(h("p", { class: "aviso" }, "Erro ao ler o JSON: " + e.message)); return; }
      if (an.erroGeral) { resultado.appendChild(h("p", { class: "aviso" }, an.erroGeral)); return; }
      mostrarAnalise(an, resultado);
    }, { classe: "btn-primario", bloco: true }));
    VIEW.appendChild(resultado);
  }

  function mostrarAnalise(an, alvo) {
    alvo.appendChild(h("div", { class: "tiles pequenos" }, [
      tile("🆕", an.novos.length, "novos"),
      tile("♻️", an.diferentes.length, "atualizações"),
      tile("✔️", an.iguais.length, "já iguais"),
      tile("⚠️", an.invalidos.length, "inválidos")
    ]));

    if (an.invalidos.length) {
      var ul = h("ul", { class: "lista-erros" });
      an.invalidos.forEach(function (x) { ul.appendChild(h("li", {}, x.id + ": " + x.erros.join("; "))); });
      alvo.appendChild(h("details", { open: "open" }, [h("summary", {}, "Cartões inválidos (não serão importados)"), ul]));
    }

    if (an.novos.length) {
      var lst = h("ul", { class: "lista-novos" });
      an.novos.slice(0, 60).forEach(function (n) {
        lst.appendChild(h("li", {}, n.card.id + " — " + util.truncate(n.card.pergunta, 80)));
      });
      if (an.novos.length > 60) lst.appendChild(h("li", {}, "… e mais " + (an.novos.length - 60)));
      alvo.appendChild(h("details", { open: "open" }, [h("summary", {}, "Novos cartões a adicionar"), lst]));
      alvo.appendChild(botao("Importar " + an.novos.length + " novo(s) cartão(ões)", function () {
        var n = App.importador.importarNovos(an.novos);
        toast(n + " cartão(ões) adicionado(s).");
        ir("#/banco");
      }, { classe: "btn-primario", bloco: true }));
    }

    if (an.diferentes.length) {
      alvo.appendChild(h("h2", { class: "secao-tit" }, "ATUALIZAÇÕES (exigem confirmação)"));
      alvo.appendChild(h("p", { class: "suave" }, "Estes ids já existem com conteúdo diferente. O progresso e o histórico do cartão são preservados."));
      var col = h("div", { class: "col" });
      an.diferentes.forEach(function (d) {
        var check = h("input", { type: "checkbox" });
        d._check = check;
        col.appendChild(h("div", { class: "cartao-sub" }, [
          h("label", { class: "op-inline" }, [check, h("strong", {}, " " + d.id)]),
          h("p", { class: "suave" }, "Campos que mudam: " + d.campos.join(", ")),
          h("p", {}, [h("span", { class: "rl-rot" }, "Atual: "), util.truncate(d.atual.pergunta + " → " + d.atual.resposta, 120)]),
          h("p", {}, [h("span", { class: "rl-rot" }, "Novo: "), util.truncate(d.novo.pergunta + " → " + d.novo.resposta, 120)])
        ]));
      });
      alvo.appendChild(col);
      alvo.appendChild(botao("Aplicar atualizações marcadas", function () {
        var escolhidas = an.diferentes.filter(function (d) { return d._check.checked; });
        if (!escolhidas.length) { toast("Marque ao menos um cartão."); return; }
        confirmar("Atualizar " + escolhidas.length + " cartão(ões)? O conteúdo será alterado; o progresso é mantido.", { sim: "Atualizar" })
          .then(function (ok) {
            if (!ok) return;
            var n = App.importador.aplicarAtualizacoes(escolhidas);
            toast(n + " cartão(ões) atualizado(s).");
            ir("#/banco");
          });
      }, { classe: "btn-suave", bloco: true }));
    }

    if (!an.novos.length && !an.diferentes.length && !an.invalidos.length) {
      alvo.appendChild(h("p", { class: "frase" }, "Tudo neste arquivo já está no aplicativo. Nada a fazer."));
    }
  }

  // ==================================================================
  // TELA: banco de questões (responsável)
  // ==================================================================
  function telaBanco(q) {
    vista.banco = vista.banco || { busca: "", disc: "", assunto: "", sub: "", tipo: "", prioridade: "" };
    var f = vista.banco;
    VIEW.appendChild(voltar("#/responsavel", "Área do responsável"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Banco de questões"));
    VIEW.appendChild(h("p", { class: "aviso-suave" }, "Área do responsável. Evite mexer aqui durante os estudos."));

    var buscaInput = h("input", { type: "search", value: f.busca, placeholder: "Buscar por texto ou id…",
      oninput: function () { f.busca = this.value; listar(); } });
    VIEW.appendChild(campo("Buscar", buscaInput));

    var filtros = h("div", { class: "filtros" }, [
      selectFiltro("Disciplina", [""].concat(content.disciplinas()), f.disc, function (v) { f.disc = v; f.assunto = ""; f.sub = ""; telaBancoRedesenhar(); }),
      f.disc ? selectFiltro("Assunto", [""].concat(content.assuntos(f.disc)), f.assunto, function (v) { f.assunto = v; f.sub = ""; telaBancoRedesenhar(); }) : null,
      (f.disc && f.assunto) ? selectFiltro("Subassunto", [""].concat(content.subassuntos(f.disc, f.assunto)), f.sub, function (v) { f.sub = v; listar(); }) : null,
      selectFiltro("Tipo", [""].concat(content.tipos()), f.tipo, function (v) { f.tipo = v; listar(); }),
      selectFiltro("Prioridade", ["", "1", "2", "3", "4", "5"], f.prioridade, function (v) { f.prioridade = v; listar(); })
    ]);
    VIEW.appendChild(filtros);

    var contagem = h("p", { class: "suave" });
    var lista = h("div", { class: "col" });
    VIEW.appendChild(contagem);
    VIEW.appendChild(lista);

    var ocultos = content.ocultados();
    if (ocultos.length) {
      var ul = h("div", { class: "col" });
      ocultos.forEach(function (c) {
        ul.appendChild(h("div", { class: "linha-oculta" }, [
          h("span", {}, c.id + " — " + util.truncate(c.pergunta || "", 70)),
          botao("Reativar", function () { content.restoreCard(c.id); toast("Cartão reativado."); telaBancoRedesenhar(); }, { classe: "btn-suave" })
        ]));
      });
      VIEW.appendChild(h("details", {}, [h("summary", {}, "Cartões ocultados (" + ocultos.length + ")"), ul]));
    }

    listar();

    function listar() {
      util.clear(lista);
      var res = content.getAll().filter(function (c) {
        if (f.disc && c.disciplina !== f.disc) return false;
        if (f.assunto && c.assunto !== f.assunto) return false;
        if (f.sub && c.subassunto !== f.sub) return false;
        if (f.tipo && c.tipo !== f.tipo) return false;
        if (f.prioridade && String(c.prioridade) !== f.prioridade) return false;
        if (f.busca) {
          var n = util.normalize(f.busca);
          var alvo = util.normalize(c.id + " " + c.pergunta + " " + c.resposta + " " + c.explicacao);
          if (alvo.indexOf(n) === -1) return false;
        }
        return true;
      });
      contagem.textContent = res.length + " cartão(ões).";
      res.slice(0, 300).forEach(function (c) { lista.appendChild(linhaBanco(c)); });
      if (res.length > 300) lista.appendChild(h("p", { class: "suave" }, "Mostrando os primeiros 300. Refine os filtros."));
    }
  }

  function telaBancoRedesenhar() { util.clear(VIEW); telaBanco({}); }

  function selectFiltro(rot, valores, atual, onchange) {
    return h("label", { class: "campo mini" }, [
      h("span", { class: "campo-rot" }, rot),
      h("select", { onchange: function () { onchange(this.value); } },
        valores.map(function (v) {
          return h("option", { value: v, selected: String(atual) === String(v) }, v === "" ? "Todos" : v);
        }))
    ]);
  }

  function linhaBanco(c) {
    var p = state.getProgresso(c.id);
    return h("div", { class: "linha-banco" }, [
      h("div", { class: "lb-topo" }, [
        chip(c.tipo, "n"), chip("P" + c.prioridade, "n"),
        c.pegadinha ? chip("pegadinha", "dif") : null,
        c._importado ? chip("importado", "novo") : null,
        c._editado ? chip("editado", "rev") : null,
        p ? dominioBadge(p.dominio) : null
      ]),
      h("p", { class: "lb-perg" }, c.pergunta),
      h("p", { class: "lb-trilha suave" }, c.disciplina + " › " + c.assunto + " › " + c.subassunto + "  ·  " + c.id),
      h("div", { class: "lb-acoes" }, [
        botao("Ver", function () { verCard(c); }, { classe: "btn-suave" }),
        botao("Editar", function () { editarCard(c); }, { classe: "btn-suave" }),
        botao("Excluir", function () {
          confirmar("Excluir o cartão " + c.id + "? Ele sai dos estudos. O progresso é mantido e cartões oficiais podem ser reativados depois.", { sim: "Excluir", perigo: true })
            .then(function (ok) { if (ok) { content.deleteCard(c.id); toast("Cartão excluído."); telaBancoRedesenhar(); } });
        }, { classe: "btn-perigo" })
      ])
    ]);
  }

  function verCard(c) {
    var p = state.getProgresso(c.id);
    var corpo = [
      h("p", {}, [h("span", { class: "rl-rot" }, "Pergunta: "), c.pergunta]),
      h("p", {}, [h("span", { class: "rl-rot" }, "Resposta: "), c.resposta]),
      c.explicacao ? h("p", {}, [h("span", { class: "rl-rot" }, "Explicação: "), c.explicacao]) : null,
      Array.isArray(c.alternativas) ? h("p", {}, [h("span", { class: "rl-rot" }, "Alternativas: "), c.alternativas.join(" | ")]) : null,
      c.correta != null ? h("p", {}, [h("span", { class: "rl-rot" }, "Correta: "), String(c.correta)]) : null,
      typeof c.gabarito === "boolean" ? h("p", {}, [h("span", { class: "rl-rot" }, "Gabarito: "), c.gabarito ? "Certo" : "Errado"]) : null,
      c.fonte ? h("p", { class: "suave" }, "Fonte: " + c.fonte) : null,
      h("hr"),
      p ? h("p", { class: "suave" }, "Revisões: " + p.revisoes + " · acertos: " + p.acertos + " · erros: " + p.erros + " · difíceis: " + p.dificeis + " · sequência: " + p.sequencia + " · intervalo: " + p.intervalo + " dia(s) · próxima: " + (p.proximaRevisao ? p.proximaRevisao.slice(0, 10) : "-"))
        : h("p", { class: "suave" }, "Ainda não estudado.")
    ];
    modal(c.id, corpo, [botao("Fechar", function () { this.closest(".overlay").remove(); }, { classe: "btn-primario" })]);
  }

  function editarCard(c) {
    var campos = {};
    function inp(nome, valor, tag) {
      var el = h(tag || "input", { type: "text", value: valor == null ? "" : valor });
      if (tag === "textarea") { el.value = valor == null ? "" : valor; el.rows = 3; }
      campos[nome] = el;
      return h("label", { class: "campo" }, [h("span", { class: "campo-rot" }, nome), el]);
    }
    var corpo = [
      inp("pergunta", c.pergunta, "textarea"),
      inp("resposta", c.resposta, "textarea"),
      inp("explicacao", c.explicacao, "textarea"),
      inp("fonte", c.fonte),
      inp("disciplina", c.disciplina),
      inp("assunto", c.assunto),
      inp("subassunto", c.subassunto),
      inp("tipo", c.tipo),
      inp("prioridade", c.prioridade),
      Array.isArray(c.alternativas) ? inp("alternativas", c.alternativas.join(" | ")) : null,
      c.correta != null ? inp("correta", c.correta) : null,
      typeof c.gabarito === "boolean" ? inp("gabarito", c.gabarito ? "certo" : "errado") : null,
      h("p", { class: "suave" }, "Editar altera o conteúdo do cartão. O id e o histórico são preservados.")
    ];
    var m = modal("Editar " + c.id, corpo, [
      botao("Cancelar", function () { m.fechar(); }, { classe: "btn-suave" }),
      botao("Salvar", function () {
        var patch = {
          pergunta: campos.pergunta.value.trim(),
          resposta: campos.resposta.value.trim(),
          explicacao: campos.explicacao.value.trim(),
          fonte: campos.fonte.value.trim(),
          disciplina: campos.disciplina.value.trim(),
          assunto: campos.assunto.value.trim(),
          subassunto: campos.subassunto.value.trim(),
          tipo: campos.tipo.value.trim(),
          prioridade: parseInt(campos.prioridade.value, 10) || c.prioridade
        };
        if (campos.alternativas) patch.alternativas = campos.alternativas.value.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
        if (campos.correta) patch.correta = campos.correta.value.trim();
        if (campos.gabarito) patch.gabarito = util.normalize(campos.gabarito.value).indexOf("cert") === 0;
        content.updateCard(c.id, patch);
        m.fechar(); toast("Cartão salvo."); telaBancoRedesenhar();
      }, { classe: "btn-primario" })
    ]);
  }

  // ==================================================================
  // TELA: progresso
  // ==================================================================
  function telaProgresso(disc, assunto) {
    VIEW.appendChild(voltar(assunto ? "#/a/" + enc(disc) + "/" + enc(assunto) : "#/"));
    if (disc && assunto) return progressoAssunto(disc, assunto);

    VIEW.appendChild(h("h1", { class: "tit" }, "Meu progresso"));
    var todos = content.getAll().map(function (c) { return c.id; });
    var g = state.contarSituacoes(todos);
    VIEW.appendChild(h("div", { class: "tiles pequenos" }, [
      tile("📦", g.total, "cartões"),
      tile("📖", g.estudados, "estudados"),
      tile("🆕", g.novos, "novos"),
      tile("🟢", g.dominados, "dominados"),
      tile("🟠", g.dificeis, "difíceis"),
      tile("🎯", (g.taxaAcerto == null ? "–" : g.taxaAcerto + "%"), "acerto médio")
    ]));

    content.disciplinas().forEach(function (d) {
      VIEW.appendChild(h("h2", { class: "secao-tit" }, d));
      var col = h("div", { class: "col" });
      content.assuntos(d).forEach(function (a) {
        var s = state.contarSituacoes(content.idsDe(d, a, null));
        col.appendChild(h("a", { class: "linha-prog", href: "#/progresso/" + enc(d) + "/" + enc(a) }, [
          h("div", { class: "lp-topo" }, [h("strong", {}, a), h("span", { class: "suave" }, s.estudados + "/" + s.total)]),
          barra(s.pctEstudado),
          h("div", { class: "ca-nums" }, [
            chip("Acerto: " + (s.taxaAcerto == null ? "–" : s.taxaAcerto + "%"), "n"),
            chip("Domínio: " + s.pctDominio + "%", "dom"),
            chip("Difíceis: " + s.dificeis, s.dificeis ? "dif" : "n"),
            chip("Erros recentes: " + s.errosRecentes, s.errosRecentes ? "rev" : "n")
          ])
        ]));
      });
      VIEW.appendChild(col);
    });
  }

  function progressoAssunto(disc, assunto) {
    VIEW.appendChild(h("h1", { class: "tit" }, assunto));
    var s = state.contarSituacoes(content.idsDe(disc, assunto, null));
    VIEW.appendChild(h("div", { class: "tiles pequenos" }, [
      tile("📦", s.total, "total"),
      tile("📖", s.estudados, "estudados"),
      tile("🆕", s.novos, "novos"),
      tile("🎯", (s.taxaAcerto == null ? "–" : s.taxaAcerto + "%"), "taxa de acerto"),
      tile("🟢", s.dominados, "dominados"),
      tile("🟠", s.dificeis, "difíceis"),
      tile("🔴", s.errosRecentes, "erros recentes")
    ]));

    var subs = content.subassuntos(disc, assunto).map(function (sub) {
      var ss = state.contarSituacoes(content.idsDe(disc, assunto, sub));
      ss.nome = sub;
      ss.necessidade = ss.revisar + ss.dificeis * 2 + ss.errosRecentes * 2 + ss.novos * 0.2;
      return ss;
    });
    var precisam = subs.slice().sort(function (a, b) { return b.necessidade - a.necessidade; }).filter(function (x) { return x.necessidade > 0; }).slice(0, 3);
    if (precisam.length) {
      VIEW.appendChild(h("div", { class: "cartao-info" }, [
        h("strong", {}, "Subassuntos que mais precisam de revisão:"),
        h("ul", {}, precisam.map(function (x) { return h("li", {}, x.nome + " (" + x.revisar + " p/ revisar, " + x.dificeis + " difíceis)"); }))
      ]));
    }

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "POR SUBASSUNTO"));
    var col = h("div", { class: "col" });
    subs.forEach(function (ss) {
      col.appendChild(h("div", { class: "linha-prog" }, [
        h("div", { class: "lp-topo" }, [h("strong", {}, ss.nome), h("span", { class: "suave" }, ss.estudados + "/" + ss.total)]),
        barra(ss.pctEstudado),
        h("div", { class: "ca-nums" }, [
          chip("Novos: " + ss.novos, "novo"),
          chip("Domínio: " + ss.pctDominio + "%", "dom"),
          chip("Difíceis: " + ss.dificeis, ss.dificeis ? "dif" : "n"),
          chip("Acerto: " + (ss.taxaAcerto == null ? "–" : ss.taxaAcerto + "%"), "n")
        ])
      ]));
    });
    VIEW.appendChild(col);
  }

  // ==================================================================
  // TELA: backup
  // ==================================================================
  function telaBackup() {
    VIEW.appendChild(voltar("#/responsavel", "Área do responsável"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Backup"));
    VIEW.appendChild(h("div", { class: "cartao-info" }, [
      h("p", {}, "O backup guarda tudo: cartões importados, progresso, histórico, estatísticas, sequência, favoritos e configurações."),
      h("p", { class: "suave" }, "Guarde o arquivo em um lugar seguro (e-mail, nuvem ou pen drive).")
    ]));
    VIEW.appendChild(botao("EXPORTAR BACKUP COMPLETO", function () {
      App.backup.exportar();
      toast("Backup gerado. Verifique os downloads.");
    }, { classe: "btn-primario", bloco: true }));

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "RESTAURAR BACKUP"));
    VIEW.appendChild(h("p", { class: "aviso-suave" }, "A restauração substitui TODOS os dados locais por outros do arquivo. Use com cuidado."));
    var file = h("input", { type: "file", accept: ".json,application/json" });
    VIEW.appendChild(campo("Arquivo de backup", file));
    VIEW.appendChild(botao("RESTAURAR", function () {
      var f = file.files && file.files[0];
      if (!f) { toast("Escolha um arquivo primeiro."); return; }
      App.backup.lerArquivo(f).then(function (obj) {
        var r = App.backup.resumoDoBackup(obj);
        if (!r) { toast("Arquivo de backup inválido."); return; }
        confirmar("Restaurar este backup? Isto substitui todo o progresso atual.\n\nGerado em: " + (r.geradoEm || "").slice(0, 19) +
          "\nCartões com progresso: " + r.cartoesComProgresso + "\nCartões importados: " + r.cartoesImportados,
          { sim: "Restaurar", perigo: true }).then(function (ok) {
          if (!ok) return;
          try { App.backup.restaurar(obj); toast("Backup restaurado."); ir("#/"); }
          catch (e) { toast("Erro ao restaurar: " + e.message); }
        });
      }).catch(function (e) { toast(e.message); });
    }, { classe: "btn-perigo", bloco: true }));
  }

  // ==================================================================
  // TELA: configurações
  // ==================================================================
  function telaConfig() {
    var cfg = state.getConfig();
    VIEW.appendChild(voltar("#/responsavel", "Área do responsável"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Configurações"));

    var meta = h("input", { type: "number", min: 5, max: 60, step: 5, value: cfg.metaDiaria,
      onchange: function () { state.setConfig({ metaDiaria: util.clamp(parseInt(this.value, 10) || 15, 5, 60) }); toast("Meta salva."); } });
    VIEW.appendChild(campo("Meta diária (cartões)", meta));

    var tam = h("select", { onchange: function () { state.setConfig({ tamanhoSessaoPadrao: this.value === "todos" ? "todos" : parseInt(this.value, 10) }); toast("Salvo."); } },
      ["5", "10", "15", "20"].map(function (v) { return h("option", { value: v, selected: String(cfg.tamanhoSessaoPadrao) === v }, v); }));
    VIEW.appendChild(campo("Tamanho padrão da sessão", tam));

    var atalhos = h("input", { type: "checkbox", checked: cfg.mostrarAtalhos,
      onchange: function () { state.setConfig({ mostrarAtalhos: this.checked }); } });
    VIEW.appendChild(h("label", { class: "op-inline" }, [atalhos, " Mostrar atalhos de teclado no computador"]));

    var tema = h("select", { onchange: function () { state.setConfig({ tema: this.value }); aplicarTema(); } },
      [["auto", "Automático"], ["claro", "Claro"], ["escuro", "Escuro"]].map(function (p) {
        return h("option", { value: p[0], selected: cfg.tema === p[0] }, p[1]);
      }));
    VIEW.appendChild(campo("Tema", tema));

    VIEW.appendChild(h("h2", { class: "secao-tit" }, "ZONA DE CUIDADO"));
    VIEW.appendChild(botao("Apagar todo o progresso", function () {
      confirmar("Isto apaga o progresso, o histórico, a sequência e as estatísticas. Os cartões continuam. Não dá para desfazer.", { sim: "Apagar tudo", perigo: true })
        .then(function (ok) {
          if (!ok) return;
          confirmar("Tem certeza mesmo? Considere exportar um backup antes.", { sim: "Sim, apagar", perigo: true }).then(function (ok2) {
            if (ok2) { state.apagarProgresso(); toast("Progresso apagado."); ir("#/"); }
          });
        });
    }, { classe: "btn-perigo", bloco: true }));
  }

  // ==================================================================
  // TELA: área do responsável
  // ==================================================================
  function telaResponsavel() {
    VIEW.appendChild(voltar("#/"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Área do responsável"));
    VIEW.appendChild(h("p", { class: "suave" }, "Ferramentas de administração. Não é necessário login nesta versão."));
    var grade = h("div", { class: "grade-disc" }, [
      linkCartao("📥", "Importar novas questões", "#/importar"),
      linkCartao("🗂️", "Banco de questões", "#/banco"),
      linkCartao("💾", "Backup e restauração", "#/backup"),
      linkCartao("⚙️", "Configurações", "#/config"),
      linkCartao("📈", "Progresso detalhado", "#/progresso"),
      linkCartao("❓", "Ajuda", "#/ajuda")
    ]);
    VIEW.appendChild(grade);
  }

  function linkCartao(ico, txt, href) {
    return h("a", { class: "bloco-disc", href: href }, [
      h("span", { class: "bd-ico" }, ico), h("span", { class: "bd-nome" }, txt)
    ]);
  }

  // ==================================================================
  // TELA: ajuda
  // ==================================================================
  function telaAjuda() {
    VIEW.appendChild(voltar("#/"));
    VIEW.appendChild(h("h1", { class: "tit" }, "Ajuda"));
    VIEW.appendChild(h("div", { class: "cartao-info ajuda" }, [
      h("h3", {}, "Para o estudante"),
      h("ul", {}, [
        h("li", {}, "Escolha a disciplina, depois o assunto."),
        h("li", {}, "Toque em “Estudar” e responda cada cartão com calma."),
        h("li", {}, "Leia a pergunta, pense na resposta e toque em “Mostrar resposta”."),
        h("li", {}, "Diga como foi: 🔴 errei, 🟠 foi difícil, 🟢 acertei, 🔵 foi fácil."),
        h("li", {}, "Errar faz parte. O cartão volta depois para você tentar de novo.")
      ]),
      h("h3", {}, "Para o responsável — adicionar novas questões"),
      h("ol", {}, [
        h("li", {}, "Crie um arquivo JSON com os novos cartões (mesmo formato dos que já existem)."),
        h("li", {}, "Opção simples: use a tela “Importar novas questões” e cole o JSON."),
        h("li", {}, "Opção definitiva: coloque o arquivo na pasta data/ e cite-o em data/catalog.json."),
        h("li", {}, "O aplicativo só adiciona ids novos. Nada é apagado e o progresso é preservado.")
      ]),
      h("h3", {}, "Funciona offline?"),
      h("p", {}, "Sim. Depois de abrir a primeira vez com internet, o aplicativo continua funcionando sem conexão. Para instalar no celular, use a opção “Adicionar à tela inicial” do navegador."),
      h("h3", {}, "Importante"),
      h("p", { class: "suave" }, "Este aplicativo ajuda a memorizar e revisar. Ele não substitui o professor, o livro didático nem a orientação escolar.")
    ]));
  }

  // ==================================================================
  // Tema
  // ==================================================================
  function aplicarTema() {
    var t = state.getConfig().tema;
    var root = document.documentElement;
    if (t === "claro") root.setAttribute("data-tema", "claro");
    else if (t === "escuro") root.setAttribute("data-tema", "escuro");
    else root.removeAttribute("data-tema");
  }

  // ==================================================================
  // Montagem
  // ==================================================================
  function mount(rootEl) {
    var barra = h("div", { id: "barra-topo" }, [
      h("a", { class: "bt-titulo", href: "#/" }, content.meta().titulo || "Estudo Escolar"),
      h("a", { class: "bt-resp", href: "#/responsavel" }, "Responsável")
    ]);
    document.body.insertBefore(barra, document.body.firstChild);
    util.clear(rootEl);
    VIEW = h("main", { id: "view", class: "wrap" });
    rootEl.appendChild(VIEW);

    aplicarTema();
    window.addEventListener("hashchange", render);
    util.on("progress-changed", function () {
      var rota = parseHash().caminho[0] || "";
      if (["", "d", "a", "progresso", "banco"].indexOf(rota) !== -1) render();
    });
    util.on("config-changed", aplicarTema);
    util.on("storage-error", function () {
      toast("O armazenamento do navegador está cheio ou bloqueado. Faça um backup e libere espaço.");
    });
    render();
  }

  return { mount: mount, render: render, toast: toast, frase: frase };
})();
