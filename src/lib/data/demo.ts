import type { AdDay, Competitor, CompetitorAd, MetaAd, MetaCampaign, Shop } from "@/lib/types";

/**
 * Données FICTIVES pour le mode démo (aucune base configurée). Elles ne reprennent aucun
 * chiffre réel : elles servent à voir l'interface avant de brancher les clés.
 */

export const demoShops: Shop[] = [
  {
    id: "demo-a",
    slug: "boutique-a",
    name: "Boutique A",
    market: "IT",
    metaAdAccountId: null,
    thresholds: { be: 1.8, targetLow: 2.5, target: 2.85, loss20: 1.33, jump: 4, atcTarget: 11, aov: 55 },
    pnl: null,
  },
  {
    id: "demo-b",
    slug: "boutique-b",
    name: "Boutique B",
    market: "IT",
    metaAdAccountId: null,
    thresholds: { be: 1.6, targetLow: 2.1, target: 2.35, loss20: 1.25, jump: 3.2, atcTarget: 12, aov: 60 },
    pnl: null,
  },
];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function days(seed: number, dailySpend: number, roas: number, today: Date, from = 13): AdDay[] {
  const r = rng(seed);
  const out: AdDay[] = [];
  for (let i = from; i >= 1; i--) {
    const date = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const spend = Math.max(0, dailySpend * (0.6 + r() * 0.8));
    const clicks = Math.round(spend / (0.7 + r() * 0.9));
    const value = spend * roas * (0.4 + r() * 1.2);
    const purchases = Math.round(value / 55);
    out.push({
      date,
      spend: Math.round(spend * 100) / 100,
      impressions: Math.round(spend * 35),
      linkClicks: clicks,
      addToCart: Math.round(clicks * (0.08 + r() * 0.1)),
      checkouts: Math.round(purchases * 1.6),
      purchases,
      value: purchases * 55,
    });
  }
  return out;
}

const NAMES = [
  ["V01 · témoignage cuisine", 1.95, 26],
  ["V02 · hook « 3 secondes »", 3.4, 7],
  ["V03 · avant / après", 1.2, 9],
  ["S01 · statique offre 1+1", 2.6, 6],
  ["V04 · réponse commentaire", 0.6, 8],
  ["S02 · infographie", 0, 0.4],
  ["V05 · UGC salle de bain", 2.1, 5],
] as const;

export function demoMeta(shop: Shop, today: Date): { campaigns: MetaCampaign[]; ads: MetaAd[] } {
  const seed = shop.slug === "boutique-a" ? 7 : 19;
  const ads: MetaAd[] = NAMES.map(([name, roas, spend], i) => {
    const created = new Date(today.getTime() - (i === 6 ? 1 : 12 + i) * 86_400_000).toISOString();
    const d = days(seed + i, spend, roas, today, i === 6 ? 1 : 20);
    return {
      id: `${shop.slug}-ad-${i + 1}`,
      name,
      status: "ACTIVE",
      createdTime: created,
      campaignId: `${shop.slug}-c1`,
      campaignName: `T1 · ${shop.name} · CBO`,
      adsetId: `${shop.slug}-as1`,
      adsetName: "ADSET 1 · broad",
      creative: { id: null, thumbnailUrl: null, imageUrl: null, videoId: null, body: null, title: null },
      days: d,
      lifetimeSpend: d.reduce((a, x) => a + x.spend, 0) * 1.4,
    };
  });
  const lifetimeSpend = ads.reduce((a, x) => a + x.lifetimeSpend, 0);
  const lifetimeValue = ads.reduce((a, x) => a + x.days.reduce((b, y) => b + y.value, 0), 0) * 1.3;
  return {
    campaigns: [
      {
        id: `${shop.slug}-c1`,
        name: `T1 · ${shop.name} · CBO`,
        status: "ACTIVE",
        dailyBudget: 100,
        createdTime: new Date(today.getTime() - 30 * 86_400_000).toISOString(),
        lifetimeSpend,
        lifetimeValue,
        lifetimeAddToCart: 140,
        lifetimeLinkClicks: 1300,
        lifetimePurchases: Math.round(lifetimeValue / 55),
        firstDeliveryDate: new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10),
      },
    ],
    ads,
  };
}

export function demoCompetitors(shop: Shop): Competitor[] {
  return [
    { id: `${shop.slug}-k1`, shopId: shop.id, name: "Concurrent 1", brandtrackerId: "demo", active: true },
    { id: `${shop.slug}-k2`, shopId: shop.id, name: "Concurrent 2", brandtrackerId: "demo", active: true },
  ];
}

const BODIES = [
  "Tes baskets comme neuves en machine, sans frotter. Glisse-les dans le sac, cycle délicat.",
  "J'ai arrêté de racheter des baskets tous les 3 mois. Voici pourquoi.",
  "Infirmière, je lave mes chaussures tous les soirs : ce sac a tout changé.",
  "Promo : 1 acheté = 1 offert, livraison gratuite.",
  "Comparatif : brosse vs sac de lavage, le résultat en 30 secondes.",
  "Ne mets JAMAIS tes baskets en machine sans ça.",
];

export function demoCompetitorAds(competitor: Competitor, today: Date): CompetitorAd[] {
  const offset = competitor.id.endsWith("k2") ? 3 : 0;
  const r = rng(competitor.id.length * 31 + offset * 7);
  return BODIES.slice(offset).concat(BODIES.slice(0, offset)).slice(0, 4).map((body, i) => {
    const days = Math.round(3 + r() * 40);
    const active = i !== 4;
    const reach = Math.round(5_000 + r() * 400_000);
    return {
      id: `${competitor.id}-ad-${i}`,
      competitorId: competitor.id,
      status: active ? "active" : "inactive",
      previousStatus: active ? "active" : "active",
      firstSeenAt: new Date(today.getTime() - days * 86_400_000).toISOString(),
      lastSeenAt: new Date(today.getTime() - (active ? 0 : 2) * 86_400_000).toISOString(),
      daysRunning: days,
      mediaType: i % 2 ? "image" : "video",
      mediaUrl: null,
      thumbnailUrl: null,
      body,
      transcript: i % 2 ? null : body,
      landingUrl: null,
      cta: "SHOP_NOW",
      reach,
      reachDelta7d: Math.round(reach * (r() * 0.6)),
      estimatedSpend: Math.round(reach / 110),
      currentRank: Math.round(1 + r() * 40),
      previousRank: Math.round(10 + r() * 60),
      rankDelta: Math.round(-10 + r() * 50),
    };
  });
}
