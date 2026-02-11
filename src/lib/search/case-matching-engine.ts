/**
 * Case Matching Engine
 * 
 * Silently extracts case context from user conversations and searches for
 * relevant UK case law to use as background intelligence for informed guidance.
 * The user never sees the cases - only the wisdom they provide.
 */

import { SearchTool } from '@/lib/ai/tools/search-tool';

export interface CaseContext {
  legalAreas: string[];
  keyFacts: string[];
  stage: 'pre_dispute' | 'pre_litigation' | 'at_court' | 'unknown';
  parties: string[];
  keyIssues: string[];
  timelineEvents: string[];
}

export interface CaseIntelligence {
  principles: string[];
  keyFactorsMattering: string[];
  commonOutcomes: string[];
  riskFactors: string[];
  strengthFactors: string[];
}

/**
 * Extracts case context silently from conversation history
 */
export class CaseContextExtractor {
  extractContext(conversationHistory: Array<{ role: string; content: string }>): CaseContext {
    const userMessages = conversationHistory
      .filter((m) => m.role === 'user')
      .map((m) => m.content.toLowerCase())
      .join(' ');

    return {
      legalAreas: this.extractLegalAreas(userMessages),
      keyFacts: this.extractKeyFacts(userMessages),
      stage: this.extractStage(userMessages),
      parties: this.extractParties(userMessages),
      keyIssues: this.extractKeyIssues(userMessages),
      timelineEvents: this.extractTimeline(userMessages),
    };
  }

  private extractLegalAreas(text: string): string[] {
    const areas: string[] = [];

    const patterns: Array<[RegExp, string]> = [
      [/employment|dismissed|redundancy|unfair dismissal|contract termination/i, 'employment law'],
      [/landlord|tenant|eviction|deposit|rent|lease|tenancy/i, 'landlord-tenant law'],
      [/contract|breach|agreement|terms|conditions/i, 'contract law'],
      [/negligence|accident|injury|damage|harm|liable/i, 'negligence tort law'],
      [/defamation|libel|slander|reputation|false statement/i, 'defamation law'],
      [/family|divorce|separation|custody|child|parent/i, 'family law'],
      [/property|ownership|boundary|dispute|real estate/i, 'property law'],
      [/debt|loan|creditor|default|payment|money owed/i, 'debt law'],
      [/discrimination|harassment|prejudice|protected characteristic/i, 'discrimination law'],
      [/consumer|product|service|guarantee|refund/i, 'consumer law'],
    ];

    for (const [pattern, area] of patterns) {
      if (pattern.test(text) && !areas.includes(area)) {
        areas.push(area);
      }
    }

    return areas.length > 0 ? areas : ['general civil law'];
  }

  private extractKeyFacts(text: string): string[] {
    const facts: string[] = [];

    // Extract dates
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{4}|\d{1,2}\s+days?|weeks?|months?)/gi;
    let dateMatch;
    while ((dateMatch = datePattern.exec(text)) !== null) {
      facts.push(`Timeline: ${dateMatch[0].trim()}`);
    }

