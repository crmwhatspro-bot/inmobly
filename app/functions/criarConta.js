/* ══════════════════════════════════════════════════════
   criarConta — signup self-service: cria brokers/{slug} e seta o
   custom claim tenantId no usuário autenticado.
   ------------------------------------------------------
   onCall (não onRequest) porque agora é tudo o mesmo projeto — o SDK
   do cliente já manda o auth context automaticamente, sem precisar
   do idToken manual que criarCheckoutSession precisava no modelo
   antigo (cross-project).

   Trial: 14 dias, sem cartão, 6 imóveis (ver docs/REGRAS-DE-NEGOCIO.md).

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, auth } = require('./admin');
const RESERVADOS = require('./reservados');

// Espelhado em public/js/tenant.js#TRIAL_DIAS, que usa o número só pra
// exibir o contador (teto e dias já corridos) — mudar aqui sem mudar lá
// faz o painel mostrar um prazo que não é o gravado no doc.
const TRIAL_DIAS = 14;
const TRIAL_LIMITE_IMOVEIS = 6;
const SLUG_REGEX = /^[a-z0-9-]{3,40}$/;

// Mesmo formato que functions/analytics.js grava em analytics_visits —
// se não bater, não vai casar com visita nenhuma, então grava null em
// vez de sujar o doc com um valor inútil.
const VISITOR_ID_REGEX = /^[a-z0-9]{8,40}$/;

/**
 * Normaliza o que o client mandou em `atribuicao` (ver
 * public/js/atribuicao.js). Vem da URL, ou seja, de qualquer um que
 * saiba editar um query param — daí o corte de tamanho e o regex.
 * Isso aqui é métrica de aquisição, não permissão: no pior caso um
 * signup fica atribuído ao canal errado, nada além disso.
 */
function normalizarAtribuicao(bruta) {
  const a = bruta && typeof bruta === 'object' ? bruta : {};
  const texto = (v) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, 120) : null;
  };
  const id = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    return VISITOR_ID_REGEX.test(s) ? s : null;
  };
  return {
    acquisitionVisitorId: id(a.vid),
    acquisitionSessionId: id(a.sid),
    // Espelhado aqui, e não só em analytics_visits, pra o painel
    // conseguir quebrar contas por canal sem ter que fazer o join com
    // a visita toda vez (e sem depender da visita ainda existir se um
    // dia a collection ganhar expiração por TTL).
    acquisitionUtmSource:   texto(a.utmSource),
    acquisitionUtmMedium:   texto(a.utmMedium),
    acquisitionUtmCampaign: texto(a.utmCampaign),
  };
}

