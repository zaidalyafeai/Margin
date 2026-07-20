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
  "colm",
] as const;

export type ReviewConfigurationId = (typeof REVIEW_CONFIGURATION_IDS)[number];

export type ReviewField = {
  id: string;
  label: string;
  description: string;
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
      {
        id: "summary",
        label: "Paper Summary",
        description: "Briefly summarize the paper’s main claims, methods, and findings in your own words.",
      },
      {
        id: "strengths",
        label: "Summary of Strengths",
        description: "Highlight the paper’s strongest contributions, novelty, clarity, or empirical results.",
      },
      {
        id: "weaknesses",
        label: "Summary of Weaknesses",
        description: "Describe the main limitations, missing baselines, unclear claims, or methodological concerns.",
      },
      {
        id: "comments",
        label: "Comments/Suggestions/Typos",
        description: "List actionable suggestions, clarifications, and minor issues such as typos or presentation fixes.",
      },
      {
        id: "limitations-impact",
        label: "Limitations and Societal Impact",
        description: "Discuss limitations the authors should acknowledge and any broader ethical or societal implications.",
      },
    ],
  },
  {
    id: "iclr",
    version: 1,
    venue: "ICLR",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Summarize the submission’s problem, approach, and key results for a general ML audience.",
      },
      {
        id: "strengths",
        label: "Strengths",
        description: "Explain what works well: novelty, soundness, significance, clarity, or experimental support.",
      },
      {
        id: "weaknesses",
        label: "Weaknesses",
        description: "Explain the main shortcomings that affect soundness, novelty, significance, or clarity.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "List concrete questions for the authors that would help resolve uncertainties in the review.",
      },
      {
        id: "additional-feedback",
        label: "Additional Feedback",
        description: "Optional extra comments that do not fit the other sections (presentation, related work, etc.).",
      },
    ],
  },
  {
    id: "neurips",
    version: 1,
    venue: "NeurIPS",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Provide a concise overview of the paper’s goals, methods, and contributions.",
      },
      {
        id: "main-review",
        label: "Main Review",
        description: "Write the core assessment covering strengths, weaknesses, soundness, and overall recommendation rationale.",
      },
    ],
  },
  {
    id: "icml",
    version: 1,
    venue: "ICML",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Summarize the paper’s motivation, method, and primary empirical or theoretical results.",
      },
      {
        id: "strengths",
        label: "Strengths",
        description: "Describe the most important positive aspects of the work.",
      },
      {
        id: "weaknesses",
        label: "Weaknesses",
        description: "Describe the most important negative aspects or gaps in the work.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "Ask clear, answerable questions that authors can address in a rebuttal.",
      },
    ],
  },
  {
    id: "cvpr",
    version: 1,
    venue: "CVPR",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Summarize the paper’s vision/ML contribution, approach, and reported results.",
      },
      {
        id: "strengths",
        label: "Strengths",
        description: "Call out novelty, technical quality, experiments, and presentation strengths.",
      },
      {
        id: "weaknesses",
        label: "Weaknesses",
        description: "Call out technical flaws, missing comparisons, limited evaluation, or unclear claims.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "List questions that would clarify method details, experiments, or claims.",
      },
    ],
  },
  {
    id: "iccv",
    version: 1,
    venue: "ICCV",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Summarize the submission’s problem setting, method, and main findings.",
      },
      {
        id: "strengths",
        label: "Strengths",
        description: "Describe the paper’s strongest technical and empirical contributions.",
      },
      {
        id: "weaknesses",
        label: "Weaknesses",
        description: "Describe key concerns about correctness, novelty, evaluation, or clarity.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "Provide specific questions for the authors to address.",
      },
    ],
  },
  {
    id: "eccv",
    version: 1,
    venue: "ECCV",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Summarize the paper’s goals, technical approach, and contributions.",
      },
      {
        id: "strengths",
        label: "Strengths",
        description: "Highlight what is compelling about the method, results, or presentation.",
      },
      {
        id: "weaknesses",
        label: "Weaknesses",
        description: "Highlight the main issues that reduce confidence in the work.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "List open questions that would improve the review or paper.",
      },
    ],
  },
  {
    id: "aaai",
    version: 1,
    venue: "AAAI",
    fields: [
      {
        id: "summary",
        label: "Summary",
        description: "Summarize the problem, proposed approach, and key outcomes.",
      },
      {
        id: "strengths",
        label: "Strengths",
        description: "Explain the paper’s main strengths for an AAAI audience.",
      },
      {
        id: "weaknesses",
        label: "Weaknesses",
        description: "Explain the paper’s main weaknesses and how they affect the contribution.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "Ask focused questions that authors can answer to strengthen the paper.",
      },
    ],
  },
  {
    id: "aistats",
    version: 1,
    venue: "AISTATS",
    fields: [
      {
        id: "summary-contributions",
        label: "Summary and Contributions",
        description: "Summarize the paper and state its main statistical or ML contributions.",
      },
      {
        id: "soundness",
        label: "Soundness",
        description: "Assess technical correctness of theory, algorithms, and experimental methodology.",
      },
      {
        id: "presentation",
        label: "Presentation",
        description: "Comment on clarity of writing, organization, figures, and reproducibility details.",
      },
      {
        id: "significance",
        label: "Significance",
        description: "Assess importance of the problem and potential impact of the results.",
      },
      {
        id: "originality",
        label: "Originality",
        description: "Assess novelty relative to prior work and whether the contribution is distinct.",
      },
      {
        id: "questions",
        label: "Questions",
        description: "List questions for the authors about claims, proofs, or experiments.",
      },
    ],
  },
  {
    id: "colm",
    version: 1,
    venue: "COLM",
    fields: [
      {
        id: "review",
        label: "Review",
        description: "Briefly summarize the submission. What are the key strengths and weaknesses?",
      },
      {
        id: "suggestions-and-questions",
        label: "Suggestions and Questions",
        description: "Please describe any suggestions and questions for the authors. Make sure that the points are clear and actionable.",
      },
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