    // Extract amounts/values
    const moneyPattern = /£\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:pounds?|quid)/gi;
    let moneyMatch;
    while ((moneyMatch = moneyPattern.exec(text)) !== null) {
      facts.push(`Amount: ${moneyMatch[0].trim()}`);
    }

    // Extract key actions/events
    const actionPatterns = [
      /(?:sent|received|gave|provided|failed to|did not|didn't|refused).*?(?:letter|email|notice|document|payment)/gi,
      /(?:told|said|promised|agreed|denied|claimed).*?(?:\w+\s+){0,5}(?:\.|,|;)/gi,
    ];

    for (const pattern of actionPatterns) {
      let actionMatch;
      while ((actionMatch = pattern.exec(text)) !== null) {
        const action = actionMatch[0].trim().slice(0, 80);
        if (!facts.includes(action) && action.length > 10) {
          facts.push(action);
        }
      }
    }

    return facts.slice(0, 8);
  }

  private extractStage(text: string): 'pre_dispute' | 'pre_litigation' | 'at_court' | 'unknown' {
    if (/court|hearing|trial|judge|submitted|filed|claim form|statement of case/.test(text)) {
      return 'at_court';
    }
    if (/letter before action|solicitor|pre-action|before court|threatening|warning/.test(text)) {
      return 'pre_litigation';
    }
    if (/just happened|just realized|what should|can i|is it|does|my rights/.test(text)) {
      return 'pre_dispute';
    }
    return 'unknown';
  }

  private extractParties(text: string): string[] {
    const parties: string[] = [];
    const partyPatterns = [
      /(?:employer|company|business|organization|landlord|defendant|claimant|other party|they|he|she|person)/gi,
    ];

    for (const pattern of partyPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((m) => {
          if (!parties.includes(m.toLowerCase())) {
            parties.push(m.toLowerCase());
          }
        });
      }
    }

    return Array.from(new Set(parties)).slice(0, 4);
  }

  private extractKeyIssues(text: string): string[] {
    const issues: string[] = [];

    const issuePatterns: Array<[RegExp, string]> = [
      [/unfair|unjust|breach|violation|failure|denied|refused/i, 'Fairness/legality concern'],
      [/evidence|proof|documentation|records|witness/i, 'Evidence/proof issue'],
      [/compensation|damages|payment|money/i, 'Remedies/compensation sought'],
      [/timeline|delay|months|years|time limit/i, 'Timing/limitation period concern'],
      [/liability|responsibility|fault|blame|caused/i, 'Liability/causation issue'],
    ];

    for (const [pattern, issue] of issuePatterns) {
      if (pattern.test(text) && !issues.includes(issue)) {
        issues.push(issue);
      }
    }

    return issues.slice(0, 5);
  }

  private extractTimeline(text: string): string[] {
    const timeline: string[] = [];
    const timelinePattern = /(?:first|then|after|before|when|if|during|on|at|in).*?(?:i\s+|they\s+|we\s+)(?:was|were|had|did|received|sent|told|refused).*?(?:\.|,|;|$)/gi;

    let timelineMatch;
    let count = 0;
    while ((timelineMatch = timelinePattern.exec(text)) !== null && count < 5) {
      const event = timelineMatch[0].trim().slice(0, 70);
      if (event.length > 10) {
        timeline.push(event);
        count++;
      }
    }

    return timeline;
  }
}

/**
 * Searches for background case intelligence silently
 */
export class BackgroundCaseIntelligence {
  private searchTool: SearchTool;

  constructor(searchTool: SearchTool) {
    this.searchTool = searchTool;
  }

  async findRelevantCaseIntelligence(context: CaseContext): Promise<string> {
    try {
      // Build targeted search query
      const searchQuery = this.buildIntelligenceQuery(context);

      // Silent background search
      const payload = JSON.stringify({ query: searchQuery, mode: 'case_specific' });
      const result = await this.searchTool._call(payload);

      if (!result) return '';

      try {
        const parsed = JSON.parse(result);
        return parsed.packet || '';
      } catch {
        return '';
      }
    } catch (error) {
      // Silently fail - background operation
      return '';
    }
  }

  private buildIntelligenceQuery(context: CaseContext): string {
    const area = context.legalAreas[0] || 'civil dispute';
    const issues = context.keyIssues.slice(0, 2).join(', ');
    const stage = context.stage === 'at_court' ? 'court proceedings' : 'dispute resolution';

    const queries = [
      `${area} precedent court ruling ${issues}`,
      `how courts handle ${context.keyIssues[0]} ${area}`,
      `${area} case law principles ${stage}`,
      `common outcomes ${area} similar situation`,
    ];

    return queries.join(' | ').slice(0, 400);
  }
}

/**
 * Extracts actionable principles from case law to guide user
 */
export class PrincipleExtractor {
  extractPrinciples(casePacket: string, context: CaseContext): CaseIntelligence {
    const lowerPacket = (casePacket || '').toLowerCase();

    return {
      principles: this.extractPrinciples_(lowerPacket, context),
      keyFactorsMattering: this.extractKeyFactors(lowerPacket, context),
      commonOutcomes: this.extractOutcomes(lowerPacket, context),
      riskFactors: this.extractRisks(lowerPacket),
      strengthFactors: this.extractStrengths(lowerPacket),
    };
  }

  private extractPrinciples_(packet: string, context: CaseContext): string[] {
    const principles: string[] = [];

    const principlePatterns = [
      /burden of proof|claimant must prove|defendant must show|established that/gi,
      /key issue|central question|determining factor|must consider/gi,
      /principle|established law|common law|statutory/gi,
    ];

    for (const pattern of principlePatterns) {
      const matches = packet.match(pattern);
      if (matches) {
        principles.push(`Courts consider: ${matches[0].toLowerCase()}`);
      }
    }

    return Array.from(new Set(principles)).slice(0, 3);
  }

