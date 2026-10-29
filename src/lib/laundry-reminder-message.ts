// The morning reminder about pieces out of the wardrobe (laundry-basket.ts): the dry cleaner after
// 7 days (then every 3), loans 14 days after the loan or the last "ce l'ha ancora", and the pieces
// «forse da lavare» (laundry-due.ts). Sent with the morning look; one notification for all of them.

type Text = {
  title: string;
  dry: (n: number) => string;
  loanOne: (piece: string, name: string) => string;
  loanMany: (n: number) => string;
  due: (n: number) => string;
};

const TEXT: Record<string, Text> = {
  it: {
    title: "Promemoria guardaroba",
    dry: (n) => (n === 1 ? "Hai ritirato il capo dalla tintoria?" : `Hai ritirato i ${n} capi dalla tintoria?`),
    loanOne: (piece, name) => `${piece}: l'avevi prestato a ${name}. L'hai ripreso?`,
    loanMany: (n) => `${n} capi prestati da più di 2 settimane: li hai ripresi?`,
    due: (n) => (n === 1 ? "Un capo che hai indossato è forse da lavare: lo metti nel cesto?" : `${n} capi che hai indossato sono forse da lavare: li metti nel cesto?`),
  },
  en: {
    title: "Wardrobe reminder",
    dry: (n) => (n === 1 ? "Did you collect the piece from the dry cleaner?" : `Did you collect the ${n} pieces from the dry cleaner?`),
    loanOne: (piece, name) => `${piece}: you lent it to ${name}. Did you get it back?`,
    loanMany: (n) => `${n} pieces lent for over 2 weeks: did you get them back?`,
    due: (n) => (n === 1 ? "A piece you wore may need washing: into the basket?" : `${n} pieces you wore may need washing: into the basket?`),
  },
  es: {
    title: "Recordatorio del armario",
    dry: (n) => (n === 1 ? "¿Has recogido la prenda de la tintorería?" : `¿Has recogido las ${n} prendas de la tintorería?`),
    loanOne: (piece, name) => `${piece}: se la prestaste a ${name}. ¿Te la ha devuelto?`,
    loanMany: (n) => `${n} prendas prestadas desde hace más de 2 semanas: ¿te las han devuelto?`,
    due: (n) => (n === 1 ? "Una prenda que has llevado quizá necesita lavado: ¿la pones en el cesto?" : `${n} prendas que has llevado quizá necesitan lavado: ¿las pones en el cesto?`),
  },
  fr: {
    title: "Rappel garde-robe",
    dry: (n) => (n === 1 ? "Avez-vous récupéré la pièce au pressing ?" : `Avez-vous récupéré les ${n} pièces au pressing ?`),
    loanOne: (piece, name) => `${piece} : vous l'avez prêtée à ${name}. Vous l'a-t-on rendue ?`,
    loanMany: (n) => `${n} pièces prêtées depuis plus de 2 semaines : vous les a-t-on rendues ?`,
    due: (n) => (n === 1 ? "Une pièce que vous avez portée est peut-être à laver : dans le panier ?" : `${n} pièces que vous avez portées sont peut-être à laver : dans le panier ?`),
  },
  zh: {
    title: "衣橱提醒",
    dry: (n) => (n === 1 ? "你已经从干洗店取回这件单品了吗？" : `你已经从干洗店取回 ${n} 件单品了吗？`),
    loanOne: (piece, name) => `${piece}：你借给了 ${name}。已经拿回来了吗？`,
    loanMany: (n) => `${n} 件单品借出已超过 2 周：已经拿回来了吗？`,
    due: (n) => (n === 1 ? "你穿过的一件单品可能需要洗了：放进洗衣篮吗？" : `你穿过的 ${n} 件单品可能需要洗了：放进洗衣篮吗？`),
  },
};

export function laundryReminderMessage(
  language: string | null | undefined,
  input: { dryCleaner: number; loans: { piece: string; name: string }[]; due?: number },
): { title: string; body: string } | null {
  const t = TEXT[(language ?? "").slice(0, 2)] ?? TEXT.en;
  const parts: string[] = [];
  if (input.dryCleaner > 0) parts.push(t.dry(input.dryCleaner));
  if (input.loans.length === 1) parts.push(t.loanOne(input.loans[0].piece, input.loans[0].name));
  else if (input.loans.length > 1) parts.push(t.loanMany(input.loans.length));
  if (input.due) parts.push(t.due(input.due));
  return parts.length ? { title: t.title, body: parts.join(" ") } : null;
}
