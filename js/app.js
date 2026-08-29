/* app.js — inicialização do aplicativo (motor).
   Não contém conteúdo escolar e não precisa mudar para incluir novos bancos. */
window.App = window.App || {};

(function () {
  "use strict";

  function mostrarErroFatal(msg) {
    var root = document.getElementById("app") || document.body;
    root.innerHTML =
      '<div style="max-width:520px;margin:40px auto;padding:20px;font-family:system-ui,sans-serif;line-height:1.5">' +
      '<h1 style="font-size:20px">Não foi possível iniciar</h1>' +
      '<p>' + String(msg || "Erro desconhecido.") + '</p>' +
      '<p style="color:#666">Dica: abra o aplicativo por um servidor local ou pelo GitHub Pages. ' +
      'Ao abrir o arquivo direto (file://), alguns navegadores bloqueiam a leitura dos bancos JSON — ' +
      'nesse caso o app tenta usar o conteúdo embutido automaticamente.</p>' +
      '</div>';
  }

  function bootstrap() {
    if (!App.util || !App.util.storage.available) {
      mostrarErroFatal("O armazenamento local do navegador está desativado. Ative os cookies/armazenamento do site para usar o aplicativo.");
      return;
    }

    App.content.init().then(function (meta) {
      document.title = (meta.titulo || "Estudo de Ciências") + (meta.ano_escolar ? " · " + meta.ano_escolar : "");
      var root = document.getElementById("app");
      App.ui.mount(root);
      registrarServiceWorker();
      prepararInstalacao();
    }).catch(function (err) {
      console.error(err);
      mostrarErroFatal("Falha ao carregar o conteúdo: " + (err && err.message ? err.message : err));
    });
  }

  function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // Caminho relativo: funciona em subdiretório do GitHub Pages.
    var base = location.pathname.replace(/[^/]*$/, "");
    navigator.serviceWorker.register(base + "sw.js").catch(function (e) {
      console.warn("Service worker não registrado:", e.message);
    });
  }

  // Botão "Instalar" opcional (Android / Chrome desktop).
  function prepararInstalacao() {
    var deferido = null;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferido = e;
      var barra = document.getElementById("barra-topo");
      if (!barra || document.getElementById("btn-instalar")) return;
      var btn = document.createElement("button");
      btn.id = "btn-instalar";
      btn.className = "bt-instalar";
      btn.type = "button";
      btn.textContent = "Instalar";
      btn.addEventListener("click", function () {
        btn.remove();
        if (deferido) { deferido.prompt(); deferido = null; }
      });
      barra.appendChild(btn);
    });
    window.addEventListener("appinstalled", function () {
      var b = document.getElementById("btn-instalar");
      if (b) b.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
