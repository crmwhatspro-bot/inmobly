/* ══════════════════════════════════════════════════════
   publicarSite — marca published:true em brokers/{tenantId}.

   Antes disso fazia um deploy inteiro por tenant (criar Hosting site,
   subir cada arquivo do bundle) porque cada corretor tinha seu próprio
   site físico no Hosting — daí o teto de sites por projeto (ver
   README, "Limite de sites por projeto"). Agora quem serve o catálogo
   é a servirSite.js, uma function só pra todo mundo, que já lê
   site-assets/ e o Firestore em tempo real a cada requisição — não tem
   mais "arquivo publicado" pra copiar, então não tem mais nada pra
   fazer aqui além de virar a chave. O botão "Atualizar" em Meu Site
   (que existia pra reenviar o bundle mais recente) virou sem efeito —
   qualquer mudança já aparece na próxima requisição, sem precisar de
   republish.
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./admin');

exports.publicarSite = onCall(
  { region: 'southamerica-east1', memory: '128MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
    const tenantId = request.auth.token.tenantId;
    if (!tenantId) throw new HttpsError('failed-precondition', 'Conta sem tenant.');

    const snap = await db.doc('brokers/' + tenantId).get();
    const broker = snap.exists ? snap.data() : null;
    if (!broker?.whatsapp) {
      throw new HttpsError('failed-precondition', 'Configure seu WhatsApp antes de publicar.');
    }

    await db.doc('brokers/' + tenantId).update({ published: true, updatedAt: new Date() });

    return { url: `https://${tenantId}.sitemob.app` };
  }
);
