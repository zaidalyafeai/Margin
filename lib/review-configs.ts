export const REVIEW_CONFIGURATION_IDS = [
  "acl-arr",
  "iclr",
  "neurips",
  "icml",
  "cvpr",
  "iccv",
  "eccv",
  "aaai",
  "aistats",
] as const;

export type ReviewConfigurationId = (typeof REVIEW_CONFIGURATION_IDS)[number];

export type ReviewField = {
  id: string;
  label: string;
};

export type ReviewConfiguration = {
  id: ReviewConfigurationId;
  version: 1;
  venue: string;
  fields: ReviewField[];
};

export const REVIEW_CONFIGURATIONS: readonly ReviewConfiguration[] = [
  {
    id: "acl-arr",
    version: 1,
    venue: "ACL ARR",
    fields: [
      { id: "summary", label: "Paper Summary" },
      { id: "strengths", label: "Summary of Strengths" },
      { id: "weaknesses", label: "Summary of Weaknesses" },
      { id: "comments", label: "Comments/Suggestions/Typos" },
      { id: "limitations-impact", label: "Limitations and Societal Impact" },
    ],
  },
  {
    id: "iclr",
    version: 1,
    venue: "ICLR",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "questions", label: "Questions" },
      { id: "additional-feedback", label: "Additional Feedback" },
    ],
  },
  {
    id: "neurips",
    version: 1,
    venue: "NeurIPS",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "main-review", label: "Main Review" },
    ],
  },
  {
    id: "icml",
    version: 1,
    venue: "ICML",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "questions", label: "Questions" },
    ],
  },
  {
    id: "cvpr",
    version: 1,
    venue: "CVPR",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "questions", label: "Questions" },
    ],
  },
  {
    id: "iccv",
    version: 1,
    venue: "ICCV",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "questions", label: "Questions" },
    ],
  },
  {
    id: "eccv",
    version: 1,
    venue: "ECCV",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "questions", label: "Questions" },
    ],
  },
  {
    id: "aaai",
    version: 1,
    venue: "AAAI",
    fields: [
      { id: "summary", label: "Summary" },
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "questions", label: "Questions" },
    ],
  },
  {
    id: "aistats",
    version: 1,
    venue: "AISTATS",
    fields: [
      { id: "summary-contributions", label: "Summary and Contributions" },
      { id: "soundness", label: "Soundness" },
      { id: "presentation", label: "Presentation" },
      { id: "significance", label: "Significance" },
      { id: "originality", label: "Originality" },
      { id: "questions", label: "Questions" },
    ],
  },
];

export const DEFAULT_REVIEW_CONFIGURATION_ID: ReviewConfigurationId = "acl-arr";

export function getReviewConfiguration(id: ReviewConfigurationId) {
  const configuration = REVIEW_CONFIGURATIONS.find((item) => item.id === id) ?? REVIEW_CONFIGURATIONS[0];
  return { ...configuration, fields: configuration.fields.map((field) => ({ ...field })) };
}

export function isReviewConfigurationId(value: string): value is ReviewConfigurationId {
  return REVIEW_CONFIGURATION_IDS.some((id) => id === value);
}

export const REVIEW_FIELD_LABELS = new Set(
  REVIEW_CONFIGURATIONS.flatMap((configuration) => configuration.fields.map((field) => field.label)),
);
