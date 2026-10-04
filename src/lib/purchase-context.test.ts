// Run with: bun test src/lib/purchase-context.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyPurchaseContext, costPerWear, priceContext, sameModelOwned, shadeDifference } from "./purchase-context";
import type { WardrobeItem } from "./aura-types";

const item = (o: Partial<WardrobeItem> & Record<string, unknown>) => ({ id: Math.random().toString(), category: "Bottoms", colors: [], ...o }) as unknown as WardrobeItem;

const wardrobe = [
  item({ brand: "VICTORIA BECKHAM", model: "Alina", subcategory: "Jeans", colors: ["Denim Wash", "Sky Blue"], price: 450, currency: "EUR" }),
  item({ brand: "VICTORIA BECKHAM", model: "Alina", subcategory: "Trousers", colors: ["Pure White"], price: 450, currency: "EUR" }),
  item({ brand: "Motivi", subcategory: "Jeans", colors: ["Denim Wash"], price: 99, currency: "EUR" }),
  item({ brand: "Zara", subcategory: "Jeans", colors: ["Denim Wash"], price: 39.95, currency: "EUR" }),
  item({ brand: "Levi's", subcategory: "Jeans", colors: ["Denim Wash"], price: 110, currency: "EUR" }),
];

test("reported case: Alina jeans — two Alina already owned", () => {
  const same = sameModelOwned({ brand: "Victoria Beckham", title: "Alina Stretch Jean In Worn Blue Wash", category: "Bottoms" }, wardrobe);
  assert.equal(same.length, 2);
  assert.equal(sameModelOwned({ brand: "Victoria Beckham", title: "Pleated Trouser", category: "Bottoms" }, wardrobe).length, 0);
});

test("price against what the person pays for the same type", () => {
  const jeans = (price: number) => item({ subcategory: "Jeans", price, currency: "EUR" });
  const cheapTrousers = Array.from({ length: 30 }, () => item({ subcategory: "Trousers", price: 40, currency: "EUR" }));
  // reported case: jeans usually ~170 €, several at 400–620 € → 400 € is the top of her range, not "more than usual"
  const w2 = [...cheapTrousers, ...[60, 90, 120, 150, 170, 175, 200, 380, 400, 450, 620].map(jeans)];
  const p = priceContext({ price: "400", currency: "EUR", category: "Bottoms", subcategory: "Jeans" }, w2)!;
  assert.equal(p.tier, "upper_range");
  assert.equal(p.usualEur, 175);
  // someone who never paid more than ~110 € for jeans: 455 € is beyond their habits
  const p2 = priceContext({ price: "390", currency: "GBP", category: "Bottoms", subcategory: "Jeans" }, [40, 60, 80, 99, 110].map(jeans))!;
  assert.ok(p2);
  assert.equal(p2.tier, "above_usual");
  // same model already bought at 450 €: never "beyond their habits"
  const alina = [item({ brand: "VICTORIA BECKHAM", model: "Alina", subcategory: "Jeans", price: 450, currency: "EUR" })];
  assert.equal(priceContext({ price: "500", currency: "EUR", category: "Bottoms", subcategory: "Jeans" }, [40, 60, 80, 99, 110].map(jeans), alina)!.tier, "upper_range");
});

test("a cashmere sweater is compared with cashmere sweaters, never with t-shirts", () => {
  const tees = Array.from({ length: 10 }, () => item({ category: "Tops", subcategory: "T-Shirt", price: 20, currency: "EUR", material: ["Cotton"] }));
  const sweaters = [
    ...[40, 50, 60].map((price) => item({ category: "Tops", subcategory: "Sweater", price, currency: "EUR", material: ["Wool"] })),
    ...[280, 320, 350].map((price) => item({ category: "Tops", subcategory: "Sweater", price, currency: "EUR", material: ["Cashmere"] })),
  ];
  const p = priceContext({ price: "330", currency: "EUR", category: "Tops", subcategory: "Sweater", material: "Cashmere" }, [...tees, ...sweaters])!;
  assert.equal(p.usualEur, 320);
  assert.equal(p.tier, "usual");
  // not enough pieces of the same type: no judgement instead of comparing with the whole category
  assert.equal(priceContext({ price: "330", currency: "EUR", category: "Tops", subcategory: "Cardigan" }, [...tees, ...sweaters]), null);
});

