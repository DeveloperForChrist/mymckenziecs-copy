// Centralized plan features for gating
export const PLAN_FEATURES = {
  basic: {
    name: "Basic",
    messageLimit: 20,         // per thread
    caseLimit: Infinity,
    docUploadLimit: 10,       // total storage
    caseLawSearch: "none",
    advancedAnalysis: false,
    prioritySupport: false,
    history: true,
  },
  premium: {
    name: "Premium",
    messageLimit: 25,         // per thread
    caseLimit: Infinity,
    docUploadLimit: 25,       // total storage
    caseLawSearch: "none",
    advancedAnalysis: true,
    prioritySupport: false,
    history: true,
  },
  pro: {
    name: "Premium +",
    messageLimit: 30,         // per thread
    caseLimit: Infinity,
    docUploadLimit: 150,      // total storage
    caseLawSearch: "full",
    advancedAnalysis: true,
    prioritySupport: false,
    history: true,
  }
};
