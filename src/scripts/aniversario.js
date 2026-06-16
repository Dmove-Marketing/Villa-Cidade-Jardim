/* Scripts extraídos de aniversario.html */

(function(){
  // ===== CONFIG =====
  var FIELD_ID    = 'form-field-fonte'; // id comum no Elementor
  var INTERVAL_MS = 300;                // tenta com mais frequência
  var MAX_TRIES   = 20;                 // dá mais tempo pro GTM/HTML inicializar

  // ===== HELPERS (ES5) =====
  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?|{}()[\]\\/+^])/g,'\\$1') + '=([^;]*)'));
    return m ? m[1] : ''; // mantém RAW (sem decode aqui)
  }

  // decode seguro (igual à sua estratégia do n8n)
  function safeDecode(v){
    if (v == null) return '';
    var s = String(v).replace(/\+/g, ' ');
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s; // se quebrar, devolve como veio
    }
  }

  // lê utms padrão a partir de cookies
  function collectUtms(){
    var utms = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    var out = {}, v, i;
    for (i=0;i<utms.length;i++){
      v = getCookie(utms[i]);
      if (v) out[utms[i]] = v;
    }
    return out;
  }

  function getEventIdFromWindow(){
    try {
      if (window.__page_event_id && typeof window.__page_event_id === 'string') {
        return window.__page_event_id;
      }
    } catch(e){}
    return '';
  }

  function collectParams(){
    var p = {}, v;

    // UTM cookies
    var utmObj = collectUtms();
    for (var k in utmObj){ if (utmObj.hasOwnProperty(k)) p[k] = utmObj[k]; }

    // Click IDs (normaliza __* -> sem __)
    v = getCookie('gclid')  || getCookie('__gclid');  if (v) p.gclid  = v;
    v = getCookie('gbraid') || getCookie('__gbraid'); if (v) p.gbraid = v;
    v = getCookie('wbraid') || getCookie('__wbraid'); if (v) p.wbraid = v;

    // Meta IDs
    v = getCookie('fbclid'); if (v) p.fbclid = v;
    v = getCookie('_fbc');   if (v) p.fbc    = v;
    v = getCookie('_fbp');   if (v) p.fbp    = v;

    // External ID (aceita ambos)
    v = getCookie('external_id') || getCookie('_external_id');
    if (v) p.external_id = v;

    // event_id vindo do GTM/HTML (window.__page_event_id) — não cria, só lê
    v = getEventIdFromWindow();
    if (v) p.event_id = v;

    return p;
  }

  // monta query **decodificada** (sem encodeURIComponent em chave/valor)
  function toQuery(params){
    var pairs = [];
    for (var key in params){
      if (!params.hasOwnProperty(key)) continue;
      var val = params[key];
      if (val !== undefined && val !== null && val !== '') {
        // aplica safeDecode em CADA valor individual
        pairs.push(key + '=' + safeDecode(String(val)));
      }
    }
    return pairs.join('&');
  }

  // ===== Seleciona TODOS os inputs "Fonte" (página + popups) =====
  function findFonteInputs(){
    var list = [];
    try {
      // 1) pelo id padrão
      var byId = document.querySelectorAll('#' + CSS.escape(FIELD_ID));
      if (byId && byId.length) list = list.concat([].slice.call(byId));

      // 2) pelo name padrão do Elementor (form_fields[fonte])
      var byName = document.querySelectorAll('input[name="form_fields[fonte]"], textarea[name="form_fields[fonte]"]');
      if (byName && byName.length) list = list.concat([].slice.call(byName));

      // 3) pelo sufixo do name (caso o form renomeie com prefixos)
      var byNameSuffix = document.querySelectorAll('input[name$="[fonte]"], textarea[name$="[fonte]"]');
      if (byNameSuffix && byNameSuffix.length) list = list.concat([].slice.call(byNameSuffix));

      // 4) por atributo data-field-shortcode (algumas versões/temas)
      var byShortcode = document.querySelectorAll('[data-field-shortcode="fonte"]');
      if (byShortcode && byShortcode.length) list = list.concat([].slice.call(byShortcode));

      // Remove duplicados
      var seen = new Set();
      list = list.filter(function(el){
        if (!el || !el.nodeType) return false;
        if (seen.has(el)) return false;
        seen.add(el);
        return true;
      });
    } catch(e){}
    return list;
  }

  // Aplica em TODOS os campos "Fonte": preserva prefixo (antes de '?') e substitui a query inteira (já decodificada)
  function applyWith(params){
    var inputs = findFonteInputs();
    var qs = toQuery(params);
    var hasEventId = !!params.event_id;
    var hasAny = !!qs;

    if (!inputs.length) return { hasAny: hasAny, hasEventId: hasEventId, updated: 0 };

    var updated = 0;
    for (var i=0;i<inputs.length;i++){
      var el = inputs[i];
      var base = String(el.value || '');
      var qpos = base.indexOf('?');
      var prefix = qpos === -1 ? base : base.slice(0, qpos);
      var newVal = prefix + (qs ? '?' + qs : '');
      if (el.value !== newVal){
        el.value = newVal;
        updated++;
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch(e){}
      }
    }

    return { hasAny: hasAny, hasEventId: hasEventId, updated: updated };
  }

  function runWithRetries(){
    var tries = 0;

    function tick(){
      var params = collectParams();
      var flags = applyWith(params);
      tries++;

      var shouldStop = flags.hasEventId || tries >= MAX_TRIES;
      if (!shouldStop){
        setTimeout(tick, INTERVAL_MS);
      }
    }

    // Reaplica quando o GTM/HTML empurrar 'page_event_id_ready'
    try {
      window.dataLayer = window.dataLayer || [];
      var origPush = window.dataLayer.push;
      window.dataLayer.push = function(){
        var res = origPush.apply(this, arguments);
        try {
          var arg = arguments[0] || {};
          if (arg && arg.event === 'page_event_id_ready') {
            var params = collectParams();
            applyWith(params);
          }
        } catch(e){}
        return res;
      };
    } catch(e){}

    // Reaplica quando o Elementor abrir popup
    try {
      if (window.jQuery) {
        window.jQuery(window).on('elementor/popup/show', function(){
          var params = collectParams();
          applyWith(params);
        });
      }
      document.addEventListener('elementor/popup/show', function(){
        var params = collectParams();
        applyWith(params);
      }, true);
    } catch(e){}

    // Fallback: observar mutações de DOM (inserção do popup)
    try {
      var mo = new MutationObserver(function(){
        var params = collectParams();
        applyWith(params);
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      setTimeout(function(){ try{ mo.disconnect(); }catch(e){} }, 20000);
    } catch(e){}

    tick();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', runWithRetries);
  } else {
    runWithRetries();
  }
})();