test("same model + expensive for this person → maybe, never an upgrade", () => {
  const p = priceContext({ price: "390", currency: "GBP", category: "Bottoms", subcategory: "Jeans" }, wardrobe);
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 2, price: p, wardrobeGap: false }).verdict, "maybe");
  assert.equal(applyPurchaseContext({ verdict: "skip", confidence: "high" }, { sameModelCount: 2, price: p, wardrobeGap: false }).verdict, "skip");
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 0, price: p, wardrobeGap: false }).verdict, "buy");
});

test("shade: a navy wash is darker than a sky-blue one", () => {
  assert.equal(shadeDifference(["Navy"], ["Sky Blue"]), "darker");
  assert.equal(shadeDifference(["Sky Blue"], ["Navy"]), "lighter");
  assert.equal(shadeDifference(["Denim Wash"], ["Denim Wash"]), null);
});

test("far beyond the person's range with a similar pair owned → skip (unless iconic or a gap)", () => {
  const price = { priceEur: 1100, usualEur: 175, topEur: 358, basedOn: 24, tier: "above_usual" as const, sameModelPaidEur: null };
  assert.equal(applyPurchaseContext({ verdict: "maybe", confidence: "medium" }, { sameModelCount: 0, price, wardrobeGap: false, similarOwned: true }).verdict, "skip");
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 0, price, wardrobeGap: false, similarOwned: true, iconic: true }).verdict, "buy");
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 0, price, wardrobeGap: true, similarOwned: false }).verdict, "buy");
});


test("cost per wear: an all-season denim is far more usable than an evening gown or a summer crystal sandal", () => {
  const price = (eur: number) => ({ priceEur: eur, usualEur: eur, topEur: eur, basedOn: 5, tier: "usual" as const, sameModelPaidEur: null });
  const jeans = costPerWear({ category: "Bottoms", subcategory: "Jeans", seasons: ["All Seasons"], dayEvening: "both", formality: 2, fashion: { timeless: true, onTrend: false, versatility: "high" } }, [], price(400))!;
  assert.equal(jeans.basis, "estimate");
  assert.ok(jeans.wearsPerYear >= 35, String(jeans.wearsPerYear));
  assert.deepEqual(jeans.reasons, ["allSeasons", "dayAndEvening", "timeless", "versatile"]);
  const gown = costPerWear({ category: "Dresses", subcategory: "Evening Dress", seasons: ["All Seasons"], dayEvening: "evening", formality: 5 }, [], price(300))!;
  assert.ok(gown.wearsPerYear <= 4, String(gown.wearsPerYear)); // a handful of black-tie events a year
  const shoes = Array.from({ length: 20 }, () => item({ category: "Shoes", subcategory: "Pumps", season: "All Seasons" }));
  const heels = costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "evening", formality: 4, details: ["embellished"] }, shoes, price(900))!;
  // Summer nights out (~a quarter of ~130 evenings), shared with pumps that are also worn by day and
  // in other seasons: several times a summer, not once a year. Crystals are not a minus at night.
  assert.ok(heels.wearsPerYear >= 5 && heels.wearsPerYear <= 15, String(heels.wearsPerYear));
  assert.ok(heels.reasons.includes("oneSeason") && heels.reasons.includes("eveningOnly") && !heels.reasons.includes("statement"));
  const summerEvening = Array.from({ length: 8 }, () => item({ category: "Shoes", subcategory: "Sandals", season: "Summer", day_evening: "evening" }));
  const crowded = costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "evening", formality: 4, details: ["embellished"] }, [...shoes, ...summerEvening], price(900))!;
  assert.ok(crowded.wearsPerYear >= 2 && crowded.wearsPerYear < heels.wearsPerYear, String(crowded.wearsPerYear)); // more evening sandals to choose from
  const sneakers = costPerWear({ category: "Shoes", subcategory: "Sneakers", seasons: ["All Seasons"], dayEvening: "day", formality: 1 }, [], price(500))!;
  assert.ok(sneakers.wearsPerYear > heels.wearsPerYear * 10);
});

test("cost per wear: many similar pieces in rotation share the wears", () => {
  const price = { priceEur: 1100, usualEur: 175, topEur: 358, basedOn: 24, tier: "above_usual" as const, sameModelPaidEur: null };
  const owned = Array.from({ length: 24 }, () => item({ subcategory: "Jeans", created_at: new Date().toISOString() }));
  const c = costPerWear({ category: "Bottoms", subcategory: "Jeans", seasons: ["All Seasons"], dayEvening: "both" }, owned, price)!;
  assert.equal(c.rotatingWith, 24);
  assert.ok(c.reasons.includes("rotation"));
  assert.ok(c.wearsPerYear < 20, String(c.wearsPerYear));
});

