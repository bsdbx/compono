export type ChoiceMenu = {
  search: string;
  groups?: Readonly<Record<string, readonly string[]>>;
  names?: Readonly<Record<string, string>>;
  optional?: boolean;
};

const MENUS: Readonly<Record<string, Readonly<Record<string, ChoiceMenu>>>> = {
  element: {
    tag: {
      search: "Search tags",
      groups: {
        Layout: [
          "div",
          "section",
          "header",
          "footer",
          "main",
          "nav",
          "article",
          "aside",
        ],
        Text: [
          "p",
          "span",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "strong",
          "em",
          "small",
          "label",
          "br",
          "hr",
        ],
        Lists: ["ul", "ol", "li"],
        Interactive: ["a", "button"],
        Media: ["img"],
      },
    },
    role: {
      search: "Search roles",
      groups: {
        General: ["", "none", "presentation"],
        Landmarks: ["banner", "contentinfo", "main", "navigation", "region"],
        Structure: ["article", "heading", "img", "list", "listitem"],
        Interactive: ["button", "dialog", "link", "tab", "tablist", "tabpanel"],
        Status: ["alert", "status"],
      },
    },
  },
  compare: {
    op: {
      search: "Search comparisons",
      groups: {
        Equality: ["Equal", "Not equal"],
        Ordering: ["Less", "Less or equal", "Greater", "Greater or equal"],
      },
    },
  },
  "boolean-math": { op: { search: "Search operations" } },
  number: {
    subtype: { search: "Search subtypes", names: { Number: "Decimal" } },
  },
  text: { subtype: { search: "Search subtypes" } },
  "set-field": { field: { search: "Search fields", optional: true } },
};

export function choiceMenuOf(
  nodeType: string,
  field: string,
): ChoiceMenu | undefined {
  return MENUS[nodeType]?.[field];
}