(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "vniz6iujru");

document.addEventListener('DOMContentLoaded', function() {
    
    const header = document.getElementById('meu-header-fixo');
    
    // Seleciona as seções para calcular o ponto de troca
    let todasAsSecoes = Array.from(document.querySelectorAll('.elementor-section, .e-con'));

    // Filtra para ignorar o próprio header
    const secoes = todasAsSecoes.filter(item => {
        return item.id !== 'meu-header-fixo' && !item.classList.contains('e-child'); 
    });

    if (!header || secoes.length < 2) {
        return; // Sai se não encontrar elementos suficientes
    }

    // Define onde o efeito começa (segunda seção) e termina (penúltima ou última)
    const indiceInicio = 1; 
    const indiceFim = secoes.length >= 3 ? secoes.length - 2 : secoes.length - 1;

    const segundaSecao = secoes[indiceInicio];
    const secaoFinal = secoes[indiceFim];

    function verificarScroll() {
        if(!segundaSecao || !secaoFinal) return;

        const posicaoScroll = window.scrollY;
        
        // Ponto de ativação: 100px antes de chegar na segunda seção
        const pontoInicio = segundaSecao.offsetTop - 100;
        const pontoFim = secaoFinal.offsetTop;

        // Aplica ou remove a classe baseada na posição
        if (posicaoScroll >= pontoInicio && posicaoScroll < pontoFim) {
            header.classList.add('cor-ativa');
        } else {
            header.classList.remove('cor-ativa');
        }
    }

    // Escuta o movimento do scroll
    window.addEventListener('scroll', verificarScroll);
    verificarScroll(); // Executa ao carregar a página
});