test("cost per wear moves from the estimate towards the person's own wear rate as history grows", () => {
  const price = { priceEur: 400, usualEur: 175, topEur: 358, basedOn: 6, tier: "upper_range" as const, sameModelPaidEur: null };
  const now = new Date("2027-04-01T00:00:00Z");
  const owned = (monthsAgo: number, worn: number) => Array.from({ length: 6 }, () => item({
    subcategory: "Jeans", worn_count: worn, created_at: new Date(now.getTime() - monthsAgo * 30.4 * 86400000).toISOString(),
  }));
  const profile = { category: "Bottoms", subcategory: "Jeans", seasons: ["All Seasons"], dayEvening: "both" };
  const fresh = costPerWear(profile, owned(0, 0), price, now)!;           // just added: pure estimate
  assert.equal(fresh.basis, "estimate");
  const half = costPerWear(profile, owned(3, 2), price, now)!;            // 1.5 piece-years: half weight
  assert.ok(half.reasons.includes("yourHistory"));
  assert.ok(half.wearsPerYear < fresh.wearsPerYear);
  const full = costPerWear(profile, owned(12, 5), price, now)!;           // 6 piece-years: own rate (5/yr)
  assert.equal(full.basis, "history");
  assert.equal(full.wearsPerYear, 5);
});

test("cost per wear: history counts from when pieces entered the app, scaled by how often wears are logged", () => {
  const price = { priceEur: 1100, usualEur: 175, topEur: 358, basedOn: 24, tier: "above_usual" as const, sameModelPaidEur: null };
  const now = new Date("2026-10-04T00:00:00Z");
  // reported case: 24 jeans bought years ago but added ~6 weeks ago, 17 logged wears, wears logged on about half the days
  const owned = Array.from({ length: 24 }, (_, i) => item({
    subcategory: "Jeans", worn_count: i < 17 ? 1 : 0, purchase_date: "2020-01-01", created_at: "2026-08-20T00:00:00Z",
  }));
  const profile = { category: "Bottoms", subcategory: "Jeans", seasons: ["All Seasons"], dayEvening: "both" };
  const c = costPerWear(profile, owned, price, now, 0.47)!;
  assert.notEqual(c.basis, "history");          // six weeks is not a history yet
  assert.ok(c.wearsPerYear >= 8, String(c.wearsPerYear)); // never "once a year" for jeans
  assert.ok(c.reasons.includes("yourHistory"));
});


test("cost per wear: a day bag rotates with all the day bags, an evening bag with the clutches", () => {
  const price = { priceEur: 2500, usualEur: 1500, topEur: 3000, basedOn: 20, tier: "upper_range" as const, sameModelPaidEur: null };
  const bag = (subcategory: string | null, occasion: string, extra: Record<string, unknown> = {}) =>
    item({ category: "Bags", subcategory, occasion, ...extra });
  const owned = [
    ...Array.from({ length: 8 }, () => bag("Top Handle Bag", "Everyday, Work")),
    ...Array.from({ length: 6 }, () => bag("Shoulder Bag", "Everyday, Weekend")),
    bag("Crossbody", "Everyday, Travel"), bag("Tote", "Work, Travel"), bag(null, "Everyday, Evening"),
    bag("Top Handle Bag", "Evening"),
    ...Array.from({ length: 4 }, () => bag("Clutch", "Evening, Formal")),
  ];
  const day = costPerWear({ category: "Bags", subcategory: "Top Handle Bag", seasons: ["All Seasons"], dayEvening: "day" }, owned, price)!;
  assert.equal(day.rotatingWith, 17);           // every day bag, whatever its shape — not only the 8 top-handles
  const clutch = costPerWear({ category: "Bags", subcategory: "Clutch", seasons: ["All Seasons"], dayEvening: "evening" }, owned, price)!;
  assert.equal(clutch.rotatingWith, 6);         // the clutches, the evening-only bag and the day-and-evening one
  // Evening bags: ~130 evenings out a year (2–3 a week), shared with the 6 evening bags owned.
  assert.ok(clutch.wearsPerYear >= 15 && clutch.wearsPerYear <= 25, String(clutch.wearsPerYear));
  const onlyClutch = costPerWear({ category: "Bags", subcategory: "Clutch", seasons: ["All Seasons"], dayEvening: "evening" }, owned.slice(0, 17), price)!;
  assert.ok(onlyClutch.wearsPerYear > clutch.wearsPerYear * 3, `${onlyClutch.wearsPerYear} vs ${clutch.wearsPerYear}`); // first evening bag: most nights out
  // A day bag is carried most days in rotation: with 17 day bags still well above a few times a year.
  assert.ok(day.wearsPerYear >= 12, String(day.wearsPerYear));
});

