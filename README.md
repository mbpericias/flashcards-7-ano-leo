# Estudo de Ciências — 7º ano

Aplicativo web de **flashcards** para estudar Ciências, com **recuperação ativa**,
**repetição espaçada**, sessões curtas, funcionamento **offline** e instalação como
**app no celular** (PWA). Não precisa de internet depois da primeira abertura, não
tem servidor, login, propaganda nem custo.

O aplicativo (o "motor") é **separado** do conteúdo. Os flashcards ficam em
arquivos JSON dentro de `data/`. Para acrescentar matéria nova, basta criar um
novo JSON e citá-lo no catálogo — sem mexer no código.

---

## 1. Como executar

### Opção A — abrir direto (mais simples, para experimentar)
Dê dois cliques em **`index.html`**. Funciona para estudar, importar e fazer backup.
Nesse modo, alguns navegadores bloqueiam a leitura dos arquivos `data/*.json`; por
isso existe uma cópia de reserva embutida em `js/embedded-content.js`, que o app usa
automaticamente. O modo **offline instalável (PWA)** só funciona nas opções B ou C.

### Opção B — servidor local (recomendado para testar tudo, inclusive offline)
No Windows, dentro da pasta do projeto:

```bash
powershell -ExecutionPolicy Bypass -File tools/servir.ps1
```

Depois abra **http://localhost:8080**. Para parar, feche a janela ou aperte `Ctrl+C`.

Se você tiver Python instalado, também serve:

```bash
python -m http.server 8080
```

### Opção C — publicar no GitHub Pages (para usar no celular)
1. Crie um repositório no GitHub e envie **todos os arquivos desta pasta**.
2. Em **Settings → Pages**, escolha a branch (`main`) e a pasta `/ (root)`.
3. Acesse o endereço gerado (algo como `https://SEU-USUARIO.github.io/SEU-REPO/`).
4. Todos os caminhos são **relativos**, então funciona em subpasta sem ajustes.

---

## 2. Instalar no celular

1. Abra o endereço do GitHub Pages no navegador do celular (Chrome no Android,
   Safari no iPhone).
2. **Android/Chrome:** menu ⋮ → "Adicionar à tela inicial" / "Instalar app".
3. **iPhone/Safari:** botão Compartilhar → "Adicionar à Tela de Início".
4. O app abre em tela cheia e funciona **sem internet** depois da primeira vez.

Backup e importação de questões funcionam igual no celular e no computador.

---

## 3. Estrutura do projeto

```
index.html                 Página única
manifest.webmanifest       Configuração do PWA
sw.js                      Service worker (offline)
css/styles.css             Estilos
icons/                     Ícones do app
js/
  util.js                  Utilidades, armazenamento local, eventos
  srs.js                   Repetição espaçada (algoritmo)
  content.js               Carrega catálogo + bancos, monta a hierarquia
  state.js                 Progresso, estatísticas, sequência, configurações
  session.js               Sessões de estudo e Simulado
  admin.js                 Importação incremental e backup
  ui.js                    Telas e navegação
  app.js                   Inicialização
  embedded-content.js      Cópia de reserva do conteúdo (gerada)
data/
  catalog.json             Lista dos bancos oficiais
  cie-vertebrados.json     Banco: Reino Animal — Vertebrados
  cie-sistematica.json     Banco: Sistemática e Biodiversidade
  cie-reino-vegetal.json   Banco: Reino Vegetal
exemplos/
  exemplo-importacao.json  Exemplo para testar a importação
tools/
  servir.ps1               Servidor local para testes
  gerar-embutido.ps1       Regera js/embedded-content.js a partir de data/
```

O motor (`app.js`, `state.js`, `ui.js`, `content.js`, `srs.js`...) **não muda**
quando você adiciona uma disciplina, um assunto ou um banco novo.

---

## 4. Como adicionar novas questões

### Jeito rápido (pelo app)
1. Abra **Área do responsável → Importar novas questões**.
2. Cole o JSON (uma lista de cartões ou `{ "cards": [ ... ] }`) ou escolha um arquivo.
3. Clique em **Analisar**. O app mostra:
   - quantos cartões são **novos**,
   - quantos **já existem iguais**,
   - quantos existem **diferentes** (atualização exige confirmação),
   - quantos são **inválidos** (com o motivo).
4. Clique em **Importar novos**. O app só acrescenta **ids que ainda não existem**.
   Nada é apagado e nenhum progresso é perdido.

### Jeito definitivo (para publicar junto com o app)
1. Crie `data/meu-banco.json` no mesmo formato dos bancos existentes.
2. Acrescente uma linha em `data/catalog.json`:

```json
{ "id": "meu-banco", "titulo": "Meu banco", "arquivo": "data/meu-banco.json" }
```