  private extractKeyFactors(packet: string, context: CaseContext): string[] {
    const factors: string[] = [];

    const factorPatterns: Array<[RegExp, string]> = [
      [/evidence|documentation|record|proof/i, 'Strong evidence/documentation'],
      [/timeline|contemporaneous|dated|sequence/i, 'Clear timeline of events'],
      [/communication|written|email|letter|notice/i, 'Written communication trail'],
      [/witness|testimony|statement|account/i, 'Witness corroboration'],
      [/contract|agreement|terms|conditions/i, 'Clear contractual terms'],
    ];

    for (const [pattern, factor] of factorPatterns) {
      if (pattern.test(packet) && !factors.includes(factor)) {
        factors.push(factor);
      }
    }

    return factors.slice(0, 4);
  }

  private extractOutcomes(packet: string, context: CaseContext): string[] {
    const outcomes: string[] = [];

    const outcomePatterns: Array<[RegExp, string]> = [
      [/damages|compensation|award/i, 'Compensation awarded'],
      [/claim dismissed|unsuccessful|failed/i, 'Claim unsuccessful'],
      [/succeeded|upheld|granted|allowed/i, 'Claim succeeded'],
      [/partial|settlement|agreed/i, 'Partial settlement'],
      [/appeal|overturned|reversed/i, 'Appeal considerations'],
    ];

    for (const [pattern, outcome] of outcomePatterns) {
      if (pattern.test(packet) && !outcomes.includes(outcome)) {
        outcomes.push(outcome);
      }
    }

    return outcomes.slice(0, 3);
  }

  private extractRisks(packet: string): string[] {
    const risks: string[] = [];

    const riskPatterns: Array<[RegExp, string]> = [
      [/burden|prove|demonstrate|evidence/i, 'Need strong evidence'],
      [/delay|time limit|limitation|missed|expired/i, 'Time sensitivity'],
      [/credibility|reliability|consistency/i, 'Credibility matters'],
      [/procedure|rules|technicality|process/i, 'Procedural compliance'],
      [/cost|expense|fee|budget/i, 'Cost implications'],
    ];

    for (const [pattern, risk] of riskPatterns) {
      if (pattern.test(packet) && !risks.includes(risk)) {
        risks.push(risk);
      }
    }

    return risks.slice(0, 3);
  }

  private extractStrengths(packet: string): string[] {
    const strengths: string[] = [];

    const strengthPatterns: Array<[RegExp, string]> = [
      [/clear|obvious|straightforward|established/i, 'Clear legal principle'],
      [/well.documented|evidence|proof|record/i, 'Good documentation'],
      [/breach|violation|clear failure/i, 'Other party breach'],
      [/precedent|similar cases|consistent/i, 'Consistent precedent'],
      [/liability|fault|responsible/i, 'Clear liability'],
    ];

    for (const [pattern, strength] of strengthPatterns) {
      if (pattern.test(packet) && !strengths.includes(strength)) {
        strengths.push(strength);
      }
    }

    return strengths.slice(0, 3);
  }
}

/**
 * Formats extracted intelligence into natural language guidance context
 */
export function formatIntelligenceContext(intelligence: CaseIntelligence): string {
  if (
    !intelligence.principles.length &&
    !intelligence.keyFactorsMattering.length &&
    !intelligence.commonOutcomes.length
  ) {
    return '';
  }

  const sections: string[] = [];

  if (intelligence.principles.length) {
    sections.push(`\nLegal Framework: ${intelligence.principles.join('. ')}`);
  }

  if (intelligence.keyFactorsMattering.length) {
    sections.push(`Key Considerations: ${intelligence.keyFactorsMattering.join(', ')}`);
  }

  if (intelligence.strengthFactors.length) {
    sections.push(`Strengths to Highlight: ${intelligence.strengthFactors.join(', ')}`);
  }

  if (intelligence.riskFactors.length) {
    sections.push(`Areas to Address: ${intelligence.riskFactors.join(', ')}`);
  }

  if (intelligence.commonOutcomes.length) {
    sections.push(`Likely Outcomes: ${intelligence.commonOutcomes.join(', ')}`);
  }

  return sections.join('\n');
}
