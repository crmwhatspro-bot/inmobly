/* ══════════════════════════════════════════════════════
   PAIm Control Plane — sync de plano pro Firestore de cada broker
   ------------------------------------------------------
   Gatilho: qualquer escrita em brokers/{slug} no projeto central
   (paim-control). Se plano/status/limite/domínio mudou, busca a
   service account daquele broker no Secret Manager e escreve
   config/plan no Firestore do projeto DAQUELE broker — é essa
   leitura local que o admin.js e as firestore.rules de cada
   broker usam pra saber o limite atual, sem chamada entre
   projetos em tempo real.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL — projeto paim-control e os
   secrets por broker ainda não existem. Revisar antes do primeiro
   deploy.

   Setup necessário por broker (uma vez, no onboarding):
     1. Gerar uma service account key no projeto Firebase do broker
        (Configurações do projeto → Contas de serviço → Gerar nova
        chave privada) com permissão de escrita no Firestore.
     2. Cadastrar como secret no projeto central:
          gcloud secrets create broker-sa-<slug> \
            --data-file=<caminho-da-key.json> \
            --project=paim-control
     3. Dar ao runtime da function permissão de leitura do secret:
          gcloud secrets add-iam-policy-binding broker-sa-<slug> \
            --member="serviceAccount:<function-runtime-sa>" \
            --role="roles/secretmanager.secretAccessor" \
            --project=paim-control
   ══════════════════════════════════════════════════════ */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp: initAdmin, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

initAdmin(); // app default — projeto central (paim-control)

const secretClient = new SecretManagerServiceClient();

// Só esses campos disparam o sync — mudanças em `usage` (que o próprio
// broker escreve) não devem re-sincronizar nada de volta.
const CAMPOS_SINCRONIZADOS = ['plan', 'status', 'trialEndsAt', 'imoveisLimit', 'domainIncluded'];

function mudou(antes, depois) {
  if (!antes) return true; // doc novo, primeiro sync
  return CAMPOS_SINCRONIZADOS.some(
    campo => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo])
  );
}

async function buscarServiceAccount(slug) {
  const nome = `projects/paim-control/secrets/broker-sa-${slug}/versions/latest`;
  const [versao] = await secretClient.accessSecretVersion({ name: nome });
  return JSON.parse(versao.payload.data.toString('utf8'));
}

exports.syncPlanoParaBroker = onDocumentWritten(
  { document: 'brokers/{slug}', region: 'southamerica-east1' },
  async (event) => {
    const slug   = event.params.slug;
    const antes  = event.data?.before?.exists ? event.data.before.data() : null;
    const depois = event.data?.after?.exists  ? event.data.after.data()  : null;

    if (!depois) return; // doc do broker apagado — nada a sincronizar
    if (!mudou(antes, depois)) return;

    let credencial;
    try {
      credencial = await buscarServiceAccount(slug);
    } catch (err) {
      console.error(`[syncPlano] sem service account cadastrada pra "${slug}" — pulei o sync:`, err.message);
      return;
    }

    const nomeApp = 'broker-' + slug;
    const appBroker = getApps().find(a => a.name === nomeApp)
      || initAdmin({ credential: cert(credencial) }, nomeApp);

    const dbBroker = getFirestore(appBroker);
    await dbBroker.doc('config/plan').set({
      plan:           depois.plan          ?? null,
      status:         depois.status        ?? null,
      trialEndsAt:    depois.trialEndsAt   ?? null,
      imoveisLimit:   depois.imoveisLimit  ?? null,
      domainIncluded: !!depois.domainIncluded,
      syncedAt:       new Date(),
    }, { merge: true });

    console.log(`[syncPlano] "${slug}" sincronizado: plan=${depois.plan} status=${depois.status}`);
  }
);
