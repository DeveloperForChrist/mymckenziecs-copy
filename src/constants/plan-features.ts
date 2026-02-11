// Centralized plan features for gating
export const PLAN_FEATURES = {
  freemium: {
    name: "Basic",
    messageLimit: 20,         // per day
    caseLimit: 1,
    docUploadLimit: 5,        // total storage
    caseLawSearch: "none",
    advancedAnalysis: false,
    prioritySupport: false,
    history: false,
  },
  standard: {
    name: "Standard",
    messageLimit: 30,         // per thread
    caseLimit: 3,
    docUploadLimit: 15,       // total storage
    caseLawSearch: "none",
    advancedAnalysis: false,
    prioritySupport: false,
    history: true,
  },
  premium: {
    name: "Essential",
    messageLimit: 40,         // per thread
    caseLimit: Infinity,
    docUploadLimit: 20,       // total storage
    caseLawSearch: "full",
    advancedAnalysis: true,
    prioritySupport: false,
    history: true,
  },
  pro: {
    name: "Plus",
    messageLimit: 50,         // per thread
    caseLimit: Infinity,
    docUploadLimit: 30,       // total storage
    caseLawSearch: "full",
    advancedAnalysis: true,
    prioritySupport: true,
    history: true,
  }
};