exports.criarConta = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'É preciso estar logado.');
    }
    const { uid, token } = request.auth;
    const email = token.email;

    const nome = String(request.data?.nome || '').trim();
    const slug = String(request.data?.slug || '').trim().toLowerCase();
    const refSlug = String(request.data?.ref || '').trim().toLowerCase();

    if (!nome) throw new HttpsError('invalid-argument', 'Nome é obrigatório.');
    if (!SLUG_REGEX.test(slug)) {
      throw new HttpsError('invalid-argument', 'Endereço inválido — só letras minúsculas, números e hífen, 3 a 40 caracteres.');
    }
    // Esses slugs colidem com subdomínios de infraestrutura de
    // *.sitemob.app (ver functions/servirSite.js) — sem esse bloqueio,
    // um corretor poderia cadastrar "painel" ou "tenants" e ficar
    // inacessível pra sempre (o hostname nunca chega a resolver como
    // tenant dele).
    if (RESERVADOS.has(slug)) {
      throw new HttpsError('invalid-argument', 'Esse endereço é reservado — escolha outro.');
    }

    // Idempotência por uid: a criação do doc e o custom claim não são
    // atômicos entre si (dois awaits separados — se a function cair,
    // crashar ou o claim falhar entre um e outro, o doc fica órfão sem
    // claim). Se esse uid já tem um broker — de uma tentativa anterior
    // que ficou pela metade, ou de um retry do cliente — não tenta
    // criar de novo (bateria em "already-exists" pro slug que já é
    // dele mesmo e travaria o usuário pra sempre). Só garante que o
    // claim aponta pro slug certo e devolve.
    const existente = await db.collection('brokers')
      .where('ownerUid', '==', uid)
      .limit(1)
      .get();

    if (!existente.empty) {
      const slugExistente = existente.docs[0].id;
      try {
        await auth.setCustomUserClaims(uid, { tenantId: slugExistente });
      } catch (err) {
        console.error(`[criarConta] retry: falha ao re-setar custom claim (slug="${slugExistente}", uid="${uid}"):`, err);
        throw new HttpsError('internal', 'Conta já existe, mas houve um erro ao vincular seu acesso. Tente entrar de novo.');
      }
      return { tenantId: slugExistente };
    }

    // Indique e ganhe: "ref" vem de um link compartilhado por outro
    // corretor (ver docs/REGRAS-DE-NEGOCIO.md) — nunca bloqueia o
    // cadastro se for inválido/inexistente/auto-indicação, só ignora
    // silenciosamente (o link pode estar velho, digitado errado, ou
    // ser o próprio slug de quem tá se cadastrando). A recompensa em
    // si só é decidida depois, quando (e se) esse broker virar pagante
    // — ver webhook.js.
    let referredBy = null;
    if (refSlug && SLUG_REGEX.test(refSlug) && refSlug !== slug) {
      const refSnap = await db.doc('brokers/' + refSlug).get();
      if (refSnap.exists) referredBy = refSlug;
    }

    // De onde veio esse cadastro (?vid= carimbado nos CTAs da landing,
    // ver public/js/atribuicao.js). Só métrica de topo de funil — nunca
    // bloqueia nem altera nada do cadastro se vier vazio ou torto.
    const atribuicao = normalizarAtribuicao(request.data?.atribuicao);

    const ref = db.doc('brokers/' + slug);

    // Transação: evita dois signups simultâneos pegarem o mesmo slug.
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          throw new HttpsError('already-exists', 'Esse endereço já está em uso.');
        }

        const agora = new Date();
        const trialEndsAt = new Date(agora.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000);

        tx.set(ref, {
          name: nome,
          email,
          ownerUid: uid,
          plan: 'trial',
          status: 'trialing',
          trialEndsAt,
          imoveisLimit: TRIAL_LIMITE_IMOVEIS,
          domainIncluded: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          usage: { imoveisCount: 0, imoveisUpdatedAt: agora },
          customDomainStatus: 'none',
          onboardingCompleted: false,
          referredBy,
          referralRewarded: false,
          referral: { codes: [], convertidas: 0 },
          ...atribuicao,
          createdAt: agora,
          updatedAt: agora,
        });
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err; // already-exists etc. — repassa como está
      console.error(`[criarConta] falha na transação do Firestore (slug="${slug}", uid="${uid}"):`, err);
      throw new HttpsError('internal', 'Não foi possível gravar a conta. Tente de novo em instantes.');
    }

    // Custom claim — é o que as firestore.rules (isTenantAdmin) e o
    // resto do app usam pra saber a qual tenant esse usuário pertence.
    // Só entra no ID token depois de um refresh forçado no cliente.
    try {
      await auth.setCustomUserClaims(uid, { tenantId: slug });
    } catch (err) {
      console.error(`[criarConta] falha ao setar custom claim (slug="${slug}", uid="${uid}"):`, err);
      // Desfaz o doc pra não deixar o slug preso a uma conta quebrada —
      // sem isso, um retry bateria em "already-exists" pro próprio slug
      // órfão e o usuário ficaria travado (o check de ownerUid acima
      // cobre esse caso, mas o rollback encurta a janela de órfão pro
      // caminho mais comum: falha imediata do setCustomUserClaims).
      await ref.delete().catch((delErr) => {
        console.error(`[criarConta] falha ao desfazer o doc órfão (slug="${slug}"):`, delErr);
      });
      throw new HttpsError('internal', 'Não foi possível vincular seu acesso. Tente de novo.');
    }

    return { tenantId: slug };
  }
);