3. (Opcional) Rode `powershell -ExecutionPolicy Bypass -File tools/gerar-embutido.ps1`
   para atualizar a cópia de reserva usada no modo "abrir direto".
4. Publique. O app carrega o novo banco automaticamente e **só adiciona os ids novos**.

### Formato de um cartão

```json
{
  "id": "CIE-VER-MAM-001",
  "disciplina": "Ciências",
  "assunto": "Reino Animal — Vertebrados",
  "subassunto": "Mamíferos",
  "ano_escolar": "7º ano",
  "prioridade": 3,
  "tipo": "pergunta_direta",
  "pegadinha": false,
  "pergunta": "Qual característica diferencia os mamíferos dos demais vertebrados?",
  "resposta": "As glândulas mamárias produtoras de leite.",
  "explicacao": "O material também apresenta pelos, respiração pulmonar e dentes diferenciados.",
  "fonte": "Material escolar — Reino Animal: Vertebrados"
}
```

Tipos aceitos: `pergunta_direta`, `certo_errado`, `multipla_escolha`, `completar`,
`comparacao` (e outros no futuro).

- **Certo ou errado:** acrescente `"gabarito": true` ou `false`.
- **Múltipla escolha:** acrescente `"alternativas": ["...", "...", "..."]` e
  `"correta": "texto exato da alternativa certa"`. Nunca invente alternativas.
- **id** é obrigatório, único e **estável** (não mude depois de publicado —
  o progresso do estudante fica ligado a ele).
- **prioridade** vai de 1 a 5 (5 = mais importante; entra antes nas revisões).

A hierarquia **disciplina → assunto → subassunto** aparece sozinha, a partir do que
existe nos cartões. Para controlar a ordem dos assuntos/subassuntos, basta ordenar
os cartões dentro do JSON.

---

## 5. Backup

- **Área do responsável → Backup → Exportar backup completo**: baixa um arquivo
  `.json` com cartões importados, progresso, histórico, estatísticas, sequência,
  favoritos e configurações.
- **Restaurar**: escolhe um arquivo de backup e, **após confirmação**, substitui
  todos os dados locais. É a única operação que substitui tudo de uma vez.

Guarde o backup em local seguro (e-mail, nuvem ou pen drive) de tempos em tempos.

---

## 6. Como funciona a repetição espaçada

A cada cartão, o estudante responde como foi lembrar:

| Resposta        | O que acontece |
|-----------------|----------------|
| 🔴 Errei        | Volta ainda nesta sessão (depois de outros cartões) e o intervalo volta a ser curto. |
| 🟠 Foi difícil  | O intervalo cresce pouco. |
| 🟢 Acertei      | O intervalo cresce normalmente. |
| 🔵 Foi fácil    | O intervalo cresce mais. |

- Um cartão **nunca** reaparece logo depois de ser respondido.
- Um cartão só é considerado **🟢 Dominado** após vários acertos seguidos
  (nunca com um único acerto).
- Níveis de domínio: 🔴 Precisa praticar · 🟠 Aprendendo · 🟡 Quase lá · 🟢 Dominado.

Para cada cartão são guardados: revisões, acertos, erros, sequência de acertos,
última revisão, próxima revisão, intervalo e nível de domínio.

---

## 7. Verificar o modo offline (PWA)

Depois de abrir o app por um servidor (opção B ou C) **uma vez**:

1. No Chrome, abra as Ferramentas do Desenvolvedor → aba **Application** →
   **Service Workers**: deve aparecer o `sw.js` "activated".
2. Marque **Offline** (ou ative o modo avião) e recarregue a página: o app
   continua abrindo e funcionando.

> Observação: alguns navegadores embutidos (como pré-visualizações dentro de
> outros programas) bloqueiam service workers. Teste no Chrome, Edge, Firefox ou
> Safari normais.

---

## 8. Conteúdo escolar

Os flashcards iniciais foram feitos **apenas com o que está no material fornecido**
(dois mapas mentais de Ciências do 7º ano: "Reino Animal — Vertebrados" e
"Sistemática / Vegetais: briófitas e pteridófitas"). O aplicativo é uma ferramenta
de memorização e revisão — **não substitui** o professor, o livro didático nem a
orientação escolar.

Trecho sinalizado para conferência do responsável:
- **Répteis → pele:** o material manuscrito parece trazer um termo pouco legível
  logo após "Pele seca, rica em ..." (possivelmente "queratina"). O cartão
  `CIE-VER-REP-001` foi redigido **sem** esse termo, dizendo apenas "pele seca,
  revestida por escamas ou placas córneas, o que evita a perda de água". Se
  confirmar a palavra, edite o cartão em **Banco de questões**.