test("cost per wear: pieces rotate with the same outfit role, time of day and seasons", () => {
  const price = { priceEur: 1500, usualEur: 900, topEur: 2000, basedOn: 10, tier: "upper_range" as const, sameModelPaidEur: null };
  const shoe = (subcategory: string, season: string, day_evening = "both") => item({ category: "Shoes", subcategory, season, day_evening });
  const shoes = [
    ...Array.from({ length: 6 }, () => shoe("Sandals", "Summer")),
    ...Array.from({ length: 5 }, () => shoe("Ankle Boots", "Autumn, Winter")),
    ...Array.from({ length: 4 }, () => shoe("Sneakers", "All Seasons", "day")),
    ...Array.from({ length: 3 }, () => shoe("Pumps", "All Seasons", "evening")),
  ];
  // A winter boot competes with boots and all-season day shoes, never with summer sandals.
  const boot = costPerWear({ category: "Shoes", subcategory: "Knee Boots", seasons: ["Autumn", "Winter"], dayEvening: "day" }, shoes, price)!;
  assert.equal(boot.rotatingWith, 9);
  // A pump rotates with every shoe of any shape it could replace (not only pumps).
  const pump = costPerWear({ category: "Shoes", subcategory: "Pumps", seasons: ["All Seasons"], dayEvening: "evening" }, shoes, price)!;
  assert.equal(pump.rotatingWith, 14);

  // Coats: few to rotate → worn much more than a top among many.
  const coat = (n: number) => Array.from({ length: n }, () => item({ category: "Outerwear", subcategory: "Coat", season: "Autumn, Winter" }));
  const profile = { category: "Outerwear", subcategory: "Coat", seasons: ["Autumn", "Winter"], dayEvening: "both" };
  const fewCoats = costPerWear(profile, [...coat(2), item({ category: "Outerwear", subcategory: "Blazer", season: "All Seasons" })], price)!;
  const manyCoats = costPerWear(profile, coat(15), price)!;
  assert.equal(fewCoats.rotatingWith, 2);       // coats with coats, not with blazers
  assert.ok(fewCoats.wearsPerYear > manyCoats.wearsPerYear * 1.5, `${fewCoats.wearsPerYear} vs ${manyCoats.wearsPerYear}`);

  // A sweater rotates with sweaters — not with cardigans or t-shirts.
  const tops = [
    ...Array.from({ length: 4 }, () => item({ category: "Tops", subcategory: "Sweater", season: "Autumn, Winter" })),
    ...Array.from({ length: 3 }, () => item({ category: "Tops", subcategory: "Cardigan", season: "All Seasons" })),
    ...Array.from({ length: 10 }, () => item({ category: "Tops", subcategory: "T-Shirt", season: "All Seasons" })),
  ];
  const sweater = costPerWear({ category: "Tops", subcategory: "Sweater", seasons: ["Autumn", "Winter"] }, tops, price)!;
  assert.equal(sweater.rotatingWith, 4);
});