{"prefetch":[{"source":"document","where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":["/wp-*.php","/wp-admin/*","/wp-content/uploads/*","/wp-content/*","/wp-content/plugins/*","/wp-content/themes/hello-elementor/*","/*\\?(.+)"]}},{"not":{"selector_matches":"a[rel~=\"nofollow\"]"}},{"not":{"selector_matches":".no-prefetch, .no-prefetch a"}}]},"eagerness":"conservative"}]}

const lazyloadRunObserver = () => {
					const lazyloadBackgrounds = document.querySelectorAll( `.e-con.e-parent:not(.e-lazyloaded)` );
					const lazyloadBackgroundObserver = new IntersectionObserver( ( entries ) => {
						entries.forEach( ( entry ) => {
							if ( entry.isIntersecting ) {
								let lazyloadBackground = entry.target;
								if( lazyloadBackground ) {
									lazyloadBackground.classList.add( 'e-lazyloaded' );
								}
								lazyloadBackgroundObserver.unobserve( entry.target );
							}
						});
					}, { rootMargin: '200px 0px 200px 0px' } );
					lazyloadBackgrounds.forEach( ( lazyloadBackground ) => {
						lazyloadBackgroundObserver.observe( lazyloadBackground );
					} );
				};
				const events = [
					'DOMContentLoaded',
					'elementor/lazyload/observe',
				];
				events.forEach( ( event ) => {
					document.addEventListener( event, lazyloadRunObserver );
				} );

var elementorFrontendConfig = {"environmentMode":{"edit":false,"wpPreview":false,"isScriptDebug":false},"i18n":{"shareOnFacebook":"Compartilhar no Facebook","shareOnTwitter":"Compartilhar no Twitter","pinIt":"Fixar","download":"Baixar","downloadImage":"Baixar imagem","fullscreen":"Tela cheia","zoom":"Zoom","share":"Compartilhar","playVideo":"Reproduzir v\u00eddeo","previous":"Anterior","next":"Pr\u00f3ximo","close":"Fechar","a11yCarouselPrevSlideMessage":"Slide anterior","a11yCarouselNextSlideMessage":"Pr\u00f3ximo slide","a11yCarouselFirstSlideMessage":"Este \u00e9 o primeiro slide","a11yCarouselLastSlideMessage":"Este \u00e9 o \u00faltimo slide","a11yCarouselPaginationBulletMessage":"Ir para o slide"},"is_rtl":false,"breakpoints":{"xs":0,"sm":480,"md":768,"lg":1025,"xl":1440,"xxl":1600},"responsive":{"breakpoints":{"mobile":{"label":"Dispositivos m\u00f3veis no modo retrato","value":767,"default_value":767,"direction":"max","is_enabled":true},"mobile_extra":{"label":"Dispositivos m\u00f3veis no modo paisagem","value":880,"default_value":880,"direction":"max","is_enabled":false},"tablet":{"label":"Tablet no modo retrato","value":1024,"default_value":1024,"direction":"max","is_enabled":true},"tablet_extra":{"label":"Tablet no modo paisagem","value":1200,"default_value":1200,"direction":"max","is_enabled":false},"laptop":{"label":"Notebook","value":1366,"default_value":1366,"direction":"max","is_enabled":false},"widescreen":{"label":"Tela ampla (widescreen)","value":2400,"default_value":2400,"direction":"min","is_enabled":false}},"hasCustomBreakpoints":false},"version":"3.35.0","is_static":false,"experimentalFeatures":{"e_font_icon_svg":true,"additional_custom_breakpoints":true,"container":true,"e_optimized_markup":true,"theme_builder_v2":true,"hello-theme-header-footer":true,"nested-elements":true,"home_screen":true,"global_classes_should_enforce_capabilities":true,"e_variables":true,"cloud-library":true,"e_opt_in_v4_page":true,"e_components":true,"e_interactions":true,"e_editor_one":true,"import-export-customization":true,"mega-menu":true,"e_pro_variables":true},"urls":{"assets":"https:\/\/villacidadejd.com.br\/wp-content\/plugins\/elementor\/assets\/","ajaxurl":"https:\/\/villacidadejd.com.br\/wp-admin\/admin-ajax.php","uploadUrl":"https:\/\/villacidadejd.com.br\/wp-content\/uploads"},"nonces":{"floatingButtonsClickTracking":"2298780adf"},"swiperClass":"swiper","settings":{"page":[],"editorPreferences":[]},"kit":{"active_breakpoints":["viewport_mobile","viewport_tablet"],"global_image_lightbox":"yes","lightbox_enable_counter":"yes","lightbox_enable_fullscreen":"yes","lightbox_enable_zoom":"yes","lightbox_enable_share":"yes","lightbox_title_src":"title","lightbox_description_src":"description","hello_header_logo_type":"title","hello_footer_logo_type":"logo"},"post":{"id":566,"title":"Anivers%C3%A1rio%20%E2%80%93%20Villa%20Cidade%20Jardim","excerpt":"","featuredImage":false}};
//# sourceURL=elementor-frontend-js-before

