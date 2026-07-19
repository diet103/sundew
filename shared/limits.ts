// Single source of truth for every size/count cap, client and server.

export const LIMITS = {
    definitionBytes: 256 * 1024,
    sectionsPerForm: 25,
    questionsPerForm: 120,
    optionsPerQuestion: 30,
    titleChars: 200,
    descriptionChars: 2000,
    optionLabelChars: 200,

    answersBytes: 64 * 1024,
    answerChars: 5000,

    formsPerUser: 100,
    submissionsPerForm: 1000,
} as const;

export const AUTOSAVE = {
    debounceMs: 2000,
    minIntervalMs: 5000,
    retryBaseMs: 1000,
    retryMaxMs: 30000,
} as const;
