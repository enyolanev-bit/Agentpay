// Livrable d'un agent provider. Canné mais crédible : c'est le PAIEMENT qui est le sujet
// de la démo, pas l'intelligence du provider. Indexe par handle.

const DELIVERABLES = {
  '@data-provider': () => ({
    label: 'Donnees enrichies',
    rows: [
      { email: 'ops@example.com', company: 'Example Manufacturing', score: 0.92, segment: 'enterprise' },
      { email: 'admin@example.org', company: 'Example Fitness', score: 0.74, segment: 'smb' },
      { email: 'desk@example.net', company: 'Example Clinic', score: 0.88, segment: 'healthcare' },
    ],
    note: '3 lignes enrichies (societe, score, segment).',
  }),
  '@kyc-checker': () => ({
    label: 'Vérification KYC',
    rows: [
      { entity: 'Example Manufacturing', status: 'clear', risk: 'low', evidence: 'Registry active, ownership data consistent' },
      { entity: 'Example Fitness', status: 'review', risk: 'medium', evidence: 'Recent address change, supporting document suggested' },
      { entity: 'Example Clinic', status: 'clear', risk: 'low', evidence: 'Healthcare organization verified' },
    ],
    note: 'Synthese KYC avec statut, niveau de risque et preuve exploitable.',
  }),
  '@geocoder': () => ({
    label: 'Adresses géocodées',
    rows: [
      { address: '12 Example Street, Example City', lat: 45.7641, lng: 4.8357, confidence: 0.91 },
      { address: '8 Sample Avenue, Demo Town', lat: 50.6292, lng: 3.0573, confidence: 0.88 },
      { address: '3 Placeholder Boulevard, Testville', lat: 47.2184, lng: -1.5536, confidence: 0.86 },
    ],
    note: 'Coordonnees GPS normalisees avec score de confiance par adresse.',
  }),
};

// getDeliverable(handle, taskText) -> objet livrable, ou un livrable generique si handle inconnu.
export function getDeliverable(handle, taskText = '') {
  const make = DELIVERABLES[handle];
  if (make) return make();
  return {
    label: 'Resultat du service',
    rows: [],
    note: `Service rendu par ${handle} pour: ${taskText || 'tache'}.`,
  };
}