wp.i18n.setLocaleData( { 'text direction\u0004ltr': [ 'ltr' ] } );
//# sourceURL=wp-i18n-js-after

var ElementorProFrontendConfig = {"ajaxurl":"https:\/\/villacidadejd.com.br\/wp-admin\/admin-ajax.php","nonce":"96e22830d4","urls":{"assets":"https:\/\/villacidadejd.com.br\/wp-content\/plugins\/elementor-pro\/assets\/","rest":"https:\/\/villacidadejd.com.br\/wp-json\/"},"settings":{"lazy_load_background_images":true},"popup":{"hasPopUps":true},"shareButtonsNetworks":{"facebook":{"title":"Facebook","has_counter":true},"twitter":{"title":"Twitter"},"linkedin":{"title":"LinkedIn","has_counter":true},"pinterest":{"title":"Pinterest","has_counter":true},"reddit":{"title":"Reddit","has_counter":true},"vk":{"title":"VK","has_counter":true},"odnoklassniki":{"title":"OK","has_counter":true},"tumblr":{"title":"Tumblr"},"digg":{"title":"Digg"},"skype":{"title":"Skype"},"stumbleupon":{"title":"StumbleUpon","has_counter":true},"mix":{"title":"Mix"},"telegram":{"title":"Telegram"},"pocket":{"title":"Pocket","has_counter":true},"xing":{"title":"XING","has_counter":true},"whatsapp":{"title":"WhatsApp"},"email":{"title":"Email"},"print":{"title":"Print"},"x-twitter":{"title":"X"},"threads":{"title":"Threads"}},"facebook_sdk":{"lang":"pt_BR","app_id":""},"lottie":{"defaultAnimationUrl":"https:\/\/villacidadejd.com.br\/wp-content\/plugins\/elementor-pro\/modules\/lottie\/assets\/animations\/default.json"}};
//# sourceURL=elementor-pro-frontend-js-before

{"baseUrl":"https://s.w.org/images/core/emoji/17.0.2/72x72/","ext":".png","svgUrl":"https://s.w.org/images/core/emoji/17.0.2/svg/","svgExt":".svg","source":{"concatemoji":"https://villacidadejd.com.br/wp-includes/js/wp-emoji-release.min.js?ver=6.9.4"}}

