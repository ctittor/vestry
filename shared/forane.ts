export const activityCategories = {
  pastoral: "Pastoral coordination",
  catechesis: "Catechesis & faith formation",
  clergy_meeting: "Clergy meetings & formation",
  visitation: "Parish visitation",
  liturgy: "Liturgy & church care",
  stewardship: "Registers & stewardship",
  clergy_care: "Clergy support coordination",
  delegated_request: "Delegated request / installation",
};
export const observationLabels = {
  pastoral: "Pastoral coordination & parish follow-up",
  registers: "Parish registers, documents & custody",
  liturgy: "Divine Liturgy & prescribed celebrations",
  furnishings: "Church care & sacred furnishings",
  goods: "Stewardship of ecclesiastical goods",
  parish_house: "Parish house care",
  clergy: "Clergy formation & support arrangements",
};
export const checklistKeys: Record<string, (keyof typeof observationLabels)[]> =
  {
    visitation: [
      "pastoral",
      "registers",
      "liturgy",
      "furnishings",
      "goods",
      "parish_house",
      "clergy",
    ],
    stewardship: ["registers", "goods", "parish_house"],
    liturgy: ["liturgy", "furnishings"],
  };
export function initialChecklist(category: string) {
  return (checklistKeys[category] || []).map((key) => ({
    key,
    status: "pending",
    note: "",
  }));
}