test("cost per wear: every kind of piece is estimated from how often its role is needed", () => {
  const price = { priceEur: 300, usualEur: 200, topEur: 400, basedOn: 10, tier: "upper_range" as const, sameModelPaidEur: null };
  const many = (n: number, o: Record<string, unknown>) => Array.from({ length: n }, () => item(o));
  // Underwear: a bra is worn almost every day, shared with the bras owned.
  const bra = costPerWear({ category: "Underwear", subcategory: "Bra", seasons: ["All Seasons"] }, many(15, { category: "Underwear", subcategory: "Bra", season: "All Seasons" }), price)!;
  assert.equal(bra.rotatingWith, 15);
  assert.ok(bra.wearsPerYear >= 15, String(bra.wearsPerYear));
  // A winter coat among 3 coats: worn on most cold days.
  const coat = costPerWear({ category: "Outerwear", subcategory: "Coat", seasons: ["Autumn", "Winter"] }, many(3, { category: "Outerwear", subcategory: "Coat", season: "Autumn, Winter" }), price)!;
  assert.ok(coat.wearsPerYear >= 30, String(coat.wearsPerYear));
  // Jeans rotate with jeans, not with every trouser or skirt.
  const bottoms = [...many(10, { category: "Bottoms", subcategory: "Jeans" }), ...many(10, { category: "Bottoms", subcategory: "Trousers" }), ...many(5, { category: "Bottoms", subcategory: "Skirt" })];
  const jeans = costPerWear({ category: "Bottoms", subcategory: "Jeans", seasons: ["All Seasons"], dayEvening: "both" }, bottoms, price)!;
  assert.equal(jeans.rotatingWith, 10);
  assert.ok(jeans.wearsPerYear >= 12 && jeans.wearsPerYear <= 25, String(jeans.wearsPerYear));
  // A suit: a couple of days a week, not a generic low guess.
  const suit = costPerWear({ category: "Suits", subcategory: "Suit", seasons: ["All Seasons"], dayEvening: "day" }, [], price)!;
  assert.ok(suit.wearsPerYear >= 40, String(suit.wearsPerYear));
  // Summer swimwear: a few dozen beach days, shared with the swimsuits owned.
  const swim = costPerWear({ category: "Swimwear", subcategory: "One-piece Swimsuit", seasons: ["Summer"] }, many(3, { category: "Swimwear", subcategory: "Bikini Top", season: "Summer" }), price)!;
  assert.ok(swim.wearsPerYear >= 5 && swim.wearsPerYear <= 15, String(swim.wearsPerYear));
});

test("cost per wear: only elegant summer pieces (fine heels, formal) also count the galas of the other seasons", () => {
  const price = { priceEur: 900, usualEur: 600, topEur: 1000, basedOn: 20, tier: "upper_range" as const, sameModelPaidEur: null };
  const jewel = costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "evening", formality: 4 }, [], price)!;
  assert.ok(jewel.reasons.includes("formalAllYear"));
  const beach = costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "day", formality: 1 }, [], price)!;
  assert.ok(!beach.reasons.includes("formalAllYear"));
  // An evening sandal on a fine heel goes out with tights; a flat evening sandal stays in summer.
  assert.ok(costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "evening", formality: 3, heelHeight: "High" }, [], price)!.reasons.includes("formalAllYear"));
  assert.ok(!costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "evening", formality: 3, heelHeight: "Flat" }, [], price)!.reasons.includes("formalAllYear"));
  assert.ok(!costPerWear({ category: "Shoes", subcategory: "Sandals", seasons: ["Summer"], dayEvening: "evening", formality: 4, heelHeight: "Flat" }, [], price)!.reasons.includes("formalAllYear"));
  // A linen summer dress or a straw bag stay in their season.
  assert.ok(!costPerWear({ category: "Dresses", subcategory: "Slip Dress", seasons: ["Summer"], dayEvening: "evening", formality: 3 }, [], price)!.reasons.includes("formalAllYear"));
  // ~32 summer nights plus ~4–5 galas in the other seasons.
  assert.ok(jewel.wearsPerYear >= 30, String(jewel.wearsPerYear));
});

test("cost per wear: coats with coats, jackets with jackets, blazers with blazers", () => {
  const price = { priceEur: 900, usualEur: 600, topEur: 1000, basedOn: 10, tier: "upper_range" as const, sameModelPaidEur: null };
  const many = (n: number, subcategory: string) => Array.from({ length: n }, () => item({ category: "Outerwear", subcategory, season: "All Seasons" }));
  const outer = [...many(3, "Coat"), ...many(2, "Trench Coat"), ...many(4, "Bomber Jacket"), ...many(18, "Blazer")];
  assert.equal(costPerWear({ category: "Outerwear", subcategory: "Coat", seasons: ["All Seasons"] }, outer, price)!.rotatingWith, 5);
  assert.equal(costPerWear({ category: "Outerwear", subcategory: "Leather Jacket", seasons: ["All Seasons"] }, outer, price)!.rotatingWith, 4);
  assert.equal(costPerWear({ category: "Outerwear", subcategory: "Blazer", seasons: ["All Seasons"] }, outer, price)!.rotatingWith, 18);
});