/*! This file is auto-generated */
const a=JSON.parse(document.getElementById("wp-emoji-settings").textContent),o=(window._wpemojiSettings=a,"wpEmojiSettingsSupports"),s=["flag","emoji"];function i(e){try{var t={supportTests:e,timestamp:(new Date).valueOf()};sessionStorage.setItem(o,JSON.stringify(t))}catch(e){}}function c(e,t,n){e.clearRect(0,0,e.canvas.width,e.canvas.height),e.fillText(t,0,0);t=new Uint32Array(e.getImageData(0,0,e.canvas.width,e.canvas.height).data);e.clearRect(0,0,e.canvas.width,e.canvas.height),e.fillText(n,0,0);const a=new Uint32Array(e.getImageData(0,0,e.canvas.width,e.canvas.height).data);return t.every((e,t)=>e===a[t])}function p(e,t){e.clearRect(0,0,e.canvas.width,e.canvas.height),e.fillText(t,0,0);var n=e.getImageData(16,16,1,1);for(let e=0;e<n.data.length;e++)if(0!==n.data[e])return!1;return!0}function u(e,t,n,a){switch(t){case"flag":return n(e,"\ud83c\udff3\ufe0f\u200d\u26a7\ufe0f","\ud83c\udff3\ufe0f\u200b\u26a7\ufe0f")?!1:!n(e,"\ud83c\udde8\ud83c\uddf6","\ud83c\udde8\u200b\ud83c\uddf6")&&!n(e,"\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f","\ud83c\udff4\u200b\udb40\udc67\u200b\udb40\udc62\u200b\udb40\udc65\u200b\udb40\udc6e\u200b\udb40\udc67\u200b\udb40\udc7f");case"emoji":return!a(e,"\ud83e\u1fac8")}return!1}function f(e,t,n,a){let r;const o=(r="undefined"!=typeof WorkerGlobalScope&&self instanceof WorkerGlobalScope?new OffscreenCanvas(300,150):document.createElement("canvas")).getContext("2d",{willReadFrequently:!0}),s=(o.textBaseline="top",o.font="600 32px Arial",{});return e.forEach(e=>{s[e]=t(o,e,n,a)}),s}function r(e){var t=document.createElement("script");t.src=e,t.defer=!0,document.head.appendChild(t)}a.supports={everything:!0,everythingExceptFlag:!0},new Promise(t=>{let n=function(){try{var e=JSON.parse(sessionStorage.getItem(o));if("object"==typeof e&&"number"==typeof e.timestamp&&(new Date).valueOf()<e.timestamp+604800&&"object"==typeof e.supportTests)return e.supportTests}catch(e){}return null}();if(!n){if("undefined"!=typeof Worker&&"undefined"!=typeof OffscreenCanvas&&"undefined"!=typeof URL&&URL.createObjectURL&&"undefined"!=typeof Blob)try{var e="postMessage("+f.toString()+"("+[JSON.stringify(s),u.toString(),c.toString(),p.toString()].join(",")+"));",a=new Blob([e],{type:"text/javascript"});const r=new Worker(URL.createObjectURL(a),{name:"wpTestEmojiSupports"});return void(r.onmessage=e=>{i(n=e.data),r.terminate(),t(n)})}catch(e){}i(n=f(s,u,c,p))}t(n)}).then(e=>{for(const n in e)a.supports[n]=e[n],a.supports.everything=a.supports.everything&&a.supports[n],"flag"!==n&&(a.supports.everythingExceptFlag=a.supports.everythingExceptFlag&&a.supports[n]);var t;a.supports.everythingExceptFlag=a.supports.everythingExceptFlag&&!a.supports.flag,a.supports.everything||((t=a.source||{}).concatemoji?r(t.concatemoji):t.wpemoji&&t.twemoji&&(r(t.twemoji),r(t.wpemoji)))});
//# sourceURL=https://villacidadejd.com.br/wp-includes/js/wp-emoji-loader.min.js

