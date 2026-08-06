// ── Navbar scroll ──────────────────────────────
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  const onScroll = () => {
    navbar.classList.toggle('navbar--scrolled', window.scrollY > 50);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ── Hamburger menu ─────────────────────────────
function initBurger() {
  const burger = document.querySelector('.navbar__burger');
  const drawer = document.querySelector('.navbar__drawer');
  if (!burger || !drawer) return;

  burger.addEventListener('click', () => {
    const isOpen = burger.classList.toggle('open');
    drawer.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  drawer.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      burger.classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// ── Accordion FAQ ──────────────────────────────
function initAccordion() {
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.accordion-item.open').forEach(i => {
        if (i !== item) i.classList.remove('open');
      });

      item.classList.toggle('open', !isOpen);
    });
  });
}

// ── i18n ──────────────────────────────────────
const TRANSLATIONS = {
  pt: {
    // navbar
    'nav.logo-span':  'Imóveis',
    'nav.imoveis':    'Imóveis',
    'nav.why':        'Vantagens',
    'nav.about':      'Sobre',
    'nav.faq':        'Dúvidas',
    'nav.contact':    'Contato',
    'nav.cta':        'Falar com {{BROKER_FIRST_NAME}}',
    // hero
    'hero.label':     'Imóveis em {{CITY_DEFAULT}} e região',
    'hero.title':     'Encontre o imóvel certo em <em>{{CITY_DEFAULT}}</em> com quem conhece cada bairro.',
    'hero.subtitle':  'Compra, venda e aluguel de imóveis no Paraguai com acompanhamento completo — do primeiro contato às chaves na mão.',
    'hero.cta1':      'Falar com {{BROKER_FIRST_NAME}}',
    'hero.cta2':      'Ver imóveis',
    // barra de credenciais
    'creds.exp':      '<em>{{STATS_YEARS}}+ anos</em> de mercado imobiliário',
    'creds.deals':    '<em>{{STATS_DEALS}}+</em> negócios fechados',
    'creds.atend':    '<em>Atendimento</em> em português e espanhol',
    'creds.usd':      'Imóveis e renda em <em>dólares</em>',
    // home — seção de destaques
    'home.imoveis.label':    'Imóveis selecionados',
    'home.imoveis.title':    'Oportunidades disponíveis agora',
    'home.imoveis.subtitle': 'Uma seleção de imóveis que {{BROKER_FIRST_NAME}} acompanha pessoalmente em {{CITY_DEFAULT}} e região.',
    'home.imoveis.btn':      'Ver todos os imóveis',
    // por que escolher
    'why.label':      'Por que escolher',
    'why.title':      'Por que fechar negócio com {{BROKER_FIRST_NAME}}?',
    'why.c1.title':   'Acompanhamento completo',
    'why.c1.body':    'Da primeira visita à assinatura: busca personalizada, negociação e formalização com você em cada etapa.',
    'why.c2.title':   'Documentação segura',
    'why.c2.body':    'Análise de contrato e verificação de documentação com profissionais de confiança — sem cláusulas que custam caro depois.',
    'why.c3.title':   'Conhecimento local',
    'why.c3.body':    'Cada bairro tem seu perfil, seu momento e seu preço justo. Você decide com informação de quem vive o mercado todos os dias.',
    'why.c4.title':   'Negociação direta',
    'why.c4.body':    'Contato direto com proprietários e incorporadoras — sem intermediários que encarecem a operação.',
    // sobre
    'about.label':    'Quem te atende',
    'about.title':    'Conheça {{BROKER_FIRST_NAME}}',
    'about.bio':      '{{BIO_PT}}',
    // depoimentos
    'depo.label':     'Quem já comprou',
    'depo.title':     'O que dizem os clientes',
    'depo.t1':        '{{TESTIMONIAL_1_TEXT_PT}}',
    'depo.t2':        '{{TESTIMONIAL_2_TEXT_PT}}',
    'depo.t3':        '{{TESTIMONIAL_3_TEXT_PT}}',
    // FAQ
    'faq.label':      'Dúvidas',
    'faq.title':      'Perguntas frequentes',
    'faq.q1':         'Estrangeiro pode comprar imóvel no Paraguai?',
    'faq.a1':         'Sim. Estrangeiros têm os mesmos direitos de propriedade que paraguaios e podem comprar imóveis em seu próprio nome, com escritura registrada. Não é necessário ter residência para comprar.',
    'faq.q2':         'Preciso estar no Paraguai para comprar ou alugar?',
    'faq.a2':         'O processo pode começar 100% à distância — busca, fotos, vídeos e negociação pelo WhatsApp. Para a escritura, alguns cartórios aceitam procuração; quando necessário, organizamos tudo para resolver em uma única viagem.',
    'faq.q3':         'Quais custos existem além do preço do imóvel?',
    'faq.a3':         'Em geral: custos de escritura e registro, eventuais taxas de transferência e a comissão imobiliária (no Paraguai, normalmente paga pelo proprietário ou incorporadora). Antes de qualquer assinatura, você recebe a conta completa, sem surpresas.',
    'faq.q4':         'Os valores são em dólares ou guaranis?',
    'faq.a4':         'O mercado de compra e venda trabalha majoritariamente em dólares americanos; aluguéis podem ser em dólares ou guaranis. Os anúncios deste site exibem valores em US$.',
    // CTA final
    'cta.title':      'Não encontrou o que procura?',
    'cta.subtitle':   'As melhores oportunidades raramente aparecem na internet. Conte a {{BROKER_FIRST_NAME}} o que você busca — e receba opções selecionadas para o seu perfil.',
    'cta.btn':        'Chamar no WhatsApp',
    // formulário
    'form.label':     'Entre em contato',
    'form.title':     'Ou envie uma mensagem',
    'form.name':      'Nome completo',
    'form.email':     'E-mail',
    'form.whatsapp':  'WhatsApp',
    'form.interest':  'O que você procura?',
    'form.select':    'Selecione...',
    'form.opt.comprar':  'Quero comprar',
    'form.opt.alugar':   'Quero alugar',
    'form.opt.investir': 'Quero investir',
    'form.opt.vender':   'Quero vender meu imóvel',
    'form.message':   'Mensagem',
    'form.submit':    'Enviar mensagem',
    'form.success':   'Mensagem enviada! {{BROKER_FIRST_NAME}} entrará em contato em breve.',
    'form.error':     'Erro ao enviar. Tente novamente ou fale pelo WhatsApp.',
    // footer
    'footer.desc':    '{{CITY_DEFAULT}}, Paraguai · Compra, venda e aluguel de imóveis com acompanhamento completo.',
    'footer.links':   'Links',
    'footer.contact': 'Contato',
    'footer.rights':  'Todos os direitos reservados.',
    // imoveis.html (listagem)
    'imoveis.hero.label':     'Portfólio',
    'imoveis.hero.title':     'Encontre o imóvel certo em <em>{{CITY_DEFAULT}} e região</em>',
    'imoveis.hero.subtitle':  'Apartamentos, casas, terrenos e comerciais selecionados por {{BROKER_FIRST_NAME}} — para morar ou investir.',
    'imoveis.filter.all':     'Todos',
    'imoveis.filter.sale':    'Venda',
    'imoveis.filter.rent':    'Aluguel',
    'imoveis.filter.type':    'Todos os tipos',
    'imoveis.filter.rooms':   'Quartos',
    'imoveis.filter.city':    'Todas as cidades',
    'imoveis.city.asuncion':  'Assunção',
    'imoveis.tipo.apartamento': 'Apartamento',
    'imoveis.tipo.casa':      'Casa',
    'imoveis.tipo.duplex':    'Duplex',
    'imoveis.tipo.terreno':   'Terreno',
    'imoveis.tipo.comercial': 'Comercial',
    'imoveis.tipo.escritorio': 'Escritório',
    'imoveis.filter.more':    'Filtros',
    'imoveis.fmodal.title':   'Filtros',
    'imoveis.fmodal.price':   'Faixa de preço (US$)',
    'imoveis.fmodal.quartos': 'Quartos',
    'imoveis.fmodal.banheiros': 'Banheiros',
    'imoveis.fmodal.area':    'Área mínima (m²)',
    'imoveis.fmodal.estagio': 'Estágio da obra',
    'imoveis.fmodal.comodidades': 'Comodidades',
    'imoveis.fmodal.clear':   'Limpar tudo',
    'imoveis.cta.title':      'Não encontrou o que procura?',
    'imoveis.cta.subtitle':   'As melhores oportunidades raramente aparecem na internet. Conte a {{BROKER_FIRST_NAME}} o que você busca.',
    'imoveis.cta.btn':        'Falar com {{BROKER_FIRST_NAME}}',
  },
  es: {
    // navbar
    'nav.logo-span':  'Inmuebles',
    'nav.imoveis':    'Inmuebles',
    'nav.why':        'Ventajas',
    'nav.about':      'Nosotros',
    'nav.faq':        'Preguntas',
    'nav.contact':    'Contacto',
    'nav.cta':        'Hablar con {{BROKER_FIRST_NAME}}',
    // hero
    'hero.label':     'Inmuebles en {{CITY_DEFAULT_ES}} y alrededores',
    'hero.title':     'Encontrá el inmueble ideal en <em>{{CITY_DEFAULT_ES}}</em> con quien conoce cada barrio.',
    'hero.subtitle':  'Compra, venta y alquiler de inmuebles en Paraguay con acompañamiento completo — del primer contacto a las llaves en mano.',
    'hero.cta1':      'Hablar con {{BROKER_FIRST_NAME}}',
    'hero.cta2':      'Ver inmuebles',
    // barra de credenciais
    'creds.exp':      '<em>{{STATS_YEARS}}+ años</em> de mercado inmobiliario',
    'creds.deals':    '<em>{{STATS_DEALS}}+</em> operaciones cerradas',
    'creds.atend':    '<em>Atención</em> en español y portugués',
    'creds.usd':      'Inmuebles y renta en <em>dólares</em>',
    // home — destaques
    'home.imoveis.label':    'Inmuebles seleccionados',
    'home.imoveis.title':    'Oportunidades disponibles ahora',
    'home.imoveis.subtitle': 'Una selección de inmuebles que {{BROKER_FIRST_NAME}} acompaña personalmente en {{CITY_DEFAULT_ES}} y alrededores.',
    'home.imoveis.btn':      'Ver todos los inmuebles',
    // por que
    'why.label':      'Por qué elegir',
    'why.title':      '¿Por qué cerrar negocio con {{BROKER_FIRST_NAME}}?',
    'why.c1.title':   'Acompañamiento completo',
    'why.c1.body':    'De la primera visita a la firma: búsqueda personalizada, negociación y formalización con vos en cada etapa.',
    'why.c2.title':   'Documentación segura',
    'why.c2.body':    'Análisis de contrato y verificación de documentación con profesionales de confianza — sin cláusulas que cuestan caro después.',
    'why.c3.title':   'Conocimiento local',
    'why.c3.body':    'Cada barrio tiene su perfil, su momento y su precio justo. Decidís con información de quien vive el mercado todos los días.',
    'why.c4.title':   'Negociación directa',
    'why.c4.body':    'Contacto directo con propietarios y desarrolladoras — sin intermediarios que encarecen la operación.',
    // sobre
    'about.label':    'Quién te atiende',
    'about.title':    'Conocé a {{BROKER_FIRST_NAME}}',
    'about.bio':      '{{BIO_ES}}',
    // depoimentos
    'depo.label':     'Quienes ya compraron',
    'depo.title':     'Lo que dicen los clientes',
    'depo.t1':        '{{TESTIMONIAL_1_TEXT_ES}}',
    'depo.t2':        '{{TESTIMONIAL_2_TEXT_ES}}',
    'depo.t3':        '{{TESTIMONIAL_3_TEXT_ES}}',
    // FAQ
    'faq.label':      'Preguntas',
    'faq.title':      'Preguntas frecuentes',
    'faq.q1':         '¿Un extranjero puede comprar un inmueble en Paraguay?',
    'faq.a1':         'Sí. Los extranjeros tienen los mismos derechos de propiedad que los paraguayos y pueden comprar inmuebles a su nombre, con escritura registrada. No es necesario tener residencia para comprar.',
    'faq.q2':         '¿Necesito estar en Paraguay para comprar o alquilar?',
    'faq.a2':         'El proceso puede comenzar 100% a distancia — búsqueda, fotos, videos y negociación por WhatsApp. Para la escritura, algunas escribanías aceptan poder; cuando hace falta, organizamos todo para resolverlo en un solo viaje.',
    'faq.q3':         '¿Qué costos hay además del precio del inmueble?',
    'faq.a3':         'En general: gastos de escritura y registro, eventuales tasas de transferencia y la comisión inmobiliaria (en Paraguay, normalmente la paga el propietario o la desarrolladora). Antes de cualquier firma recibís la cuenta completa, sin sorpresas.',
    'faq.q4':         '¿Los valores son en dólares o guaraníes?',
    'faq.a4':         'El mercado de compraventa trabaja mayormente en dólares americanos; los alquileres pueden ser en dólares o guaraníes. Los anuncios de este sitio muestran valores en US$.',
    // CTA final
    'cta.title':      '¿No encontraste lo que buscás?',
    'cta.subtitle':   'Las mejores oportunidades rara vez aparecen en internet. Contale a {{BROKER_FIRST_NAME}} lo que buscás — y recibí opciones seleccionadas para tu perfil.',
    'cta.btn':        'Escribir por WhatsApp',
    // formulário
    'form.label':     'Contacto',
    'form.title':     'O envianos un mensaje',
    'form.name':      'Nombre completo',
    'form.email':     'E-mail',
    'form.whatsapp':  'WhatsApp',
    'form.interest':  '¿Qué buscás?',
    'form.select':    'Seleccioná...',
    'form.opt.comprar':  'Quiero comprar',
    'form.opt.alugar':   'Quiero alquilar',
    'form.opt.investir': 'Quiero invertir',
    'form.opt.vender':   'Quiero vender mi inmueble',
    'form.message':   'Mensaje',
    'form.submit':    'Enviar mensaje',
    'form.success':   '¡Mensaje enviado! {{BROKER_FIRST_NAME}} se pondrá en contacto pronto.',
    'form.error':     'Error al enviar. Intentá de nuevo o escribí por WhatsApp.',
    // footer
    'footer.desc':    '{{CITY_DEFAULT_ES}}, Paraguay · Compra, venta y alquiler de inmuebles con acompañamiento completo.',
    'footer.links':   'Enlaces',
    'footer.contact': 'Contacto',
    'footer.rights':  'Todos los derechos reservados.',
    // imoveis.html (listagem)
    'imoveis.hero.label':     'Portafolio',
    'imoveis.hero.title':     'Encontrá el inmueble ideal en <em>{{CITY_DEFAULT_ES}} y alrededores</em>',
    'imoveis.hero.subtitle':  'Departamentos, casas, terrenos y comerciales seleccionados por {{BROKER_FIRST_NAME}} — para vivir o invertir.',
    'imoveis.filter.all':     'Todos',
    'imoveis.filter.sale':    'Venta',
    'imoveis.filter.rent':    'Alquiler',
    'imoveis.filter.type':    'Todos los tipos',
    'imoveis.filter.rooms':   'Dormitorios',
    'imoveis.filter.city':    'Todas las ciudades',
    'imoveis.city.asuncion':  'Asunción',
    'imoveis.tipo.apartamento': 'Departamento',
    'imoveis.tipo.casa':      'Casa',
    'imoveis.tipo.duplex':    'Dúplex',
    'imoveis.tipo.terreno':   'Terreno',
    'imoveis.tipo.comercial': 'Comercial',
    'imoveis.tipo.escritorio': 'Oficina',
    'imoveis.filter.more':    'Filtros',
    'imoveis.fmodal.title':   'Filtros',
    'imoveis.fmodal.price':   'Rango de precio (US$)',
    'imoveis.fmodal.quartos': 'Dormitorios',
    'imoveis.fmodal.banheiros': 'Baños',
    'imoveis.fmodal.area':    'Superficie mínima (m²)',
    'imoveis.fmodal.estagio': 'Etapa de la obra',
    'imoveis.fmodal.comodidades': 'Comodidades',
    'imoveis.fmodal.clear':   'Limpiar todo',
    'imoveis.cta.title':      '¿No encontraste lo que buscás?',
    'imoveis.cta.subtitle':   'Las mejores oportunidades rara vez aparecen en internet. Contale a {{BROKER_FIRST_NAME}} lo que buscás.',
    'imoveis.cta.btn':        'Hablar con {{BROKER_FIRST_NAME}}',
  },
  en: {
    // navbar
    'nav.logo-span':  'Real Estate',
    'nav.imoveis':    'Properties',
    'nav.why':        'Why us',
    'nav.about':      'About',
    'nav.faq':        'FAQ',
    'nav.contact':    'Contact',
    'nav.cta':        'Talk to {{BROKER_FIRST_NAME}}',
    // hero
    'hero.label':     'Properties in {{CITY_DEFAULT_EN}} and beyond',
    'hero.title':     'Find the right property in <em>{{CITY_DEFAULT_EN}}</em> with someone who knows every neighborhood.',
    'hero.subtitle':  'Buying, selling and renting property in Paraguay with full support — from first contact to keys in hand.',
    'hero.cta1':      'Talk to {{BROKER_FIRST_NAME}}',
    'hero.cta2':      'Browse properties',
    // barra de credenciais
    'creds.exp':      '<em>{{STATS_YEARS}}+ years</em> in the real estate market',
    'creds.deals':    '<em>{{STATS_DEALS}}+</em> closed deals',
    'creds.atend':    '<em>Service</em> in Spanish and Portuguese',
    'creds.usd':      'Properties and income in <em>US dollars</em>',
    // home — destaques
    'home.imoveis.label':    'Hand-picked properties',
    'home.imoveis.title':    'Opportunities available now',
    'home.imoveis.subtitle': 'A selection of properties {{BROKER_FIRST_NAME}} personally follows in {{CITY_DEFAULT_EN}} and the region.',
    'home.imoveis.btn':      'See all properties',
    // por que
    'why.label':      'Why choose',
    'why.title':      'Why close your deal with {{BROKER_FIRST_NAME}}?',
    'why.c1.title':   'Full support',
    'why.c1.body':    'From the first visit to signing: personalized search, negotiation and paperwork with you at every step.',
    'why.c2.title':   'Safe documentation',
    'why.c2.body':    'Contract review and document checks with trusted professionals — no clauses that cost you later.',
    'why.c3.title':   'Local knowledge',
    'why.c3.body':    'Every neighborhood has its profile, its moment and its fair price. Decide with insight from someone who lives this market daily.',
    'why.c4.title':   'Direct negotiation',
    'why.c4.body':    'Direct contact with owners and developers — no middlemen inflating the deal.',
    // sobre
    'about.label':    'Who you talk to',
    'about.title':    'Meet {{BROKER_FIRST_NAME}}',
    'about.bio':      '{{BIO_EN}}',
    // depoimentos
    'depo.label':     'Happy clients',
    'depo.title':     'What clients say',
    'depo.t1':        '{{TESTIMONIAL_1_TEXT_EN}}',
    'depo.t2':        '{{TESTIMONIAL_2_TEXT_EN}}',
    'depo.t3':        '{{TESTIMONIAL_3_TEXT_EN}}',
    // FAQ
    'faq.label':      'FAQ',
    'faq.title':      'Frequently asked questions',
    'faq.q1':         'Can foreigners buy property in Paraguay?',
    'faq.a1':         'Yes. Foreigners have the same property rights as Paraguayans and can buy real estate in their own name, with a registered deed. Residency is not required to buy.',
    'faq.q2':         'Do I need to be in Paraguay to buy or rent?',
    'faq.a2':         'The process can start 100% remotely — search, photos, videos and negotiation over WhatsApp. For the deed, some notaries accept power of attorney; when needed, we organize everything so one trip is enough.',
    'faq.q3':         'What costs are there besides the property price?',
    'faq.a3':         'In general: deed and registration fees, possible transfer taxes and the real estate commission (in Paraguay, usually paid by the owner or developer). Before signing anything you get the full breakdown, no surprises.',
    'faq.q4':         'Are prices in dollars or guaraníes?',
    'faq.a4':         'The sales market works mostly in US dollars; rentals can be in dollars or guaraníes. Listings on this site show prices in US$.',
    // CTA final
    'cta.title':      "Didn't find what you're looking for?",
    'cta.subtitle':   "The best opportunities rarely show up online. Tell {{BROKER_FIRST_NAME}} what you're looking for — and get options selected for your profile.",
    'cta.btn':        'Chat on WhatsApp',
    // formulário
    'form.label':     'Get in touch',
    'form.title':     'Or send a message',
    'form.name':      'Full name',
    'form.email':     'E-mail',
    'form.whatsapp':  'WhatsApp',
    'form.interest':  'What are you looking for?',
    'form.select':    'Select...',
    'form.opt.comprar':  'I want to buy',
    'form.opt.alugar':   'I want to rent',
    'form.opt.investir': 'I want to invest',
    'form.opt.vender':   'I want to sell my property',
    'form.message':   'Message',
    'form.submit':    'Send message',
    'form.success':   'Message sent! {{BROKER_FIRST_NAME}} will get back to you soon.',
    'form.error':     'Failed to send. Try again or reach out on WhatsApp.',
    // footer
    'footer.desc':    '{{CITY_DEFAULT_EN}}, Paraguay · Buying, selling and renting property with full support.',
    'footer.links':   'Links',
    'footer.contact': 'Contact',
    'footer.rights':  'All rights reserved.',
    // imoveis.html (listagem)
    'imoveis.hero.label':     'Portfolio',
    'imoveis.hero.title':     'Find the right property in <em>{{CITY_DEFAULT_EN}} and beyond</em>',
    'imoveis.hero.subtitle':  'Apartments, houses, land and commercial properties hand-picked by {{BROKER_FIRST_NAME}} — to live or invest.',
    'imoveis.filter.all':     'All',
    'imoveis.filter.sale':    'For Sale',
    'imoveis.filter.rent':    'For Rent',
    'imoveis.filter.type':    'All types',
    'imoveis.filter.rooms':   'Bedrooms',
    'imoveis.filter.city':    'All cities',
    'imoveis.city.asuncion':  'Asunción',
    'imoveis.tipo.apartamento': 'Apartment',
    'imoveis.tipo.casa':      'House',
    'imoveis.tipo.duplex':    'Duplex',
    'imoveis.tipo.terreno':   'Land',
    'imoveis.tipo.comercial': 'Commercial',
    'imoveis.tipo.escritorio': 'Office',
    'imoveis.filter.more':    'Filters',
    'imoveis.fmodal.title':   'Filters',
    'imoveis.fmodal.price':   'Price range (US$)',
    'imoveis.fmodal.quartos': 'Bedrooms',
    'imoveis.fmodal.banheiros': 'Bathrooms',
    'imoveis.fmodal.area':    'Minimum area (m²)',
    'imoveis.fmodal.estagio': 'Construction stage',
    'imoveis.fmodal.comodidades': 'Amenities',
    'imoveis.fmodal.clear':   'Clear all',
    'imoveis.cta.title':      "Didn't find what you're looking for?",
    'imoveis.cta.subtitle':   "The best opportunities rarely show up online. Tell {{BROKER_FIRST_NAME}} what you're looking for.",
    'imoveis.cta.btn':        'Talk to {{BROKER_FIRST_NAME}}',
  },
};

let currentLang = localStorage.getItem('site-lang') || '{{DEFAULT_LANG}}';

function applyTranslations(lang) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = TRANSLATIONS[lang]?.[key];
    if (val !== undefined) el.innerHTML = val;
  });
  document.documentElement.setAttribute('lang', lang);
  document.querySelectorAll('.lang-switcher button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  localStorage.setItem('site-lang', lang);
  currentLang = lang;
}

function initLang() {
  document.querySelectorAll('.lang-switcher button').forEach(btn => {
    btn.addEventListener('click', () => applyTranslations(btn.dataset.lang));
  });
  applyTranslations(currentLang);
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initBurger();
  initAccordion();
  initLang();
});
