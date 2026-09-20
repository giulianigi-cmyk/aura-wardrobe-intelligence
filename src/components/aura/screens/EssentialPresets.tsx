import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, X, Loader2, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import {
  listEssentialPresets, createEssentialPreset, deleteEssentialPreset,
  addPresetItem, removePresetItem, replacePresetItems,
  type EssentialPreset, type EssentialPresetItem,
} from "@/lib/essentials.functions";

type PresetWithItems = EssentialPreset & { items: EssentialPresetItem[] };

const keyOf = (it: { category: string | null; name: string }) => `${(it.category ?? "").trim().toLowerCase()}|${it.name.trim().toLowerCase()}`;
const toInput = (it: EssentialPresetItem) => ({ category: it.category, name: it.name, quantity: it.quantity, alwaysInclude: it.always_include });

export function EssentialPresets({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<PresetWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [copyChooserFor, setCopyChooserFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    listEssentialPresets()
      .then((res) => setPresets(res.presets as PresetWithItems[]))
      .catch((e) => console.error("[AURA essentials] load failed", e))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addPreset = async () => {
    if (!newPresetName.trim()) return;
    try {
      await createEssentialPreset({ data: { name: newPresetName.trim(), items: [] } });
      setNewPresetName("");
      setAddingPreset(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("essentialPresets.couldntCreatePreset"));
    }
  };

  const removePreset = async (id: string) => {
    try {
      await deleteEssentialPreset({ data: { presetId: id } });
      setPresets((prev) => prev.filter((p) => p.id !== id));
      toast.success(t("essentialPresets.presetRemoved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("essentialPresets.couldntRemovePreset"));
    }
  };

  /** Two trips (work vs leisure) share most of their list and differ in a few things:
   *  duplicate a whole list, then just edit the difference. */
  const duplicatePreset = async (p: PresetWithItems) => {
    setBusyId(p.id);
    try {
      const suffix = t("essentialPresets.copySuffix", { defaultValue: "copy" });
      const res = await createEssentialPreset({ data: { name: `${p.name} ${suffix}`.slice(0, 60), items: p.items.map(toInput) } });
      toast.success(t("essentialPresets.duplicated", { defaultValue: "List duplicated — edit it to fit the new trip" }));
      load();
      setOpenId(res.preset.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("essentialPresets.couldntCreatePreset"));
    } finally {
      setBusyId(null);
    }
  };

  /** Adds to this list everything from another list that isn't on it already. */
  const copyItemsFrom = async (target: PresetWithItems, source: PresetWithItems) => {
    const have = new Set(target.items.map(keyOf));
    const toAdd = source.items.filter((it) => !have.has(keyOf(it)));
    setCopyChooserFor(null);
    if (!toAdd.length) {
      toast(t("essentialPresets.nothingNew", { defaultValue: "Everything from that list is already here" }));
      return;
    }
    setBusyId(target.id);
    try {
      await replacePresetItems({ data: { presetId: target.id, items: [...target.items, ...toAdd].map(toInput) } });
      toast.success(t("essentialPresets.itemsCopied", { count: toAdd.length, defaultValue: "{{count}} items added" }));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("essentialPresets.couldntAddItem"));
    } finally {
      setBusyId(null);
    }
  };

  // Every add/remove below hits the database immediately — there is no
  // separate "Save" step to forget. Optimistic local update first, then
  // reconcile with the real row (or roll back on failure).
  const addItem = async (presetId: string) => {
    if (!newItemName.trim()) return;
    const name = newItemName.trim();
    const category = newItemCategory.trim() || null;
    setNewItemName("");
    setNewItemCategory("");
    setAddingItem(true);
    try {
      const res = await addPresetItem({ data: { presetId, name, category, quantity: 1 } });
      setPresets((prev) => prev.map((p) => (p.id === presetId ? { ...p, items: [...p.items, res.item] } : p)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("essentialPresets.couldntAddItem"));
      setNewItemName(name); // give it back so nothing is lost
      setNewItemCategory(category ?? "");
    } finally {
      setAddingItem(false);
    }
  };

  const removeItem = async (presetId: string, itemId: string) => {
    const prevPresets = presets;
    setPresets((prev) => prev.map((p) => (p.id === presetId ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p)));
    try {
      await removePresetItem({ data: { id: itemId } });
    } catch (e) {
      console.error("[AURA essentials] remove item failed", e);
      setPresets(prevPresets); // roll back
      toast.error(t("essentialPresets.couldntRemoveItem"));
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-2 flex items-center gap-3">
        <button onClick={() => go("trips")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("essentialPresets.tripPlanner")}</p>
          <h1 className="font-serif text-3xl mt-1">{t("essentialPresets.myEssentials")}</h1>
        </div>
      </header>
      <p className="px-6 mt-2 text-xs text-muted-foreground">
        {t("essentialPresets.hint")}
      </p>

      {loading ? (
        <div className="flex justify-center mt-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="px-6 mt-5 space-y-3">
          {presets.map((p) => {
            const isOpen = openId === p.id;
            return (
              <div key={p.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <button onClick={() => setOpenId(isOpen ? null : p.id)} className="w-full p-4 flex items-center justify-between text-left">
                  <div>
                    <p className="font-serif text-lg">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t("essentialPresets.itemsCount", { count: p.items.length })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); void duplicatePreset(p); }}
                      disabled={busyId === p.id}
                      aria-label={t("essentialPresets.duplicateAria", { name: p.name, defaultValue: "Duplicate {{name}}" })}
                      className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90 disabled:opacity-50"
                    >{busyId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removePreset(p.id); }}
                      aria-label={t("essentialPresets.deleteAria", { name: p.name })}
                      className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"
                    ><Trash2 size={13} /></button>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border/40 pt-3">
                    {p.items.length === 0 && (
                      <p className="text-xs text-muted-foreground pb-1">{t("essentialPresets.nothingHereYet")}</p>
                    )}
                    {p.items.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 rounded-full bg-secondary/40 px-3 py-2">
                        {it.category && <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">{it.category}</span>}
                        <span className="flex-1 text-sm truncate">{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</span>
                        <button onClick={() => void removeItem(p.id, it.id)} aria-label={t("essentialPresets.removeAria", { name: it.name })} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-muted-foreground">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                        placeholder={t("essentialPresets.categoryOptional")}
                        className="w-28 bg-secondary/40 rounded-full px-3 py-2 text-xs outline-none placeholder:text-muted-foreground"
                      />
                      <input
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void addItem(p.id)}
                        placeholder={t("essentialPresets.addItemPlaceholder")}
                        className="flex-1 bg-secondary/40 rounded-full px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                      />
                      <button
                        onClick={() => void addItem(p.id)}
                        disabled={addingItem}
                        aria-label={t("essentialPresets.addItemAria")}
                        className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 disabled:opacity-60"
                      >
                        {addingItem ? <Loader2 size={12} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>

                    {presets.length > 1 && (
                      <div className="pt-2">
                        {copyChooserFor === p.id ? (
                          <div className="rounded-2xl bg-secondary/40 p-3 space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                              {t("essentialPresets.copyFromList", { defaultValue: "Copy items from…" })}
                            </p>
                            {presets.filter((o) => o.id !== p.id).map((o) => (
                              <button
                                key={o.id}
                                onClick={() => void copyItemsFrom(p, o)}
                                disabled={busyId === p.id}
                                className="w-full flex items-center justify-between rounded-full bg-background px-4 py-2.5 text-left disabled:opacity-60"
                              >
                                <span className="text-sm truncate">{o.name}</span>
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 ml-2">
                                  {t("essentialPresets.itemsCount", { count: o.items.length })}
                                </span>
                              </button>
                            ))}
                            <button onClick={() => setCopyChooserFor(null)} className="w-full h-9 rounded-full border border-border text-[10px] uppercase tracking-[0.25em]">
                              {t("tripDetail.cancel")}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setCopyChooserFor(p.id)}
                            className="w-full h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-2"
                          ><Copy size={13} /> {t("essentialPresets.copyItemsFrom", { defaultValue: "Copy items from another list" })}</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {addingPreset ? (
            <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-2">
              <input
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addPreset()}
                placeholder={t("essentialPresets.newPresetPlaceholder")}
                className="flex-1 bg-secondary/40 rounded-full px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button onClick={() => void addPreset()} className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0"><Plus size={14} /></button>
              <button onClick={() => { setAddingPreset(false); setNewPresetName(""); }} className="h-9 w-9 rounded-full bg-secondary/60 flex items-center justify-center shrink-0"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingPreset(true)}
              className="w-full h-12 rounded-full border border-dashed border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground flex items-center justify-center gap-2"
            ><Plus size={14} /> {t("essentialPresets.newPreset")}</button>
          )}
        </div>
      )}
    </div>
  );
}
