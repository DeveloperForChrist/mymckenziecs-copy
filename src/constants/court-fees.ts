// UK Court Fees 2026
// Based on HMCTS Fee Schedule (EX50)

export interface FeeRange {
  min?: number;
  max?: number;
  fee?: number;
  percentage?: number;
  maxFee?: number;
}

export interface CourtFees {
  moneyClaimsOnline: FeeRange[];
  countyCourtMoneyClaimIssue: FeeRange[];
  applications: Record<string, number>;
  hearingFees: Record<string, number>;
  appealFees: Record<string, number>;
}

export const COURT_FEES_2026: CourtFees = {
  // Money Claims Online (MCOL) - Issue fees
  moneyClaimsOnline: [
    { max: 300, fee: 35 },
    { min: 300.01, max: 500, fee: 50 },
    { min: 500.01, max: 1000, fee: 70 },
    { min: 1000.01, max: 1500, fee: 80 },
    { min: 1500.01, max: 3000, fee: 115 },
    { min: 3000.01, max: 5000, fee: 205 },
    { min: 5000.01, max: 10000, fee: 455 },
    { min: 10000.01, max: 200000, fee: 830 },
    { min: 200000.01, percentage: 5, maxFee: 10000 }
  ],

  // County Court Money Claim - Issue fees
  countyCourtMoneyClaimIssue: [
    { max: 300, fee: 35 },
    { min: 300.01, max: 500, fee: 50 },
    { min: 500.01, max: 1000, fee: 70 },
    { min: 1000.01, max: 1500, fee: 80 },
    { min: 1500.01, max: 3000, fee: 115 },
    { min: 3000.01, max: 5000, fee: 205 },
    { min: 5000.01, max: 10000, fee: 455 },
    { min: 10000.01, max: 200000, fee: 830 },
    { min: 200000.01, percentage: 5, maxFee: 10000 }
  ],

  // Applications (Form N244, etc.)
  applications: {
    general: 255,              // N244 General application
    setAsideDefault: 255,      // Set aside default judgment
    summaryJudgment: 255,      // Summary judgment
    strikeOut: 255,            // Strike out application
    interimInjunction: 255,    // Interim injunction
    specificDisclosure: 255,   // Specific disclosure
    securityForCosts: 255,     // Security for costs
    permissionToAppeal: 255,   // Permission to appeal
    varyOrder: 50,             // Vary or suspend order
    enforcementOrder: 110,     // Enforcement by warrant
    thirdPartyDebt: 110,       // Third party debt order
    attachmentOfEarnings: 110, // Attachment of earnings
    chargingOrder: 110         // Charging order
  },

  // Hearing Fees
  hearingFees: {
    smallClaimsUnder300: 27,
    smallClaims300to1500: 80,
    smallClaims1500to3000: 115,
    fastTrack: 545,
    multiTrackUnder25k: 1090,
    multiTrack25kTo100k: 1090,
    multiTrack100kTo250k: 2205,
    multiTrackOver250k: 10400
  },

  // Appeal Fees
  appealFees: {
    circuitJudge: 255,
    highCourt: 480,
    courtOfAppeal: 465
  }
};

// Help with Fees Thresholds 2026
export interface ExemptionThresholds {
  single: { under60: number; over60: number };
  couple: { under60: number; over60: number };
  childAllowance: number;
  savingsLimit: number;
}

export const HELP_WITH_FEES_THRESHOLDS: ExemptionThresholds = {
  // Monthly disposable income thresholds (£)
  single: {
    under60: 1420,
    over60: 1580
  },
  couple: {
    under60: 1900,
    over60: 2100
  },
  childAllowance: 285, // Additional per child
  savingsLimit: 16000  // Maximum savings to qualify (disposable capital)
};

export const TRACK_ALLOCATION = {
  smallClaims: { max: 10000, description: 'Small Claims Track (up to £10,000)' },
  fastTrack: { min: 10000, max: 25000, description: 'Fast Track (£10,000 - £25,000)' },
  multiTrack: { min: 25000, description: 'Multi-Track (over £25,000)' }
};

export type ClaimType = 'money' | 'housing' | 'personal-injury' | 'other';
export type TrackType = 'small-claims' | 'fast-track' | 'multi-track';

export function determineTrack(claimValue: number): TrackType {
  if (claimValue <= 10000) return 'small-claims';
  if (claimValue <= 25000) return 'fast-track';
  return 'multi-track';
}

export function calculateIssueFee(claimValue: number): number {
  const ranges = COURT_FEES_2026.countyCourtMoneyClaimIssue;
  
  for (const range of ranges) {
    if (range.percentage) {
      // 5% of claim value, capped at maxFee
      const fee = claimValue * (range.percentage / 100);
      return Math.min(fee, range.maxFee || fee);
    }
    
    if (range.max !== undefined && claimValue <= range.max) {
      return range.fee || 0;
    }
    
    if (range.min !== undefined && range.max !== undefined) {
      if (claimValue >= range.min && claimValue <= range.max) {
        return range.fee || 0;
      }
    }
  }
  
  return 0;
}

export function calculateHearingFee(claimValue: number, track: TrackType): number {
  const fees = COURT_FEES_2026.hearingFees;
  
  if (track === 'small-claims') {
    if (claimValue < 300) return fees.smallClaimsUnder300;
    if (claimValue <= 1500) return fees.smallClaims300to1500;
    return fees.smallClaims1500to3000;
  }
  
  if (track === 'fast-track') {
    return fees.fastTrack;
  }
  
  // Multi-track
  if (claimValue <= 25000) return fees.multiTrackUnder25k;
  if (claimValue <= 100000) return fees.multiTrack25kTo100k;
  if (claimValue <= 250000) return fees.multiTrack100kTo250k;
  return fees.multiTrackOver250k;
}

export function checkHelpWithFeesEligibility(
  monthlyIncome: number,
  savings: number,
  isCouple: boolean,
  over60: boolean,
  numberOfChildren: number
): { eligible: boolean; reason: string } {
  // Check savings first
  if (savings > HELP_WITH_FEES_THRESHOLDS.savingsLimit) {
    return {
      eligible: false,
      reason: `Savings exceed £${HELP_WITH_FEES_THRESHOLDS.savingsLimit.toLocaleString()} limit`
    };
  }
  
  // Calculate income threshold
  const baseThreshold = isCouple
    ? (over60 ? HELP_WITH_FEES_THRESHOLDS.couple.over60 : HELP_WITH_FEES_THRESHOLDS.couple.under60)
    : (over60 ? HELP_WITH_FEES_THRESHOLDS.single.over60 : HELP_WITH_FEES_THRESHOLDS.single.under60);
  
  const childAllowance = numberOfChildren * HELP_WITH_FEES_THRESHOLDS.childAllowance;
  const totalThreshold = baseThreshold + childAllowance;
  
  if (monthlyIncome <= totalThreshold) {
    return {
      eligible: true,
      reason: `Monthly disposable income (£${monthlyIncome}) is below threshold (£${totalThreshold})`
    };
  }
  
  return {
    eligible: false,
    reason: `Monthly disposable income (£${monthlyIncome}) exceeds threshold (£${totalThreshold})`
  };
}
