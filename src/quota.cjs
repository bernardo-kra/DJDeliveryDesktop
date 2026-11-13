const { ORIGIN } = require('./catalog.cjs');
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

function parseQuota(data) {
  if (!Array.isArray(data?.list)) throw new Error('O site não informou o saldo de downloads.');
  return data.list.map(section => {
    const balance = section.balance || {};
    return { id: String(section.id), name: String(section.nm || 'Seção'),
      availableBytes: numeric(balance.bytesleft),
      allowed: section.downloadable === true && balance.allow === true,
      daysLeft: numeric(balance.daysleft), hoursLeft: numeric(balance.hoursleft),
      expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(balance.dateend || '') ? balance.dateend : null };
  });
}

async function fetchQuota(fetch) {
  const response = await fetch(`${ORIGIN}/a/ms/section`, { credentials: 'include', signal: AbortSignal.timeout(20000) });
  if ([401, 403].includes(response.status) || !(response.headers.get('content-type') || '').includes('json')) {
    throw new Error('Entre na sua conta no catálogo para consultar o saldo.');
  }
  if (!response.ok) throw new Error(`Não foi possível consultar o saldo (${response.status}). Tente novamente.`);
  return { status: 'ready', sections: parseQuota(await response.json()), checkedAt: new Date().toISOString() };
}

function checkCandidateQuota(quota, candidate) {
  if (quota?.status !== 'ready') return { allowed: false, message: 'Não foi possível verificar o saldo. Atualize o saldo antes de baixar.' };
  const section = quota.sections.find(item => item.id === String(candidate.sectionId));
  if (!section) return { allowed: false, message: 'A seção desta versão não foi identificada. Busque a música novamente para verificar o limite.' };
  if (!section.allowed || (section.hoursLeft !== null && section.hoursLeft <= 0) || (section.daysLeft !== null && section.daysLeft < 0)) {
    return { allowed: false, message: `Sem acesso ativo a ${section.name}. Confira a validade do seu plano no catálogo.` };
  }
  if (section.availableBytes === null) return { allowed: false, message: `O site não informou o saldo de ${section.name}.` };
  if (section.availableBytes <= 0) return { allowed: false, message: `Saldo de ${section.name} esgotado. A fila foi interrompida.` };
  if (candidate.sizeKnown && candidate.filesize > section.availableBytes) return { allowed: false, message: `Saldo insuficiente em ${section.name} para esta versão. A fila foi interrompida.` };
  return { allowed: true, estimatedBytes: candidate.sizeKnown ? candidate.filesize : null };
}

module.exports = { parseQuota, fetchQuota, checkCandidateQuota };