(function() {
    // Função que formata o número do telefone
    function aplicarMascaraTelefone(valor) {
        valor = valor.replace(/\D/g, '');
        if (valor.length > 11) valor = valor.slice(0, 11);
        if (valor.length > 10) {
            return '(' + valor.slice(0, 2) + ') ' + valor.slice(2, 7) + '-' + valor.slice(7);
        } else if (valor.length > 6) {
            return '(' + valor.slice(0, 2) + ') ' + valor.slice(2, 6) + '-' + valor.slice(6);
        } else if (valor.length > 2) {
            return '(' + valor.slice(0, 2) + ') ' + valor.slice(2);
        }
        return valor;
    }

    // Valida se o telefone está no formato de celular (11 dígitos e começa com 9)
    function validarTelefone(campo) {
        if (!campo) return false;
        const digitos = campo.value.replace(/\D/g, '');
        const tamanhoCorreto = digitos.length === 11;
        const nonoDigitoCorreto = digitos.charAt(2) === '9';
        return tamanhoCorreto && nonoDigitoCorreto;
    }

    // Função para exibir ou ocultar a mensagem de erro
    function gerenciarMensagemErro(campo, mostrar) {
        const fieldGroup = campo.closest('.elementor-field-group');
        if (!fieldGroup) return;

        let errorSpan = fieldGroup.querySelector('.telefone-erro-msg');
        if (!errorSpan) {
            errorSpan = document.createElement('span');
            errorSpan.className = 'telefone-erro-msg';
            errorSpan.style.color = '#C0392B';
            errorSpan.style.fontSize = '12px';
            errorSpan.style.display = 'block';
            errorSpan.style.marginTop = '5px';
            fieldGroup.appendChild(errorSpan);
        }

        if (mostrar) {
            errorSpan.textContent = 'Por favor, insira um celular válido com 11 dígitos (DDD + 9...).';
            campo.style.border = '1px solid #C0392B';
        } else {
            errorSpan.textContent = '';
            campo.style.border = '';
        }
    }

    // Função principal que busca e aplica os eventos
    function buscarEaplicarEventos() {
        const camposTelefone = document.querySelectorAll('input[name="form_fields[telefone]"]');
        if (camposTelefone.length === 0) return;

        camposTelefone.forEach(function(campo) {
            // 1. Aplica a máscara ao digitar
            if (!campo.dataset.maskAttached) {
                campo.addEventListener('input', function(e) {
                    e.target.value = aplicarMascaraTelefone(e.target.value);
                    if (validarTelefone(e.target)) {
                        gerenciarMensagemErro(e.target, false);
                    }
                });
                campo.dataset.maskAttached = 'true';
            }

            // 2. Encontra o formulário e o botão de envio
            const form = campo.closest('form.elementor-form');
            if (!form) return;
            
            const submitButton = form.querySelector('button[type="submit"]');
            
            // --- ALTERAÇÃO PRINCIPAL AQUI ---
            // 3. Adiciona o validador no evento de CLIQUE do BOTÃO
            if (submitButton && !submitButton.dataset.validationClickAttached) {
                
                submitButton.addEventListener('click', function(e) {
                    const campoTelefoneNoForm = form.querySelector('input[name="form_fields[telefone]"]');
                    
                    if (!validarTelefone(campoTelefoneNoForm)) {
                        // Bloqueia o clique ANTES que o Elementor possa processá-lo
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        gerenciarMensagemErro(campoTelefoneNoForm, true);
                    } else {
                        gerenciarMensagemErro(campoTelefoneNoForm, false);
                    }
                }, true); // O 'true' no final faz nosso evento rodar antes da maioria dos outros.

                submitButton.dataset.validationClickAttached = 'true';
            }
        });
    }

    // Mantém a verificação periódica para encontrar os formulários
    setInterval(buscarEaplicarEventos, 500);

})();

function inicializarCalendariosPersonalizados() {
const portugueseLocale = {
weekdays: { shorthand: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"], longhand: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"] },
months: { shorthand: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"], longhand: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"] },
firstDayOfWeek: 1,
rangeSeparator: " até ",
ordinal: () => "º"
};

const camposDeData = document.querySelectorAll('input[name="form_fields[data]"]');

camposDeData.forEach(function(campo) {
    if (campo._flatpickr) {
        // Se já tem um calendário, não faz nada para não criar loops.
        return;
    }
    flatpickr(campo, {
        "disableMobile": true,
        "dateFormat": "d/m/Y",
        "locale": portugueseLocale
    });
});

}

// Gatilho para o carregamento inicial da página
window.addEventListener('load', inicializarCalendariosPersonalizados);

// --- NOVO GATILHO UNIVERSAL ---
// Cria um "vigia" que executa a nossa função sempre que novos elementos
// são adicionados à página (como um popup ou widget de chat).
const observer = new MutationObserver(function(mutations) {
// Para evitar execuções múltiplas e desnecessárias, esperamos um instante.
let timer;
clearTimeout(timer);
timer = setTimeout(inicializarCalendariosPersonalizados, 200);
});

// Coloca o "vigia" a observar o corpo inteiro do site.
observer.observe(document.body, {
childList: true,
subtree: true
});