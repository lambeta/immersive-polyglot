/** The Client half's copy: one namespace, English and Chinese, per the constitution's rule V. */
export const NS = "immersivePolyglot";

export const en = {
  controlLabel: "Translate this page",
  controlOn: "Translation on",
  controlOff: "Translation off",
  controlBusy: "Translating…",
  sectionLabel: "Translation",
  unavailable: "Translation is unavailable",
} as const;

export const zh = {
  controlLabel: "翻译这一页",
  controlOn: "翻译已开启",
  controlOff: "翻译已关闭",
  controlBusy: "翻译中…",
  sectionLabel: "译文",
  unavailable: "翻译暂不可用",
} as const;

export type Key = keyof typeof en;
