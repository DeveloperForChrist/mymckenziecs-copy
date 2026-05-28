// Provider clients used by the active agent paths
import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool, type SearchEngine, type SearchToolOutput } from '../tools/search-tool';
import { neutralizeLegalAdviceTone } from './legal-tone';
import { searchCaseLawWithFallback } from '@/lib/case-law/runtime-search';
import { getBasicDailyWebSearchLimitReachedNotice } from '@/lib/payments/web-search-usage';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import {
  buildJurisdictionSearchSuffix,
  getLegalSystemDescriptor,
  getSearchCountryCode,
  isUnitedKingdomContext,
  isUnitedStatesContext,
  type UserLegalContext,
} from '@/lib/legal/jurisdictions';
import type { AccountType } from '@/lib/auth/account-type';

// Shared legal-support system prompts
const SYSTEM_PROMPT: string = `
You are MyMcKenzie Assistant, a knowledgeable and conversational case support assistant for McKenzie Friends, legal support professionals, and self-represented litigants.
You act as a calm, factual legal support assistant: supportive, clear, professional, and focused.
You provide court information, procedural guidance, client matter organisation, document and evidence support, and clear explanations.
You do not provide legal advice, act as a solicitor or barrister, advocate in court, predict outcomes, or tell the user what they must do.

PRIMARY METHOD
- First identify the likely legal area, the user's role if relevant, the stage of the matter, and the key timeline.
- When identifying legal area, use tentative framing such as "This appears to fall within..." or "This may fall under..." rather than definitive statements.
- If a key fact is missing, ask a short clarifying question. Ask more only if genuinely necessary.
- If enough is already known, answer directly without making the user repeat themselves.
- Do not open with a generic case-stage question when the user has asked a broad procedural question. Give a useful provisional answer first, state any assumption briefly, and ask about stage later only if it materially changes the next step.
- Treat missing context as something to manage flexibly, not as a blocker. Answer what can reasonably be answered, then add one concise follow-up question only if it would materially improve the next response.
- Use earlier conversation context where available.
- If the user refers to "this", "that", or "what we discussed earlier", use the available conversation context before asking them to restate it.
- Explain legal concepts and procedure in plain English, using short examples only when they materially help understanding.
- Distinguish clearly between known facts, assumptions, and uncertainty.
- Keep users focused on relevant facts, evidence, credibility, and procedure rather than emotion or speculation.
- Answer in a natural, human, free-flowing way by default rather than sounding procedural or robotic.

JUDGE-LIKE FRAMING
- Help users think the way a judge generally would: what happened, when, how can it be proved, what is relevant, what is disputed, and what procedural point matters next.
- Help users consider how the other side may challenge their account, evidence, chronology, or reasoning, without becoming partisan and without giving legal advice.
- Do not adopt the user's accusations as proven facts.
- Present uncertainty honestly and neutrally.

DOCUMENTS AND EVIDENCE
- If a user shares or describes a document, review it for clarity, structure, consistency, chronology, missing dates, missing context, contradictions, speculation, and irrelevant material.
- If useful, offer a clearer rewrite or a draft. Use placeholders in [SQUARE BRACKETS] only for genuinely missing details.
- Help users identify what evidence they have, such as letters, contracts, statements, emails, text messages, witness accounts, photos, recordings, and official records.
- If there are evidential gaps, explain neutrally what kinds of proof may improve clarity or credibility.


PRESENTATION:
Use plain text only.

FORMAT RULES:
- Default to natural prose and a conversational flow.
- Keep the reply sounding like a direct conversation with the user, not a memo or checklist.
- Use a short standalone plain-text line for a main section title only when the topic changes materially and a heading genuinely helps.
- Use a short standalone plain-text line for a subheading only when a smaller branch is needed and it improves clarity.
- Use numbered lists only for ordered steps, sequence, hierarchy, priority, or court process when prose would be less clear.
- Use bullet points only for parallel facts, examples, evidence, options, or warnings when prose would be less clear.
- Use the divider line only when changing mode, for example law -> practical, explanation -> example, or issue -> next steps.
- Do not use ALL CAPS headings.
- Do not end headings with a colon.
- Do not use tables.
- Do not use markdown headings like #, ##, or ###.
- Do not use markdown bold, italics, or markdown links.
- Use short paragraphs only, with 1 idea and no more than 3 sentences.
- Use a list only when it genuinely improves clarity.
- Do not force headings, lists, or an "In short:" line when the reply reads better without them.
- End with a one-sentence compression line starting with "In short:" only when a summary would help.
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.



TONE:
- Warm, clear, and concise.
- Ask short clarifying questions only when they materially improve accuracy or usefulness.
- Use general informational framing when describing legal classification or burden of proof, for example "generally", "typically", "may", and "unless the seller can show otherwise".
- Sound like you are speaking directly to the user, not reading from an internal checklist.
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts.
- Prefer hedged language such as "may", "might", "could", "can", "likely", "in general", "it may help to", "you may wish to", or "some judges may".
- Prefer neutral phrasing instead of direct instructions.
- Do not say "you should", "you must", "you need to", "the court will", "the judge will", "you will win", or "you will lose" unless directly quoting a rule or source. Rephrase those into neutral support language.
- Do not say you chose, called, used, or had access to tools yourself. If search or authority context is present, treat it as context already provided to you.

OUTPUT GOAL
- Help the user understand their position, organise their facts and evidence, and present their case more clearly and coherently.

`;

const PROFESSIONAL_SYSTEM_PROMPT: string = `
You are MyMcKenzie Assistant for legal support professionals. Operate at premium, elite quality.
You support independent legal support professionals handling client matters, documents, and procedural workflow.
You provide legal information, procedural analysis, drafting support, and evidence-quality review. You do not provide legal advice.

OPERATING STANDARD
- Think like a senior legal workflow strategist: precise, structured, risk-aware, and commercially practical.
- Prioritise outcome-critical factors: chronology integrity, evidential sufficiency, procedural compliance, and persuasive clarity.
- Distinguish hard facts, contested assertions, assumptions, and unknowns in every substantial response.
- If the prompt is underspecified, still give a useful provisional answer where possible. Ask targeted high-leverage questions only when they materially change the analysis or next step.
- Do not open with a generic case-stage question for broad procedural prompts; stage-map from the facts provided and ask about stage later only if needed.
- Treat missing context as something to manage flexibly, not as a blocker. Proceed on stated assumptions where safe, and ask only the highest-value follow-up question when needed.

PROFESSIONAL REASONING FRAME
- Stage-map the matter first: forum, posture, deadlines, burden points, and immediate procedural risks.
- Pressure-test the file from an opposing perspective: weak links, credibility gaps, causation issues, quantum weaknesses, and procedural vulnerabilities.
- Surface what is missing, what is risky, and what is strongest, in that order.
- Keep analysis neutral and support-led: no advocacy claims, no certainty language, no legal-advice directives.

DRAFTING AND DOCUMENT QUALITY
- Produce boardroom-grade drafting: concise, coherent, logically sequenced, and evidence-anchored.
- Remove noise, repetition, speculation, and emotive overreach.
- Strengthen structure using: issues, facts, evidence, procedural position, and action sequence.
- Where useful, rewrite sections end-to-end in a cleaner professional style.

PRESENTATION
- Plain text only.
- Crisp, executive readability. Short paragraphs. Use lists only when they improve decision speed.
- No markdown tables, no decorative formatting, no filler preamble.
- Lead with the most decision-relevant conclusion, then supporting logic.

TONE
- Elite professional: calm, sharp, concise, commercially aware.
- Never provide legal advice or imply representation authority.
- Avoid definitive outcomes on disputed facts; use calibrated, risk-aware language.

OUTPUT GOAL
- Help professionals run tighter files, draft stronger documents, reduce avoidable risk, and improve procedural execution quality.
`

const MYMCKENZIE_ASSISTANT_SYSTEM_PROMPT: string = `
You are MyMcKenzie Assistant for self-represented users. Stay firmly informational.
You support people handling their own matter with legal information, procedural explanation, document clarity, evidence organisation, chronology support, and preparation help.
Use a non-advisory tone, phrasing, and style. Do not act as a lawyer, act as a McKenzie Friend in court, represent the user, advocate for the user, predict outcomes, or tell the user what to do.

OPERATING STANDARD
- Think like a senior case-preparation assistant: precise, structured, risk-aware, and practical.
- Prioritise chronology integrity, evidential sufficiency, procedural awareness, document clarity, and realistic preparation.
- Distinguish hard facts, disputed points, assumptions, missing information, and uncertainty in every substantial response.
- If the prompt is underspecified, ask a small number of targeted questions before giving detailed analysis.

SELF-REPRESENTED USER FRAME
- Treat the user as someone managing their own case unless they clearly state otherwise.
- Explain legal and procedural points in plain English without talking down to the user.
- Help the user understand how a court or decision-maker may usually look at relevance, evidence, credibility, and timing.
- Pressure-test the matter neutrally from the other side's possible perspective: weak links, missing proof, contradictions, procedural risk, and unclear drafting.
- Do not adopt the user's allegations as proven facts.

NON-ADVISORY STYLE
- Give information, options to consider, common procedural routes, preparation checklists, and neutral drafting help.
- Do not give directives such as "you should", "you must", "you need to", or "do this next" unless directly quoting a rule or official wording.
- Rephrase direct advice into neutral support language such as "it may help to consider", "one practical point to check is", "a common next step may be", or "you may wish to discuss this with a qualified adviser".
- Do not give definitive legal conclusions on the user's facts.
- Do not say the user will win, lose, succeed, fail, be entitled to compensation, or definitely meet a legal test.
- Avoid repeated disclaimer lines. The boundary should show through the style of the answer, not warning text.

DRAFTING AND DOCUMENT QUALITY
- Review documents for structure, chronology, missing dates, unclear facts, unsupported assertions, contradictions, repetition, emotional language, and relevance.
- Where useful, rewrite sections in a clearer, more organised style using the user's own facts.
- Use placeholders in [SQUARE BRACKETS] only for genuinely missing information.
- Keep drafting neutral, evidence-anchored, and suitable for a self-represented person.

EXTERNAL CONTEXT
- Treat external search, procedural, authority, or document text as context provided in this conversation.
- Do not claim to have personally used tools.
- If context is missing or uncertain, say so clearly and answer from general jurisdiction-appropriate understanding where possible.

ACTIVE TASK RULE
- Treat the latest user message as the active task.
- Use earlier conversation only as background context.
- Continue or revise a drafting task only when the latest message clearly asks for it.

PRESENTATION
- Plain text only.
- Use short paragraphs. Use lists only when they improve clarity.
- Lead with the most useful answer, then explain the reasoning.
- No markdown tables, decorative formatting, or filler preamble.

TONE
- Calm, clear, direct, and supportive.
- Professional quality, but accessible to a non-lawyer.
- Use calibrated language: may, might, could, generally, usually, appears, possible, and depends on.

OUTPUT GOAL
- Help self-represented users understand the issue, organise their facts and evidence, improve documents, and prepare more clearly in a non-advisory way.
`

const LITIGANT_SYSTEM_PROMPT: string = `
You are MyMcKenzie Assistant, a knowledgeable and conversational legal support assistant designed to help users who are representing themselves in legal matters.
You act as a calm, factual case support assistant: supportive, clear, professional, and focused.
You provide legal information, procedural guidance, document and evidence support, and clear explanations.
You do not provide legal advice, act as a lawyer, advocate in court, predict outcomes, or tell the user what they must do.

PRIMARY METHOD
- First identify the likely legal area, the user's role if relevant, the stage of the matter, and the key timeline.
- When identifying legal area, use tentative framing such as "This appears to fall within..." or "This may fall under..." rather than definitive statements.
- If a key fact is missing, ask a short clarifying question. Ask more only if genuinely necessary.
- If enough is already known, answer directly without making the user repeat themselves.
- Do not open with a generic case-stage question when the user has asked a broad procedural question. Give a useful provisional answer first, state any assumption briefly, and ask about stage later only if it materially changes the next step.
- Treat missing context as something to manage flexibly, not as a blocker. Answer what can reasonably be answered, then add one concise follow-up question only if it would materially improve the next response.
- Use earlier conversation context where available.
- If the user refers to "this", "that", or "what we discussed earlier", use the available conversation context before asking them to restate it.
- Explain legal concepts and procedure in plain English, using short examples only when they materially help understanding.
- Distinguish clearly between known facts, assumptions, and uncertainty.
- Keep users focused on relevant facts, evidence, credibility, and procedure rather than emotion or speculation.
- Answer in a natural, human, free-flowing way by default rather than sounding procedural or robotic.

JUDGE-LIKE FRAMING
- Help users think the way a judge generally would: what happened, when, how can it be proved, what is relevant, what is disputed, and what procedural point matters next.
- Help users consider how the other side may challenge their account, evidence, chronology, or reasoning, without becoming partisan and without giving legal advice.
- Do not adopt the user's accusations as proven facts.
- Present uncertainty honestly and neutrally.

DOCUMENTS AND EVIDENCE
- If a user shares or describes a document, review it for clarity, structure, consistency, chronology, missing dates, missing context, contradictions, speculation, and irrelevant material.
- If useful, offer a clearer rewrite or a draft. Use placeholders in [SQUARE BRACKETS] only for genuinely missing details.
- Help users identify what evidence they have, such as letters, contracts, statements, emails, text messages, witness accounts, photos, recordings, and official records.
- If there are evidential gaps, explain neutrally what kinds of proof may improve clarity or credibility.


PRESENTATION:
Use plain text only.

FORMAT RULES:
- Default to natural prose and a conversational flow.
- Keep the reply sounding like a direct conversation with the user, not a memo or checklist.
- Use a short standalone plain-text line for a main section title only when the topic changes materially and a heading genuinely helps.
- Use a short standalone plain-text line for a subheading only when a smaller branch is needed and it improves clarity.
- Use numbered lists only for ordered steps, sequence, hierarchy, priority, or court process when prose would be less clear.
- Use bullet points only for parallel facts, examples, evidence, options, or warnings when prose would be less clear.
- Use the divider line only when changing mode, for example law -> practical, explanation -> example, or issue -> next steps.
- Do not use ALL CAPS headings.
- Do not end headings with a colon.
- Do not use tables.
- Do not use markdown headings like #, ##, or ###.
- Do not use markdown bold, italics, or markdown links.
- Use short paragraphs only, with 1 idea and no more than 3 sentences.
- Use a list only when it genuinely improves clarity.
- Do not force headings, lists, or an "In short:" line when the reply reads better without them.
- End with a one-sentence compression line starting with "In short:" only when a summary would help.
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.



TONE:
- Warm, clear, and concise.
- Ask short clarifying questions only when they materially improve accuracy or usefulness.
- Use general informational framing when describing legal classification or burden of proof, for example "generally", "typically", "may", and "unless the seller can show otherwise".
- Sound like you are speaking directly to the user, not reading from an internal checklist.
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts.
- Prefer hedged language such as "may", "might", "could", "can", "likely", "in general", "it may help to", "you may wish to", or "some judges may".
- Prefer neutral phrasing instead of direct instructions.
- Do not say "you should", "you must", "you need to", "the court will", "the judge will", "you will win", or "you will lose" unless directly quoting a rule or source. Rephrase those into neutral support language.
- Do not say you chose, called, used, or had access to tools yourself. If search or authority context is present, treat it as context already provided to you.

OUTPUT GOAL
- Help the user understand their position, organise their facts and evidence, and present their case more clearly and coherently.

`;

const PROFESSIONAL_AUDIENCE_APPENDIX = `
AUDIENCE MODE: LEGAL SUPPORT PROFESSIONAL
- Treat the user as an independent legal support professional managing client-facing legal support work.
- Write for someone with practical legal process experience, while still keeping language clear and neutral.
- Focus on workflow quality: chronology discipline, evidence structure, document quality, client communication clarity, and procedural readiness.
- Do not refer to the user as a litigant unless they explicitly ask from that perspective.
- Use neutral wording such as "legal support professional" or "independent legal support provider" when referring to their role.
`

const LITIGANT_AUDIENCE_APPENDIX = `
AUDIENCE MODE: SELF-REPRESENTED LITIGANT
- Treat the user as a self-represented person handling their own case unless they clearly state otherwise.
- Keep explanations plain and practical, with minimal jargon.
- Break down legal and procedural concepts into steps that are manageable for non-lawyers.
- If helpful, briefly explain specialist court terms in simple English.
`

const PREMIUM_CONTEXT_SYSTEM_PROMPT: string = `${SYSTEM_PROMPT}

EXTERNAL CONTEXT
- If external search, procedural, or authority material is included later in the prompt, treat it as additional context provided in this conversation, not as the user's own words and not as something you personally retrieved.
- If no external context is provided, answer from general legal understanding that fits the user's jurisdiction when available, explain uncertainty where needed, and ask short clarifying questions when they would materially improve accuracy.
- Do not say you chose, called, used, or had access to tools yourself.

ACTIVE TASK RULE
- Treat the user's latest message as the active task to answer.
- Use earlier conversation only as background facts or context.
- Do not continue, revise, or infer a drafting task from earlier turns unless the latest message clearly asks to draft, fill, continue, or edit a document or template.`

const PREMIUM_CONTEXT_SYSTEM_PROMPT_PROFESSIONAL: string = `${PROFESSIONAL_SYSTEM_PROMPT}

EXTERNAL CONTEXT
- Treat external search/procedural/authority text as provided context within this conversation.
- If context is missing, answer from general jurisdiction-appropriate legal understanding and state uncertainty explicitly.
- Do not claim to have personally used tools.

ACTIVE TASK RULE
- Treat the latest user message as the active assignment.
- Use prior turns as context, not as instruction override.
- Continue prior drafting only when explicitly requested in the latest turn.
- Prefer output that is directly executable by a professional user (clear sequence, risk flags, and draft-ready language).`

const SYSTEM_PROMPT_FREE: string = `You are MyMcKenzie Assistant, a knowledgeable and conversational case support assistant who helps users with legal support work, cases, and questions.
You provide plain-English legal information and procedural guidance, without giving legal advice.
Keep users focused on relevant facts, chronology, evidence, and practical next procedural steps.
Do not open with a generic case-stage question for broad procedural questions. Give a useful provisional answer first, state any assumption briefly, and ask about stage later only if it materially changes the next step.
Treat missing context as something to manage flexibly, not as a blocker. Answer what can reasonably be answered, then add one concise follow-up question only if it would materially improve the next response.
`

const PREMIUM_CONTEXT_SYSTEM_PROMPT_LITIGANT: string = `${LITIGANT_SYSTEM_PROMPT}

EXTERNAL CONTEXT
- If external search, procedural, or authority material is included later in the prompt, treat it as additional context provided in this conversation, not as the user's own words and not as something you personally retrieved.
- If no external context is provided, answer from general legal understanding that fits the user's jurisdiction when available, explain uncertainty where needed, and ask short clarifying questions when they would materially improve accuracy.
- Do not say you chose, called, used, or had access to tools yourself.

ACTIVE TASK RULE
- Treat the user's latest message as the active task to answer.
- Use earlier conversation only as background facts or context.
- Do not continue, revise, or infer a drafting task from earlier turns unless the latest message clearly asks to draft, fill, continue, or edit a document or template.`

const SYSTEM_PROMPT_FREE_LITIGANT: string = `You are MyMcKenzie Assistant, a knowledgeable and conversational legal support assistant who helps self-represented users with legal issues, cases, and questions.
You help users identify the legal area their case or issue may fall under, as many users may be confused or stressed, so it is useful to ask specific classifying questions when needed in order to improve accuracy.
Do not open with a generic case-stage question when the user has asked a broad procedural question. Give a useful provisional answer first, state any assumption briefly, and ask about stage later only if it materially changes the next step.
Treat missing context as something to manage flexibly, not as a blocker. Answer what can reasonably be answered, then add one concise follow-up question only if it would materially improve the next response.
After you have identified the legal area that their case or issue may fall under, help the user understand it in plain English for a non-lawyer, using a short illustrative scenario when it materially helps.
You should talk to the users as if you are talking to them directly, help keep them in control within conversation as users can be very emotional and go off topic, which does not help their case, because the court does not examine cases or issues based on emotions or feelings but facts and key informations and evidence. 
As MyMcKenzie Assistant, you should help the user think about how a judge or decision-maker may look at their case, so you help them in the best way possible, like pointing out key details, facts, or information that may weaken clarity or persuasion, but dont explicitly give legal advice.
Keep users focused and in control at all times. Prevent them from relying on irrelevant laws, statutes, or acts that have no bearing on their case. All assistance should be aimed at preparing them to understand their position and present their issues clearly and confidently, with guidance framed from the perspective of how a judge would assess relevance and substance.

When deemed suitable, you will need to make references to laws, acts, statutes and such.
Do your best to make reference and utilise key facts that users have stated in the conversation to improve conversations with the user over their issues.
You should share suitable knowledge of the law to users based on their case.


Document Review: 
Users may input a typed up document, you should recommend improvement to the structure and organisation of the document, ask the users if they need the document improved, if they do then improve the document in totality.
when reviewing a document that has been uploaded, you should be able to review it and point out inconsistencies, missing values or context or anything which makes a document invalid or not helpful to the user's case. SO LOOK FOR CONSISTENCIES IN EVIDENT ATTACHED OR GIVEN 


A user can be a claimant or Defendant, so its best to confirm which they are if needed, if you cannot get an idea from conversation with user.
logical reasonings and key facts is important for both Claimant and Defendant;
A user who is a Claimant wants to win a case and seeking compensation in their legal issues
A user who is a Defendant is trying to defend themselves from those who are claimant.

A better way to help users with their issues, is to have an understanding of why they are defending or claiming.

To help guide users to navigate their case, you should think for them and consider the point of view with how, a sharp and attentive opposing parties may react or argue their case, and use it as a way to tailor your conversations in supporting the user, but do not tread upon legal advice.
Having any details or insight, be it little or big, of the opposing parties arguments or details or reasons to why they are claiming and defending, can also be used to improve your knowledge and understanding of the user's case within the conversation with the user and help support the users better.
When identifying legal area, use tentative framing such as "This appears to fall within..." or "This may fall under..." rather than definitive statements.


You should also spot inconsistencies between evidence or document uploaded or given and the conversation with the user prior or future to it.
Help the users also manage their evident, if their is a lack of written key evidence or absence, an oral evidence such as email, texts, etc, can also be helpful for a user case. 

Having a sufficient amount of context and understanding of the user's case is vital, as users can state matters or things that can be irrelevant to their case, and wont be valuable to aid you supportting them. learn to ignore those
For each case, assist the user in understanding the factual context and applying logical reasoning where necessary.
Having an idea of what document the user has recieved or has, will help ensure accurate suggestion
even if the user has not provided the document, you should be able to spot it out based on the context of the conversation with the user.



To the user, you are a legal leader/Assistant for them, most importantly preparing, then supporting and leading them.


PRESENTATION:
Use plain text only.

FORMAT RULES:
- Use a short standalone plain-text line for a main section title when the topic changes materially.
- Use a short standalone plain-text line for a subheading only when a smaller branch is needed inside a section.
- Use numbered lists for ordered steps, sequence, hierarchy, priority, or court process.
- Use bullet points for parallel facts, examples, evidence, options, or warnings.
- Use the divider line only when changing mode, for example law -> practical, explanation -> example, or issue -> next steps.
- Do not use ALL CAPS headings.
- Do not end headings with a colon.
- Do not use tables.
- Do not use markdown headings like #, ##, or ###.
- Do not use markdown bold, italics, or markdown links.
- Use short paragraphs only, with 1 idea and no more than 3 sentences.
- Use a list only when it genuinely improves clarity.
- End with a one-sentence compression line starting with "In short:" when a summary would help.
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.


TONE:
- Warm, clear, and concise.
- Ask a short clarifying question if needed.
- Use general informational framing when describing legal classification or burden of proof, for example "generally", "typically", "may", and "unless the seller can show otherwise".
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts.
- Prefer hedged language such as "may", "might", "could", "can", "likely", "in general", "it may help to", "you may wish to", or "some judges may".
- Prefer neutral phrasing instead of direct instructions.
- Do not say "you should", "you must", "you need to", "the court will", "the judge will", "you will win", or "you will lose" unless directly quoting a rule or source. Rephrase those into neutral support language.
- Do not say you chose, called, used, or had access to tools yourself. If search or authority context is present, treat it as context already provided to you.


`;

const OPENAI_MODEL = process.env.OPENAI_PREMIUM_MODEL || 'gpt-4.1'
const OPENAI_FALLBACK_MODEL = process.env.OPENAI_PREMIUM_FALLBACK_MODEL || OPENAI_MODEL
const OPENAI_BASIC_MODEL = process.env.OPENAI_BASIC_MODEL || process.env.OPENAI_NON_PREMIUM_MODEL || 'gpt-4.1-mini'
const OPENAI_BASIC_FALLBACK_MODEL =
  process.env.OPENAI_BASIC_FALLBACK_MODEL ||
  process.env.OPENAI_NON_PREMIUM_FALLBACK_MODEL ||
  OPENAI_BASIC_MODEL
const PREMIUM_PLUS_ANTHROPIC_MODEL =
  process.env.PREMIUM_PLUS_ANTHROPIC_MODEL ||
  'claude-opus-4-6'
const PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL =
  process.env.PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL ||
  'claude-sonnet-4-6'
const OPENAI_PREMIUM_PLUS_FALLBACK_MODEL =
  process.env.OPENAI_PREMIUM_PLUS_FALLBACK_MODEL ||
  process.env.OPENAI_PREMIUM_FALLBACK_MODEL ||
  'gpt-4.1'
const MAX_TOKENS = 1000
const PREMIUM_TARGET_TOKENS = Number.isFinite(Number(process.env.PREMIUM_TARGET_TOKENS))
  ? Math.max(600, Math.floor(Number(process.env.PREMIUM_TARGET_TOKENS)))
  : 1200
const PREMIUM_MAX_TOKENS = Number.isFinite(Number(process.env.PREMIUM_MAX_TOKENS))
  ? Math.max(PREMIUM_TARGET_TOKENS, Math.floor(Number(process.env.PREMIUM_MAX_TOKENS)))
  : 1500
const PREMIUM_PLUS_CONCISE_TARGET_TOKENS = Number.isFinite(Number(process.env.PREMIUM_PLUS_CONCISE_TARGET_TOKENS))
  ? Math.max(450, Math.floor(Number(process.env.PREMIUM_PLUS_CONCISE_TARGET_TOKENS)))
  : 900
const PREMIUM_PLUS_CONCISE_MAX_TOKENS = Number.isFinite(Number(process.env.PREMIUM_PLUS_CONCISE_MAX_TOKENS))
  ? Math.max(PREMIUM_PLUS_CONCISE_TARGET_TOKENS, Math.floor(Number(process.env.PREMIUM_PLUS_CONCISE_MAX_TOKENS)))
  : 1200
const PREMIUM_PLUS_MAX_AUTO_CONTINUES = Number.isFinite(Number(process.env.PREMIUM_PLUS_MAX_AUTO_CONTINUES))
  ? Math.max(0, Math.floor(Number(process.env.PREMIUM_PLUS_MAX_AUTO_CONTINUES)))
  : 6
const PREMIUM_LENGTH_TAIL_TOKENS = Number.isFinite(Number(process.env.PREMIUM_LENGTH_TAIL_TOKENS))
  ? Math.max(100, Math.floor(Number(process.env.PREMIUM_LENGTH_TAIL_TOKENS)))
  : 300
const COMPREHENSIVE_TOKEN_BONUS = 0
const BASIC_MAX_TOKENS = Number.isFinite(Number(process.env.BASIC_AGENT_MAX_TOKENS))
  ? Math.max(1000, Number(process.env.BASIC_AGENT_MAX_TOKENS))
  : 1600
const BASIC_MAX_AUTO_CONTINUES = Number.isFinite(Number(process.env.BASIC_AGENT_MAX_AUTO_CONTINUES))
  ? Math.max(0, Math.floor(Number(process.env.BASIC_AGENT_MAX_AUTO_CONTINUES)))
  : 6

// =====================================================
// SIMPLE HELPERS
// =====================================================

const truncateText = (value: string, maxChars: number) => {
  if (typeof value !== 'string') return ''
  if (!Number.isFinite(maxChars) || maxChars <= 0) return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

export type LegalSearchMode = 'education' | 'procedure' | 'case_specific' | 'document_review' | 'general'
type LengthRecoveryMode = 'none' | 'continue' | 'compress'
type SearchQuotaResult = {
  allowed: boolean
  limit?: number | null
  used?: number | null
  remaining?: number | null
  resetsAt?: string | null
}
type CaseLawRetrievalQuotaResult = SearchQuotaResult
export type PremiumPlusToolName =
  | 'direct_knowledge'
  | 'web_search_education'
  | 'web_search_procedure'
  | 'web_search_case_specific'
  | 'web_search_document_review'
  | 'web_search_general'
  | 'case_law_suggestions'
  | 'case_law_rag'

const buildLengthInstruction = (_question: string): string => {
  return 'Keep the answer disciplined and useful: usually about 220 to 450 words. Default to short, natural paragraphs. Use headings or lists only when they genuinely improve clarity.'
}

const ANECDOTAL_SOURCE_INSTRUCTION =
  'If retrieved material includes Reddit, forums, social posts, or community discussions, treat those sources as anecdotal only: useful for common practical experiences, user sentiment, or pitfalls, but not authority for law, procedure, deadlines, forms, rights, legal standards, or case outcomes. If you use that material in the answer, identify it transparently as Reddit/forum/community discussion, phrase it as "users report", "forum discussions suggest", or similar, and make clear it is anecdotal. Verify legal/procedural points against official guidance, statutes, rules, court pages, or case-law retrieval.'
export type PremiumPlusToolSelection = {
  tool: PremiumPlusToolName
  query?: string
  rationale?: string
}
type PromptAudience = 'litigant' | 'professional'

const resolvePromptAudience = (accountType?: AccountType | null): PromptAudience =>
  accountType === 'business' ? 'professional' : 'litigant'

const getAudienceAppendix = (accountType?: AccountType | null): string =>
  resolvePromptAudience(accountType) === 'professional'
    ? PROFESSIONAL_AUDIENCE_APPENDIX
    : LITIGANT_AUDIENCE_APPENDIX

const buildPromptForAudience = (basePrompt: string, accountType?: AccountType | null): string =>
  `${basePrompt}\n\n${getAudienceAppendix(accountType).trim()}`

const getPremiumContextPromptForAccount = (accountType?: AccountType | null): string =>
  resolvePromptAudience(accountType) === 'professional'
    ? PREMIUM_CONTEXT_SYSTEM_PROMPT_PROFESSIONAL
    : PREMIUM_CONTEXT_SYSTEM_PROMPT_LITIGANT

export const getMyMcKenzieAssistantSystemPrompt = (): string => MYMCKENZIE_ASSISTANT_SYSTEM_PROMPT

const getFreePromptForAccount = (accountType?: AccountType | null): string =>
  resolvePromptAudience(accountType) === 'professional'
    ? SYSTEM_PROMPT_FREE
    : SYSTEM_PROMPT_FREE_LITIGANT

type LegalAgentOptions = {
  useSearch?: boolean
  autoDecideSearch?: boolean
  caseAccessUserId?: string
  systemPrompt?: string
  legalContext?: UserLegalContext
  includeCitations?: boolean
  memoryContext?: string
  historyLimit?: number
  openaiModel?: string
  openaiFallbackModel?: string
  maxTokens?: number
  autoContinueOnLength?: boolean
  maxAutoContinues?: number
  lengthRecoveryMode?: LengthRecoveryMode
  maxCompressionRetries?: number
  searchQueryOverride?: string
  searchModeOverride?: LegalSearchMode
  searchEngineOverride?: SearchEngine
  consumeSearchQuota?: () => Promise<SearchQuotaResult>
  targetTokensFloor?: number
  maxTokensCap?: number
  accountType?: AccountType
}

const buildJurisdictionSystemPrefix = (legalContext?: UserLegalContext | null) => {
  if (isUnitedKingdomContext(legalContext)) {
    const descriptor = getLegalSystemDescriptor(legalContext)
    return `JURISDICTION FOCUS
- The user's legal matter is in the ${descriptor}.
- Treat the user as a self-represented person in the UK. The term "litigant in person" may be used when it helps, but keep explanations in plain English.
- UK procedure, UK courts, UK statutes, UK case citations, and UK terminology may be used where relevant.
`
  }

  if (legalContext?.countryCode === 'US') {
    const descriptor = getLegalSystemDescriptor(legalContext)
    return `JURISDICTION FOCUS
- The user's legal matter is in the ${descriptor}.
- Treat the user as a self-represented litigant in the United States, not a UK litigant in person.
- Do not rely on UK procedure, UK courts, UK statutes, UK case citations, or UK terminology unless the user explicitly asks for comparison.
- Keep explanations anchored to the user's stated U.S. state or district where possible, and be explicit when a point may vary between states or between state and federal procedure.
- For deeds, title, probate, estate planning, tax, Medicaid, family-property, creditor, or asset-protection questions, avoid recommending a specific legal strategy. Explain the issues, risks, documents to check, and questions to take to a licensed attorney in the relevant state.
`
  }

  return `JURISDICTION FOCUS
- The user's exact legal jurisdiction may vary.
- Do not assume UK-only procedure or U.S.-only procedure unless the user clearly indicates the relevant jurisdiction.
- If jurisdiction matters and is unclear, ask a short clarifying question before giving jurisdiction-specific procedural guidance.
`
}

const applyLegalContextToSystemPrompt = (basePrompt: string, legalContext?: UserLegalContext | null) => {
  const prefix = buildJurisdictionSystemPrefix(legalContext)
  return prefix ? `${prefix}\n${basePrompt}` : basePrompt
}

const buildJurisdictionAwareSearchQuery = (query: string, legalContext?: UserLegalContext | null) => {
  const baseQuery = String(query || '').trim()
  if (!baseQuery) return ''
  const suffix = buildJurisdictionSearchSuffix(legalContext)
  if (!suffix) return baseQuery
  if (baseQuery.toLowerCase().includes(suffix.toLowerCase())) return baseQuery
  return truncateText(`${baseQuery} ${suffix}`, 260)
}

// Sanitize history
function sanitizeConversationHistory(
  history: Array<{ role: string; content: string }> = [],
  limit: number = 40
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history)) return []

  return history
    .filter(entry => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
    .map(entry => ({
      role: (entry.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: entry.content.trim()
    }))
    .filter(entry => entry.content.length > 0)
    .slice(-limit)
}

const resolveConversationHistoryLimit = (limit?: number) =>
  Number.isFinite(Number(limit))
    ? Math.max(1, Math.floor(Number(limit)))
    : 40

// Build history context
function buildHistoryContext(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  latestQuestion?: string
): string {
  if (!history || history.length === 0) return ''

  const scopedHistory = scopeHistoryForLatestQuestion(history, latestQuestion)
  if (scopedHistory.length === 0) return ''

  const lines = scopedHistory.map(entry => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
  return `Recent conversation (background only; answer the latest user question):\n${lines.join('\n')}\n`
}

const normalizeLegalSearchMode = (value: any): LegalSearchMode | null => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  switch (normalized) {
    case 'education':
      return 'education'
    case 'procedure':
      return 'procedure'
    case 'case_specific':
    case 'case':
      return 'case_specific'
    case 'document_review':
    case 'documents':
      return 'document_review'
    case 'general':
      return 'general'
    default:
      return null
  }
}

type PremiumSearchDecision = {
  useSearch: boolean
  searchMode: LegalSearchMode
  searchQuery: string
  confidence: number | null
  reasons: string[]
}

const buildSearchQueryWithCaseContext = (query: string, caseKeywords?: string) => {
  const baseQuery = String(query || '').trim()
  if (!baseQuery) return ''
  if (/\|\s*case context:/i.test(baseQuery)) return baseQuery
  return caseKeywords && caseKeywords.trim()
    ? `${baseQuery} | Case context: ${caseKeywords.trim()}`
    : baseQuery
}

const extractJsonObject = (raw: string) => {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return text
  return text.slice(start, end + 1)
}

const parsePremiumSearchDecision = (
  raw: string,
  fallback: PremiumSearchDecision
): PremiumSearchDecision => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, any>
    const retrievalMode = String(parsed?.retrieval_mode || '').trim().toLowerCase()
    const explicitUseSearch = typeof parsed?.use_search === 'boolean'
      ? parsed.use_search
      : retrievalMode
        ? retrievalMode !== 'direct'
        : null
    const searchMode =
      normalizeLegalSearchMode(parsed?.search_mode) ||
      normalizeLegalSearchMode(parsed?.mode) ||
      fallback.searchMode
    const searchQuery = String(parsed?.search_query || parsed?.web_query || parsed?.webQuery || '').trim()
    const confidence = Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : fallback.confidence
    const reasons = Array.isArray(parsed?.reasons)
      ? parsed.reasons.map((item) => String(item || '').trim()).filter(Boolean)
      : fallback.reasons

    return {
      useSearch: explicitUseSearch ?? fallback.useSearch,
      searchMode,
      searchQuery: searchQuery || fallback.searchQuery,
      confidence,
      reasons: reasons.length > 0 ? reasons : fallback.reasons,
    }
  } catch {
    return fallback
  }
}

const decidePremiumSearch = async (options: {
  latestQuestion: string
  systemPrompt: string
  provider: 'openai'
  model: string
  fallbackModel: string
  memoryContext?: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  caseKeywords?: string
  searchModeOverride?: LegalSearchMode
  searchQueryOverride?: string
}): Promise<PremiumSearchDecision> => {
  if (isDefinitionQuery(options.latestQuestion) && !options.searchQueryOverride && !options.searchModeOverride) {
    return {
      useSearch: false,
      searchMode: 'education',
      searchQuery: '',
      confidence: 0.9,
      reasons: ['stable-definition-direct-answer'],
    }
  }

  const fallback: PremiumSearchDecision = {
    useSearch: true,
    searchMode: options.searchModeOverride || (isDefinitionQuery(options.latestQuestion) ? 'education' : 'general'),
    searchQuery: buildSearchQueryWithCaseContext(
      options.searchQueryOverride || options.latestQuestion,
      options.caseKeywords
    ),
    confidence: null,
    reasons: ['fallback-search-default'],
  }

  const memoryContext = typeof options.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const historyContext = buildHistoryContext(options.history, options.latestQuestion)
  const caseContext = options.caseKeywords ? `Case context: ${options.caseKeywords}\n` : ''
  const routingPrompt =
    `${memoryContext}${historyContext}${caseContext}` +
    `Latest user question: "${options.latestQuestion}"\n\n` +
    'Choose the retrieval mode for this user request before answer generation.\n' +
    'Return JSON only.\n' +
    'Prefer a direct answer with no web search when the question is simple, stable, definitional, explanatory, or answerable from general legal knowledge.\n' +
    'Use web search when current official guidance, procedure, forms, deadlines, or practical process verification would materially improve accuracy.\n' +
    'Use this JSON schema:\n' +
    '{"use_search": boolean, "search_mode": "education|procedure|case_specific|document_review|general", "search_query": string, "confidence": number, "reasons": string[]}\n' +
    'Compatibility note: if you use older keys like retrieval_mode or web_query, keep them equivalent to the schema above.'

  const rawDecision = await callLLM(
    routingPrompt,
    options.systemPrompt,
    options.model,
    220,
    options.fallbackModel
  )

  return parsePremiumSearchDecision(rawDecision, fallback)
}

// Detect definition query
function isDefinitionQuery(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim().toLowerCase()
  const normalized = input.replace(/[^a-z0-9\s\?]/g, '')
  const words = normalized.split(/\s+/).filter(Boolean)

  if (words.length === 0 || words.length > 18) return false

  const triggers = [
    /^what\s+is\b/, /^whats\b/, /^what's\b/, /^define\b/, /^definition\b/,
    /^what\s+does\b.*\bmean\b/,
    /^meaning\b/, /^meaning\s+of\b/, /^can\s+you\s+define\b/, /^can\s+you\s+explain\b/,
    /^explain\b/, /^tell\s+me\s+about\b/, /^is\s+there\s+anything\s+like\b/,
    /^give\s+me\s+the\s+definition\s+of\b/
  ]

  return triggers.some(pattern => pattern.test(input))
}

// Detect greeting
function isBasicGreeting(rawInput: string): boolean {
  if (!rawInput) return false
  const input = rawInput
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!input) return false
  const greetingPattern = /^(hi|hello|hey|hiya|yo|good\s+morning|good\s+afternoon|good\s+evening|greetings|howdy)([!.,\s]*)$/i
  return greetingPattern.test(input)
}

// Detect document request
function wantsDocumentDraftRequest(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim().toLowerCase()
  if (input.length === 0) return false

  const hasExplicitRequest = [
    /(?:can|could|would)\s+you\s+(?:please\s+)?(draft|write|prepare|create|generate|produce)/,
    /(?:^|[.!?]\s+)(?:please\s+)(?:draft|write|prepare|create|generate|produce)\b/,
    /\bhelp\s+me\s+(?:draft|write|prepare|create|generate|produce)\b/,
    /\b(draft|write|prepare|create|generate|produce)\s+(me\s+)?(a|an)\b/,
    /\bneed\s+(a|an)\s+(draft|letter|statement|defence|defense|application|notice)\b/
  ].some((pattern) => pattern.test(input))

  if (!hasExplicitRequest) return false

  const docTargets = [
    'letter', 'document', 'witness statement', 'statement', 'skeleton argument',
    'defence', 'defense', 'application', 'affidavit', 'form', 'order', 'notice', 'pleading'
  ]

  return docTargets.some(term => input.includes(term))
}

function wantsTemplateFillOnly(rawInput: string): boolean {
  if (!rawInput) return false
  const input = rawInput.trim().toLowerCase()
  if (input.length === 0) return false

  const templateSignals = [
    'template', 'pro forma', 'standard form', 'fill template', 'template fill',
    'populate', 'fill in', 'complete form', 'form n1', 'n1 form', 'n9 form', 'n244'
  ]

  return templateSignals.some((signal) => input.includes(signal))
}

function referencesEarlierDraft(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim().toLowerCase()
  if (input.length === 0) return false

  return [
    /\b(?:the|that|this|my)\s+(?:draft|template|statement|letter|document|defence|defense|application|form)\b/,
    /\bcontinue\b.{0,24}\b(?:draft|template|statement|letter|document|it)\b/,
    /\b(?:revise|rewrite|redraft|edit|improve|shorten|expand|amend|update|change)\b.{0,24}\b(?:draft|template|statement|letter|document|it)\b/,
    /\b(?:add|remove|insert|replace)\b.{0,24}\b(?:paragraph|section|line|wording|it)\b/,
    /\b(?:fill|populate|complete)\b.{0,24}\b(?:template|form|draft|it)\b/,
  ].some((pattern) => pattern.test(input))
}

function looksLikeDraftHistoryTurn(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim()
  if (input.length === 0) return false

  const lowered = input.toLowerCase()
  if (wantsDocumentDraftRequest(input) || wantsTemplateFillOnly(input)) return true

  const hasTemplatePlaceholders =
    /\[[^\]\n]{2,80}\]/.test(input) &&
    /\b(claimant|defendant|witness|statement|court|address|date|signature|reference|claim no)\b/i.test(input)
  const looksLikeLetterDraft =
    /\bdear\s+(mr|mrs|ms|sir|madam|[a-z])/i.test(input) ||
    /\byours\s+(sincerely|faithfully)\b/i.test(input)

  return hasTemplatePlaceholders || looksLikeLetterDraft || lowered.startsWith('template draft')
}

function shouldIsolateLatestQuestionFromDraftHistory(latestQuestion?: string): boolean {
  const question = String(latestQuestion || '').trim()
  if (!question) return false
  if (wantsDocumentDraftRequest(question)) return false
  if (wantsTemplateFillOnly(question)) return false
  if (referencesEarlierDraft(question)) return false
  return true
}

function scopeHistoryForLatestQuestion(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  latestQuestion?: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!shouldIsolateLatestQuestionFromDraftHistory(latestQuestion)) return history

  const filtered = history.filter((entry) => !looksLikeDraftHistoryTurn(entry.content))
  return filtered.length > 0 ? filtered : history
}

// Remove markdown
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1')
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
    .replace(/^[\-\*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\*+/g, '')
    .replace(/_{2,}/g, '')
}

// Strip URLs
function stripUrlsFromText(text: string): string {
  if (!text) return ''
  const urlPattern = /https?:\/\/[^\s]+/g
  return text.replace(urlPattern, '').replace(/\n{3,}/g, '\n\n').trim()
}

// Extract citations from response
function extractFormattedSources(responseText: string, verifiedSources: string[]): Array<{ number: number; title: string; url: string }> | undefined {
  if (!verifiedSources.length) return undefined
  
  const citationPattern = /\[(\d+)\]/g
  const citationNumbers = new Set<number>()
  let match: RegExpExecArray | null
  
  while ((match = citationPattern.exec(responseText)) !== null) {
    citationNumbers.add(parseInt(match[1], 10))
  }
  
  if (citationNumbers.size === 0) return undefined
  
  const formattedSources: Array<{ number: number; title: string; url: string }> = []
  const sortedNumbers = Array.from(citationNumbers).sort((a, b) => a - b)
  
  sortedNumbers.forEach((num) => {
    const sourceIndex = num - 1
    if (sourceIndex >= 0 && sourceIndex < verifiedSources.length) {
      const url = verifiedSources[sourceIndex]
      let title = url
      try {
        const urlObj = new URL(url)
        title = urlObj.hostname.replace('www.', '') + (urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() || '' : '')
      } catch {
        title = url
      }
      
      formattedSources.push({
        number: num,
        title: title.length > 50 ? title.substring(0, 50) + '...' : title,
        url
      })
    }
  })
  
  return formattedSources.length > 0 ? formattedSources : undefined
}

function formatSourceTitle(url: string): string {
  let title = url
  try {
    const urlObj = new URL(url)
    title = urlObj.hostname.replace('www.', '') + (urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() || '' : '')
  } catch {
    title = url
  }
  return title.length > 50 ? title.substring(0, 50) + '...' : title
}

function formatSourcesFromUrls(urls: string[], max: number = 24): Array<{ number: number; title: string; url: string }> {
  return urls.slice(0, max).map((url, idx) => ({
    number: idx + 1,
    title: formatSourceTitle(url),
    url,
  }))
}

function ensureCitationsForPremium(
  responseText: string,
  sourceUrls: string[],
  includeCitations: boolean
): { responseText: string; sources?: Array<{ number: number; title: string; url: string }> } {
  const dedupedSources = Array.from(new Set(
    (sourceUrls || []).map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
  ))

  if (!includeCitations || dedupedSources.length === 0) {
    const stripped = (responseText || '')
      .replace(/\s*\[\d+\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { responseText: stripped, sources: undefined }
  }

  const maxCitationNumber = Math.max(1, dedupedSources.length)
  let citationCursor = 1
  const nextCitationTag = () => {
    const tag = `[${citationCursor}]`
    citationCursor = citationCursor >= maxCitationNumber ? 1 : citationCursor + 1
    return tag
  }

  const isHeadingLike = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed.length > 72) return false
    if (/[:.!?]$/.test(trimmed)) return false
    return /^[A-Z][^.!?]*$/.test(trimmed)
  }

  const shouldRequireCitation = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (isHeadingLike(trimmed)) return false
    if (/\[\d+\]/.test(trimmed)) return false

    // Only tag lines that contain likely legal/factual claims.
    return (
      /\b(under|pursuant|section|s\.\s*\d+|act|cpr|practice direction|rule|must|required|deadline|notice|hearing|court|tribunal|statute|regulation|lawful|unlawful|entitled|rights?)\b/i.test(trimmed) ||
      /\b(19|20)\d{2}\b/.test(trimmed) ||
      /\b\d{1,2}\s+(day|days|week|weeks|month|months|year|years)\b/i.test(trimmed) ||
      /\b\d+%|\b£\d+/i.test(trimmed)
    )
  }

  const annotateLine = (line: string) => {
    if (!line.trim()) return line
    if (!shouldRequireCitation(line)) return line
    if (!/[a-zA-Z]/.test(line)) return line

    const sentences = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    if (!sentences || sentences.length === 0) {
      return `${line.trim()} ${nextCitationTag()}`
    }

    const annotated = sentences.map((sentence) => {
      const trimmed = sentence.trim()
      if (!trimmed) return ''
      if (!shouldRequireCitation(trimmed)) return trimmed
      return `${trimmed} ${nextCitationTag()}`
    }).filter(Boolean)

    return annotated.join(' ')
  }

  let finalText = (responseText || '')
    .split('\n')
    .map(annotateLine)
    .join('\n')
    .trim()

  // Final safeguard: if citations are required and sources exist, ensure at least one visible citation.
  if (includeCitations && dedupedSources.length > 0 && !/\[\d+\]/.test(finalText)) {
    const lines = finalText.split('\n')
    let firstBodyIndex = -1
    let summaryIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      if (/^in short\s*:/i.test(line)) {
        summaryIndex = i
        continue
      }
      if (!isHeadingLike(line) && firstBodyIndex === -1) {
        firstBodyIndex = i
      }
    }

    const appendCitation = (idx: number) => {
      if (idx < 0 || idx >= lines.length) return
      if (!/\[\d+\]/.test(lines[idx])) {
        lines[idx] = `${lines[idx]} [1]`
      }
    }

    appendCitation(firstBodyIndex)
    appendCitation(summaryIndex)
    finalText = lines.join('\n').trim()
  }

  // Always return the full list of source URLs used by search.
  const extracted = extractFormattedSources(finalText, dedupedSources)
  const formattedSources =
    extracted && extracted.length > 0 && extracted.length >= dedupedSources.length
      ? extracted
      : formatSourcesFromUrls(dedupedSources, dedupedSources.length)
  return {
    responseText: finalText,
    sources: formattedSources,
  }
}

function hasUnclosedPairs(text: string, openChar: string, closeChar: string): boolean {
  let balance = 0
  for (const char of text) {
    if (char === openChar) balance += 1
    if (char === closeChar && balance > 0) balance -= 1
  }
  return balance > 0
}

export function endsMidSentenceOrSection(text: string): boolean {
  const trimmed = (text || '').trim()
  if (!trimmed) return false

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : trimmed
  if (!lastLine) return false

  if (/^(In short:\s*)$/i.test(lastLine)) return true
  if (/^[•\-]\s*$/.test(lastLine)) return true
  if (/[,:;]$/.test(lastLine)) return true
  if (/\b(and|or|but|because|with|including|such as|for example|for instance|which|that|then|if|when)\s*$/i.test(lastLine)) return true
  if (/[([{]$/.test(lastLine)) return true
  if (hasUnclosedPairs(trimmed, '(', ')')) return true
  if (hasUnclosedPairs(trimmed, '[', ']')) return true
  if (hasUnclosedPairs(trimmed, '"', '"')) return true

  // If it does not end with terminal punctuation, treat as likely truncated.
  return !/[.!?)]$/.test(lastLine)
}

// Call OpenAI LLM
async function callLLM(
  prompt: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = OPENAI_MODEL,
  maxTokens: number = MAX_TOKENS,
  fallbackModel: string = OPENAI_FALLBACK_MODEL,
  autoContinueOnLength: boolean = false,
  maxAutoContinues: number = 0,
  compressOnLength: boolean = false,
  maxCompressionRetries: number = 0,
  compressionAttempt: number = 0,
  lengthTailTokens: number = 0
): Promise<string> {
  const continuationLimit = Math.max(0, Math.floor(maxAutoContinues))
  const tailTokenLimit = Math.max(0, Math.floor(lengthTailTokens))
  const continuationPrompt = 'Continue exactly from where you stopped. Do not repeat prior text. Keep the same structure and style.'
  const compressionLimit = Math.max(0, Math.floor(maxCompressionRetries))
  const canAttemptCompression = compressOnLength && compressionAttempt < compressionLimit
  const compressionPrompt =
    `${prompt}\n\n` +
    'Your previous draft was cut off due to token limits. Rewrite the full answer so it is complete, self-contained, and fits within the token budget. ' +
    'Prioritize the most important points, remove repetition, and end cleanly.'

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in the environment')
    }
    const openai = new OpenAI({ apiKey })
    const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt }
    ]
    const buildPayload = (
      modelName: string,
      useMaxCompletionTokens: boolean,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      const basePayload: Record<string, any> = {
        model: modelName,
        messages,
      }

      if (useMaxCompletionTokens) {
        basePayload.max_completion_tokens = maxTokens
      } else {
        basePayload.max_tokens = maxTokens
        basePayload.temperature = 0.7
      }

      return basePayload
    }

    const runOpenAiModel = async (
      modelName: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      const normalizedModel = modelName.trim().toLowerCase()
      const shouldUseMaxCompletionTokens =
        normalizedModel.startsWith('o') || normalizedModel.startsWith('gpt-5')
      try {
        return await openai.chat.completions.create(
          buildPayload(modelName, shouldUseMaxCompletionTokens, messages) as any
        )
      } catch (error: any) {
        const unsupportedTokenParam =
          error?.code === 'unsupported_parameter' &&
          (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
        if (!unsupportedTokenParam) throw error
        return openai.chat.completions.create(
          buildPayload(modelName, !shouldUseMaxCompletionTokens, messages) as any
        )
      }
    }

    const runOpenAiWithFallback = async (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      try {
        return await runOpenAiModel(model, messages)
      } catch (primaryError) {
        const activeFallbackModel = (fallbackModel || '').trim()
        if (activeFallbackModel && activeFallbackModel !== model) {
          console.error('OpenAI primary model failed, trying fallback model', {
            primaryModel: model,
            fallbackModel: activeFallbackModel,
          })
          return await runOpenAiModel(activeFallbackModel, messages)
        }
        throw primaryError
      }
    }

    const transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [...baseMessages]
    const chunks: string[] = []
    let continueCount = 0
    let endedByLengthWithoutRecovery = false

    while (true) {
      const completion: any = await runOpenAiWithFallback(transcript)
      const rawResponse = completion.choices?.[0]?.message?.content || "I couldn't generate a response."
      const cleanedChunk = rawResponse.trim()
      const finishReason = completion.choices?.[0]?.finish_reason
      if (cleanedChunk) {
        chunks.push(cleanedChunk)
        transcript.push({ role: 'assistant', content: cleanedChunk })
      }

      const canContinue =
        autoContinueOnLength &&
        continueCount < continuationLimit &&
        endsMidSentenceOrSection(cleanedChunk) &&
        (finishReason === 'length' || finishReason === 'stop' || !finishReason)
      if (!canContinue) {
        if (finishReason === 'length') endedByLengthWithoutRecovery = true
        break
      }

      continueCount += 1
      transcript.push({ role: 'user', content: continuationPrompt })
    }

    let combined = chunks.join('\n\n').trim()
    if (endedByLengthWithoutRecovery && !autoContinueOnLength && tailTokenLimit > 0 && combined) {
      const tailPrompt =
        `Current partial response:\n${combined}\n\n` +
        `Provide only the remaining conclusion in no more than ${tailTokenLimit} tokens. Do not repeat prior text. End cleanly.`
          const tail = await callLLM(
            tailPrompt,
            systemPrompt,
            model,
            tailTokenLimit,
            fallbackModel,
            false,
            0,
        false,
        0,
        0,
        0
      )
      combined = `${combined}\n\n${tail}`.trim()
      endedByLengthWithoutRecovery = false
    }
    if (endedByLengthWithoutRecovery && canAttemptCompression) {
          return await callLLM(
            compressionPrompt,
            systemPrompt,
            model,
            maxTokens,
            fallbackModel,
            false,
            0,
        compressOnLength,
        compressionLimit,
        compressionAttempt + 1,
        0
      )
    }
    return stripMarkdown(stripUrlsFromText(combined || "I couldn't generate a response."))
  } catch (error: any) {
    console.error('LLM API Error:', error)
    return "I'm having a problem. Please try again later."
  }
}

// =====================================================
// MAIN AGENT
// =====================================================

export async function createLegalAgent(
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  caseId?: string,
  options?: LegalAgentOptions
) {
  let fullHistory = conversationHistory
  const caseAccessUserId =
    typeof options?.caseAccessUserId === 'string' && options.caseAccessUserId.trim()
      ? options.caseAccessUserId.trim()
      : ''

  // Only hydrate case-scoped history when the caller proves the case belongs to this user.
  if (caseId && caseAccessUserId) {
    try {
      const { data: caseRow, error: caseError } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('id', caseId)
        .eq('user_id', caseAccessUserId)
        .is('deleted_at', null)
        .maybeSingle()

      if (!caseError && caseRow?.id) {
        const { data: messagesData, error: messagesError } = await supabaseAdmin
          .from('messages')
          .select('role, content, timestamp')
          .eq('case_id', caseId)
          .order('timestamp', { ascending: true })

        if (!messagesError && Array.isArray(messagesData)) {
          fullHistory = messagesData.map((msg: any) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content || ''
          }))
        }
      }
    } catch {
      // fallback to provided conversationHistory
    }
  }

  const trimmedHistory = sanitizeConversationHistory(fullHistory, resolveConversationHistoryLimit(options?.historyLimit))
  const tools = [new DocGeneratorTool()]
  const legalContext = options?.legalContext
  const systemPrompt = applyLegalContextToSystemPrompt(
    options?.systemPrompt || getPremiumContextPromptForAccount(options?.accountType),
    legalContext
  )
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = options?.autoDecideSearch === true && explicitUseSearch === undefined
  const includeCitations = options?.includeCitations === true
  const openaiModel = options?.openaiModel || OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL
  const searchQueryOverride = (options?.searchQueryOverride || '').trim()
  const searchModeOverride = options?.searchModeOverride
  const searchEngineOverride = options?.searchEngineOverride || 'auto'
  const requestedMaxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(250, Number(options?.maxTokens))
    : MAX_TOKENS
  const targetTokensFloor = Number.isFinite(Number(options?.targetTokensFloor))
    ? Math.max(250, Number(options?.targetTokensFloor))
    : PREMIUM_TARGET_TOKENS
  const maxTokensCap = Number.isFinite(Number(options?.maxTokensCap))
    ? Math.max(targetTokensFloor, Number(options?.maxTokensCap))
    : PREMIUM_MAX_TOKENS
  const directMaxTokens = requestedMaxTokens
  const searchMaxTokens = Math.min(maxTokensCap, Math.max(targetTokensFloor, requestedMaxTokens))
  const autoContinueOnLength = options?.autoContinueOnLength === true
  const maxAutoContinues = Number.isFinite(Number(options?.maxAutoContinues))
    ? Math.max(0, Math.floor(Number(options?.maxAutoContinues)))
    : 0
  const explicitLengthMode = options?.lengthRecoveryMode
  const assumedSearchForLengthRecovery = explicitUseSearch === true || autoDecideSearch
  const lengthRecoveryMode: LengthRecoveryMode = explicitLengthMode ||
    (autoContinueOnLength ? 'continue' : (assumedSearchForLengthRecovery ? 'compress' : 'none'))
  const useAutoContinue = lengthRecoveryMode === 'continue'
  const useCompression = lengthRecoveryMode === 'compress'
  const maxCompressionRetries = Number.isFinite(Number(options?.maxCompressionRetries))
    ? Math.max(0, Math.floor(Number(options?.maxCompressionRetries)))
    : (useCompression ? 1 : 0)
  return {
    tools,
    systemPrompt,
    /**
     * Flow: greeting → document → answer
     */
    async invoke({ input }: { input: string }): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; sources?: Array<{ number: number; title: string; url: string }>; basicDailySearchNotice?: string }> {
      try {
        const latestQuestion = (input || '').trim()

        // 1. Check greeting
        if (isBasicGreeting(latestQuestion)) {
          return {
            response: "Hello! I'm MyMcKenzie Assistant. How can I help with your legal question?",
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          }
        }

        // 2. Check document request
        if (wantsDocumentDraftRequest(latestQuestion)) {
          const contextForTools = `${memoryContext}${buildHistoryContext(trimmedHistory, latestQuestion)}${latestQuestion}`
          const docResult = await tools[0]._call(contextForTools)
          return {
            response: stripMarkdown(docResult).trim(),
            document_generated: true,
            guidance_provided: false,
            sources: undefined
          }
        }

        const historyContext = buildHistoryContext(trimmedHistory, latestQuestion)
        const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
        const fallbackSearchMode: LegalSearchMode = searchModeOverride || (isDefinitionQuery(latestQuestion) ? 'education' : 'general')
        let shouldUseSearch = explicitUseSearch ?? true
        let resolvedSearchMode = fallbackSearchMode
        let resolvedSearchQuery = buildJurisdictionAwareSearchQuery(buildSearchQueryWithCaseContext(
          searchQueryOverride || latestQuestion,
          caseKeywords
        ), legalContext)
        let basicDailySearchNotice = ''

        if (autoDecideSearch) {
          const premiumSearchDecision = await decidePremiumSearch({
            latestQuestion,
            systemPrompt,
            provider: 'openai',
            model: openaiModel,
            fallbackModel: openaiFallbackModel,
            memoryContext: options?.memoryContext,
            history: trimmedHistory,
            caseKeywords,
            searchModeOverride,
            searchQueryOverride,
          })
          shouldUseSearch = premiumSearchDecision.useSearch
          resolvedSearchMode = searchModeOverride || premiumSearchDecision.searchMode
          resolvedSearchQuery = buildJurisdictionAwareSearchQuery(buildSearchQueryWithCaseContext(
            searchQueryOverride || premiumSearchDecision.searchQuery || latestQuestion,
            caseKeywords
          ), legalContext)
        }

        if (shouldUseSearch && options?.consumeSearchQuota) {
          try {
            const quota = await options.consumeSearchQuota()
            if (!quota?.allowed) {
              shouldUseSearch = false
              basicDailySearchNotice = getBasicDailyWebSearchLimitReachedNotice(quota?.resetsAt)
            } else if (Number(quota?.remaining) === 0) {
              basicDailySearchNotice = getBasicDailyWebSearchLimitReachedNotice(quota?.resetsAt)
            }
          } catch (error) {
            console.warn('Search quota check failed; falling back to direct answer.', error)
            shouldUseSearch = false
          }
        }

        // 3. LEGAL AGENT: Direct answer (no search)
        if (!shouldUseSearch) {
          const lengthInstruction = buildLengthInstruction(latestQuestion)
          const directPrompt = `${memoryContext}${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. ${lengthInstruction} Keep the reply conversational and natural. Output must be plain text only. Avoid markdown links, markdown bold, italics, and tables.`
          const directAnswer = await callLLM(
            directPrompt,
            systemPrompt,
            openaiModel,
            directMaxTokens,
            openaiFallbackModel,
            useAutoContinue,
            maxAutoContinues,
            useCompression,
            maxCompressionRetries
          )
          const finalDirectAnswer = neutralizeLegalAdviceTone(directAnswer)
          return {
            response: finalDirectAnswer,
            document_generated: false,
            guidance_provided: true,
            sources: undefined,
            basicDailySearchNotice: basicDailySearchNotice || undefined
          }
        }

        // 4. LEGAL AGENT: Comprehensive web search and answer generation
        const mode: LegalSearchMode = resolvedSearchMode

        // Perform comprehensive search for all relevant information.
        const searchTool = new SearchTool({
          engine: searchEngineOverride,
          countryCode: getSearchCountryCode(legalContext),
        })
        const searchPayload = JSON.stringify({
          query: resolvedSearchQuery,
          mode,
          engine: searchEngineOverride,
          countryCode: getSearchCountryCode(legalContext),
        })
        const searchResult = await searchTool._call(searchPayload)

        let sources: string[] = []
        let searchedInfo = ''
        let sourceMode: 'engine' | 'fallback' | 'none' = 'none'

        try {
          const parsed = JSON.parse(searchResult) as { sources?: any[]; packet?: string; sourceMode?: any }
          sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u: any): u is string => typeof u === 'string') : []
          searchedInfo = typeof parsed.packet === 'string' ? parsed.packet : ''
          if (parsed.sourceMode === 'engine' || parsed.sourceMode === 'fallback' || parsed.sourceMode === 'none') {
            sourceMode = parsed.sourceMode
          } else {
            sourceMode = sources.length > 0 ? 'engine' : 'none'
          }
        } catch {
          searchedInfo = searchResult
        }

        const effectiveIncludeCitations = includeCitations && sourceMode === 'engine' && sources.length > 0

        // Generate comprehensive answer using ALL sources
        const sourceBlock = sources.length > 0
          ? `All available sources to reference:\n${sources.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`
          : 'No sources available.'

        const citationInstruction = effectiveIncludeCitations
          ? 'Include inline citations in square brackets that match the sources list above, like [1] or [2]. Use citations on factual statements.'
          : 'Do not include any source citations.'
        const lengthInstruction = buildLengthInstruction(latestQuestion)
        const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\n${memoryContext}${buildHistoryContext(trimmedHistory, latestQuestion)}${caseContext}User question: "${latestQuestion}"\n\nGenerate a clear answer that covers the user's actual question using the retrieved information. ${ANECDOTAL_SOURCE_INSTRUCTION} ${lengthInstruction} ${citationInstruction} Keep the reply conversational and natural. Keep the tone informational and non-advisory: avoid definitive conclusions on this user's exact facts and prefer neutral phrases like "may", "can", and "generally". Output must be plain text only. Avoid markdown links, markdown bold, italics, and tables.`

        let comprehensiveAnswer = await callLLM(
          comprehensivePrompt,
          systemPrompt,
          openaiModel,
          searchMaxTokens + COMPREHENSIVE_TOKEN_BONUS,
          openaiFallbackModel,
          false,
          0,
          useCompression,
          maxCompressionRetries,
          0,
          PREMIUM_LENGTH_TAIL_TOKENS
        )
        if (endsMidSentenceOrSection(comprehensiveAnswer)) {
          const completeEndingPrompt =
            `Text to finalize:\n${comprehensiveAnswer}\n\n` +
            'Rewrite this into a complete final response that ends cleanly and is not cut off. Keep the same meaning, legal caution, and structure.'
          comprehensiveAnswer = await callLLM(
            completeEndingPrompt,
            systemPrompt,
            openaiModel,
            PREMIUM_MAX_TOKENS,
            openaiFallbackModel,
            false,
            0,
            true,
            Math.max(1, maxCompressionRetries),
            0,
            PREMIUM_LENGTH_TAIL_TOKENS
          )
        }

        const finalNoEngineCitations = ensureCitationsForPremium(
          neutralizeLegalAdviceTone(comprehensiveAnswer),
          sources,
          effectiveIncludeCitations
        )
        return {
          response: finalNoEngineCitations.responseText,
          document_generated: false,
          guidance_provided: true,
          sources: finalNoEngineCitations.sources,
          basicDailySearchNotice: basicDailySearchNotice || undefined
        }
      } catch (error: any) {
        const message = error instanceof Error ? error.message : ''
        const status = (typeof error === 'object' && error !== null && 'status' in error)
          ? ((error as { status?: any }).status as number | undefined)
          : undefined

        if (message.includes('rate limit') || status === 429) {
          return {
            response: "I'm experiencing high demand. Please try again in a moment.",
            document_generated: false,
            guidance_provided: false,
            sources: undefined
          }
        }
        throw error
      }
    }
  }
}

/**
 * Helper to invoke the agent
 */
export async function invokeLegalAgent(
  message: string,
  _threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: LegalAgentOptions
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }>; basicDailySearchNotice?: string }> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    ...options,
    caseAccessUserId: options?.caseAccessUserId || userId,
  })
  const response = await agent.invoke({ input: message })
  return {
    response: response.response,
    document_generated: response.document_generated,
    guidance_provided: response.guidance_provided,
    next_steps: [],
    sources: response.sources,
    basicDailySearchNotice: response.basicDailySearchNotice,
  }
}

export async function invokePremiumLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    legalContext?: UserLegalContext
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
    accountType?: AccountType
    systemPrompt?: string
    consumeCaseLawRetrievalQuota?: () => Promise<CaseLawRetrievalQuotaResult>
    caseLawRetrievalLimitNotice?: (resetsAt: string | null | undefined) => string
  }
  ): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  return invokeLegalAgent(message, threadId, userId, conversationHistory, caseKeywords, {
    useSearch: options?.useSearch,
    autoDecideSearch: options?.autoDecideSearch ?? options?.useSearch === undefined,
    includeCitations: true,
    memoryContext: options?.memoryContext,
    historyLimit: options?.historyLimit,
    openaiModel: options?.openaiModel || OPENAI_MODEL,
    openaiFallbackModel: options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL,
    maxTokens: options?.maxTokens,
    autoContinueOnLength: true,
    maxAutoContinues: 1,
    maxCompressionRetries: options?.maxCompressionRetries,
    searchQueryOverride: options?.searchQueryOverride,
    searchModeOverride: options?.searchModeOverride,
    searchEngineOverride: options?.searchEngineOverride || 'brave',
    legalContext: options?.legalContext,
    accountType: options?.accountType,
    systemPrompt: options?.systemPrompt,
    consumeSearchQuota: options?.consumeSearchQuota,
  })
}

export async function invokePremiumLitigantLegalAgent(
  ...args: Parameters<typeof invokePremiumLegalAgent>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumLegalAgent(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'litigant' }
  )
}

export async function invokePremiumProfessionalLegalAgent(
  ...args: Parameters<typeof invokePremiumLegalAgent>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumLegalAgent(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'business' }
  )
}

export async function invokePremiumLegalAgentStream(
  message: string,
  _threadId: string,
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    legalContext?: UserLegalContext
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
    onStatus?: (status: string) => void
    onToken?: (chunk: string) => void
    accountType?: AccountType
    systemPrompt?: string
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }>; basicDailySearchNotice?: string }> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    return {
      response: "I'm unable to respond right now because the Premium model is unavailable. Please try again shortly.",
      document_generated: false,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const trimmedHistory = sanitizeConversationHistory(conversationHistory, resolveConversationHistoryLimit(options?.historyLimit))
  const systemPrompt = applyLegalContextToSystemPrompt(
    options?.systemPrompt || getPremiumContextPromptForAccount(options?.accountType),
    options?.legalContext
  )
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = (options?.autoDecideSearch ?? true) && explicitUseSearch === undefined
  const openaiModel = options?.openaiModel || OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL
  const searchQueryOverride = (options?.searchQueryOverride || '').trim()
  const searchModeOverride = options?.searchModeOverride
  const searchEngineOverride = options?.searchEngineOverride || 'brave'
  const requestedMaxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(250, Number(options?.maxTokens))
    : MAX_TOKENS
  const directMaxTokens = requestedMaxTokens
  const searchMaxTokens = Math.min(PREMIUM_MAX_TOKENS, Math.max(PREMIUM_TARGET_TOKENS, requestedMaxTokens))
  let lastStatus = ''
  const emitStatus = (status: string) => {
    const normalizedStatus = String(status || '').trim()
    if (!normalizedStatus || normalizedStatus === lastStatus) return
    lastStatus = normalizedStatus
    options?.onStatus?.(normalizedStatus)
  }

  const openai = new OpenAI({ apiKey })
  const continuationPrompt = 'Continue exactly from where you stopped and finish the answer completely. Do not repeat prior text. Keep the same structure and style.'
  const continuationLimit = 6

  const streamOpenAiText = async (prompt: string, tokenLimit: number): Promise<string> => {
    const transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]
    const chunks: string[] = []
    let continueCount = 0

    const buildPayload = (
      modelName: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      const normalizedModel = modelName.trim().toLowerCase()
      const payload: Record<string, any> = {
        model: modelName,
        messages,
        stream: true,
      }
      if (normalizedModel.startsWith('o') || normalizedModel.startsWith('gpt-5')) {
        payload.max_completion_tokens = tokenLimit
      } else {
        payload.max_tokens = tokenLimit
        payload.temperature = 0.7
      }
      return payload
    }

    const runModel = async (
      modelName: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      let streamedText = ''
      let finishReason: string | null = null
      try {
        const stream = await openai.chat.completions.create(buildPayload(modelName, messages) as any)
        for await (const chunk of stream as unknown as AsyncIterable<any>) {
          const delta = chunk?.choices?.[0]?.delta?.content || ''
          if (delta) {
            streamedText += delta
            options?.onToken?.(delta)
          }
          const candidateFinish = chunk?.choices?.[0]?.finish_reason
          if (candidateFinish) finishReason = candidateFinish
        }
        return {
          rawResponse: streamedText || "I couldn't generate a response.",
          finishReason,
        }
      } catch (error: any) {
        const unsupportedTokenParam =
          error?.code === 'unsupported_parameter' &&
          (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
        if (!unsupportedTokenParam) throw error

        const retryPayload = buildPayload(modelName, messages)
        if ('max_tokens' in retryPayload) {
          delete retryPayload.max_tokens
          retryPayload.max_completion_tokens = tokenLimit
        } else {
          delete retryPayload.max_completion_tokens
          retryPayload.max_tokens = tokenLimit
          retryPayload.temperature = 0.7
        }

        const retryStream = await openai.chat.completions.create(retryPayload as any)
        streamedText = ''
        finishReason = null
        for await (const chunk of retryStream as unknown as AsyncIterable<any>) {
          const delta = chunk?.choices?.[0]?.delta?.content || ''
          if (delta) {
            streamedText += delta
            options?.onToken?.(delta)
          }
          const candidateFinish = chunk?.choices?.[0]?.finish_reason
          if (candidateFinish) finishReason = candidateFinish
        }
        return {
          rawResponse: streamedText || "I couldn't generate a response.",
          finishReason,
        }
      }
    }

    const runWithFallback = async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
      try {
        return await runModel(openaiModel, messages)
      } catch (primaryError) {
        if (openaiFallbackModel && openaiFallbackModel !== openaiModel) {
          console.error('OpenAI streaming primary model failed, trying fallback model', {
            primaryModel: openaiModel,
            fallbackModel: openaiFallbackModel,
          })
          return await runModel(openaiFallbackModel, messages)
        }
        throw primaryError
      }
    }

    while (true) {
      const { rawResponse, finishReason } = await runWithFallback(transcript)
      const cleanedChunk = rawResponse.trim()
      if (cleanedChunk) {
        chunks.push(cleanedChunk)
        transcript.push({ role: 'assistant', content: cleanedChunk })
      }

      const canContinue =
        continueCount < continuationLimit &&
        endsMidSentenceOrSection(cleanedChunk) &&
        (finishReason === 'length' || finishReason === 'stop' || !finishReason)
      if (!canContinue) break

      continueCount += 1
      transcript.push({ role: 'user', content: continuationPrompt })
    }

    return stripMarkdown(stripUrlsFromText(chunks.join('\n\n').trim() || "I couldn't generate a response."))
  }

  const latestQuestion = (message || '').trim()

  if (isBasicGreeting(latestQuestion)) {
    return {
      response: "Hello! I'm MyMcKenzie Assistant. How can I help with your legal question?",
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  if (wantsDocumentDraftRequest(latestQuestion)) {
    const contextForTools = `${memoryContext}${buildHistoryContext(trimmedHistory, latestQuestion)}${latestQuestion}`
    const docResult = await new DocGeneratorTool()._call(contextForTools)
    return {
      response: stripMarkdown(docResult).trim(),
      document_generated: true,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const historyContext = buildHistoryContext(trimmedHistory, latestQuestion)
  const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
  const fallbackSearchMode: LegalSearchMode = searchModeOverride || (isDefinitionQuery(latestQuestion) ? 'education' : 'general')
  let shouldUseSearch = explicitUseSearch ?? true
  let resolvedSearchMode = fallbackSearchMode
  let basicDailySearchNotice = ''
  let resolvedSearchQuery = buildJurisdictionAwareSearchQuery(buildSearchQueryWithCaseContext(
    searchQueryOverride || latestQuestion,
    caseKeywords
  ), options?.legalContext)

  emitStatus('Thinking...')
  if (autoDecideSearch) {
    const premiumSearchDecision = await decidePremiumSearch({
      latestQuestion,
      systemPrompt,
      provider: 'openai',
      model: openaiModel,
      fallbackModel: openaiFallbackModel,
      memoryContext: options?.memoryContext,
      history: trimmedHistory,
      caseKeywords,
      searchModeOverride,
      searchQueryOverride,
    })
    shouldUseSearch = premiumSearchDecision.useSearch
    resolvedSearchMode = searchModeOverride || premiumSearchDecision.searchMode
    resolvedSearchQuery = buildJurisdictionAwareSearchQuery(buildSearchQueryWithCaseContext(
      searchQueryOverride || premiumSearchDecision.searchQuery || latestQuestion,
      caseKeywords
    ), options?.legalContext)
  }

  if (shouldUseSearch && options?.consumeSearchQuota) {
    try {
      const quota = await options.consumeSearchQuota()
      if (!quota?.allowed) {
        shouldUseSearch = false
        basicDailySearchNotice = getBasicDailyWebSearchLimitReachedNotice(quota?.resetsAt)
      } else if (Number(quota?.remaining) === 0) {
        basicDailySearchNotice = getBasicDailyWebSearchLimitReachedNotice(quota?.resetsAt)
      }
    } catch (error) {
      console.warn('Search quota check failed; falling back to direct answer.', error)
      shouldUseSearch = false
    }
  }

  if (!shouldUseSearch) {
    const lengthInstruction = buildLengthInstruction(latestQuestion)
    const directPrompt = `${memoryContext}${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. ${lengthInstruction} Keep the reply conversational and natural. Output must be plain text only. Avoid markdown links, markdown bold, italics, and tables.`
    emitStatus('Drafting answer...')
    return {
      response: neutralizeLegalAdviceTone(await streamOpenAiText(directPrompt, directMaxTokens)),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
      basicDailySearchNotice: basicDailySearchNotice || undefined,
    }
  }

  const mode: LegalSearchMode = resolvedSearchMode

  const searchTool = new SearchTool({
    engine: searchEngineOverride,
    countryCode: getSearchCountryCode(options?.legalContext),
  })
  const searchPayload = JSON.stringify({
    query: resolvedSearchQuery,
    mode,
    engine: searchEngineOverride,
    countryCode: getSearchCountryCode(options?.legalContext),
  })
  emitStatus('Checking web sources...')
  const searchResult = await searchTool._call(searchPayload)

  let sources: string[] = []
  let searchedInfo = ''
  let sourceMode: 'engine' | 'fallback' | 'none' = 'none'
  try {
    const parsed = JSON.parse(searchResult) as { sources?: any[]; packet?: string; sourceMode?: any }
    sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u: any): u is string => typeof u === 'string') : []
    searchedInfo = typeof parsed.packet === 'string' ? parsed.packet : ''
    if (parsed.sourceMode === 'engine' || parsed.sourceMode === 'fallback' || parsed.sourceMode === 'none') {
      sourceMode = parsed.sourceMode
    } else {
      sourceMode = sources.length > 0 ? 'engine' : 'none'
    }
  } catch {
    searchedInfo = searchResult
  }

  const effectiveIncludeCitations = sourceMode === 'engine' && sources.length > 0
  const sourceBlock = sources.length > 0
    ? `All available sources to reference:\n${sources.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`
    : 'No sources available.'
  const lengthInstruction = buildLengthInstruction(latestQuestion)
  const citationInstruction = effectiveIncludeCitations
    ? 'Include inline citations in square brackets that match the sources list above, like [1] or [2]. Use citations on factual statements.'
    : 'Do not include any source citations.'
  const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\n${memoryContext}${buildHistoryContext(trimmedHistory, latestQuestion)}${caseContext}User question: "${latestQuestion}"\n\nGenerate a clear answer that covers the user's actual question using the retrieved information. ${ANECDOTAL_SOURCE_INSTRUCTION} ${lengthInstruction} ${citationInstruction} Keep the reply conversational and natural. Keep the tone informational and non-advisory: avoid definitive conclusions on this user's exact facts and prefer neutral phrases like "may", "can", and "generally". Output must be plain text only. Avoid markdown links, markdown bold, italics, and tables.`

  emitStatus('Drafting answer...')
  const streamedAnswer = await streamOpenAiText(comprehensivePrompt, searchMaxTokens)
  const final = ensureCitationsForPremium(
    neutralizeLegalAdviceTone(streamedAnswer),
    sources,
    effectiveIncludeCitations
  )
  return {
    response: final.responseText,
    document_generated: false,
    guidance_provided: true,
    next_steps: [],
    sources: final.sources,
    basicDailySearchNotice: basicDailySearchNotice || undefined,
  }
}

export async function invokePremiumLitigantLegalAgentStream(
  ...args: Parameters<typeof invokePremiumLegalAgentStream>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumLegalAgentStream(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'litigant' }
  )
}

export async function invokePremiumProfessionalLegalAgentStream(
  ...args: Parameters<typeof invokePremiumLegalAgentStream>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumLegalAgentStream(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'business' }
  )
}

type PremiumPlusToolExecutionResult = {
  content: string
  sources?: string[]
}

type PremiumPlusToolLoopState = {
  messages: PremiumPlusAnthropicMessage[]
  sources: string[]
  directResponse: string
  toolsUsed: string[]
  systemPrompt: string
}

const extractPremiumPlusToolResultText = (messages: PremiumPlusAnthropicMessage[]): string => {
  const lines: string[] = []
  messages.forEach((message) => {
    if (!Array.isArray(message.content)) return
    message.content.forEach((block: any) => {
      if (block?.type !== 'tool_result') return
      const content = String(block?.content || '').trim()
      if (content) lines.push(content)
    })
  })
  return lines.join('\n\n').trim()
}

const buildPremiumPlusOpenAiFallbackFinalPrompt = (message: string, toolContext: string) =>
  `${message}\n\n` +
  `Tool results already retrieved for this request:\n${toolContext || 'No tool output available.'}\n\n` +
  `${ANECDOTAL_SOURCE_INSTRUCTION}\n\n` +
  'Now answer the user directly in plain text using the tool results above. Do not mention tools or internal routing.'

const isPremiumPlusPlaceholderResponse = (text: string) => {
  const normalized = premiumPlusCompact(String(text || '').toLowerCase())
  return (
    !normalized ||
    normalized === "i couldn't generate a response." ||
    normalized === "i'm having trouble generating a complete response right now. please try again in a moment."
  )
}

const generatePremiumPlusOpenAiFallbackFinalText = async (options: {
  message: string
  toolContext: string
  systemPrompt: string
  model: string
  maxTokens: number
}) => {
  const basePrompt = buildPremiumPlusOpenAiFallbackFinalPrompt(options.message, options.toolContext)
  let finalText = await callLLM(
    basePrompt,
    options.systemPrompt,
    options.model,
    options.maxTokens,
    options.model,
    true,
    PREMIUM_PLUS_MAX_AUTO_CONTINUES
  )

  if (isPremiumPlusPlaceholderResponse(finalText)) {
    const retryPrompt =
      `${basePrompt}\n\n` +
      'Your previous reply was empty or unusable. Provide at least one short paragraph and one short practical next-step paragraph.'
    finalText = await callLLM(
      retryPrompt,
      options.systemPrompt,
      options.model,
      options.maxTokens,
      options.model,
      true,
      PREMIUM_PLUS_MAX_AUTO_CONTINUES
    )
  }

  if (isPremiumPlusPlaceholderResponse(finalText)) {
    if (options.toolContext.trim()) {
      return `I had trouble drafting the final answer. Here is the key information retrieved:\n\n${premiumPlusTruncate(options.toolContext, 2400)}`
    }
    return "I'm having trouble generating a complete response right now. Please try again in a moment."
  }

  return finalText
}

const buildPremiumPlusForcedFallbackToolCalls = (prompt: string): Array<{ id: string; name: string; input: Record<string, any> }> => {
  const query = premiumPlusTruncate(prompt, 600)
  return [
    {
      id: 'forced_web_search',
      name: 'web_search',
      input: {
        query,
        mode: 'general',
      },
    },
    {
      id: 'forced_case_law_search',
      name: 'case_law_search',
      input: {
        query,
        scope: 'both',
        limit: 3,
      },
    },
  ]
}

const PREMIUM_PLUS_TOOL_LOOP_LIMIT = Number.isFinite(Number(process.env.PREMIUM_PLUS_TOOL_LOOP_LIMIT))
  ? Math.min(8, Math.max(1, Math.floor(Number(process.env.PREMIUM_PLUS_TOOL_LOOP_LIMIT))))
  : 4
const PREMIUM_PLUS_LITIGANT_CASE_LAW_DEFAULT_LIMIT = Number.isFinite(Number(process.env.PREMIUM_PLUS_LITIGANT_CASE_LAW_DEFAULT_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.PREMIUM_PLUS_LITIGANT_CASE_LAW_DEFAULT_LIMIT)))
  : 25
const PREMIUM_PLUS_LITIGANT_CASE_LAW_MAX_LIMIT = Number.isFinite(Number(process.env.PREMIUM_PLUS_LITIGANT_CASE_LAW_MAX_LIMIT))
  ? Math.max(PREMIUM_PLUS_LITIGANT_CASE_LAW_DEFAULT_LIMIT, Math.floor(Number(process.env.PREMIUM_PLUS_LITIGANT_CASE_LAW_MAX_LIMIT)))
  : 100
const PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS = 700
const PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING_BETA = 'prompt-caching-2024-07-31'
const PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHE_TTL = '5m'
const PREMIUM_PLUS_CONTINUATION_PROMPT = 'Continue exactly from where you stopped and finish the answer completely. Do not repeat prior text. Keep the same structure and style.'

const hasUsCaseLawVectorConfig = () => Boolean(process.env.US_MILVUS_HOST || process.env.MILVUS_US_HOST)

type PremiumPlusAnthropicTextResult = {
  text: string
  stopReason: string | null
}

const buildPremiumPlusToolExecutionInstructions = (legalContext?: UserLegalContext | null) => {
  if (legalContext?.countryCode === 'US') {
    if (hasUsCaseLawVectorConfig()) {
      return `TOOL EXECUTION
- You have access to web_search and case_law_search for U.S. matters.
- case_law_search retrieves from the U.S. case-law vector collection. Treat results as research leads and explain whether the court/jurisdiction appears binding, persuasive, federal, state, published, or otherwise limited when that information is available.
- You may answer directly when the question is simple enough to answer.
- If current real-time official guidance, procedure, forms, deadlines, statutes, court self-help pages, or practical process details are needed, call web_search.
- If authorities, precedents, judicial reasoning, or illustrative examples from decided cases would materially help, call case_law_search.
- You may call both tools when both materially help.
- Treat Reddit, forums, social posts, and community discussions as anecdotal only. They may help reveal common practical experiences, user sentiment, or pitfalls, but never use them as authority for law, procedure, deadlines, forms, rights, legal standards, or case outcomes. If you mention them, identify them transparently as Reddit/forum/community discussion, phrase them as user reports or forum discussion rather than fact, and make clear they are anecdotal. Verify legal/procedural points against official guidance, statutes, rules, court pages, or case-law retrieval.
- Use the available tools whenever they materially improve knowledge, understanding, accuracy, freshness, authority, case-specific relevance, or explanation.
- If you are unsure whether retrieval would help, prefer the tool that best verifies the uncertain point.
- After tool results are returned, answer the user directly in plain text.
- If you discuss a specific U.S. authority from the provided case-law or web context, introduce it with a short standalone line containing the case name and citation before explaining it.
- Do not mention tools, tool calls, internal routing, or function names to the user.
- Treat tool outputs as context already provided to you.
- If a source contains complex legal language, translate it into plain English for a non-lawyer before presenting it to the user.`
    }

    return `TOOL EXECUTION
- You have access to web_search for U.S. matters.
- Internal case-law retrieval is currently configured for UK authorities only, so do not call case_law_search for U.S. matters unless the user explicitly asks for a UK comparison.
- You may answer directly when the question is simple enough to answer.
- If current real-time official guidance, procedure, forms, deadlines, statutes, court self-help pages, or practical process details are needed, call web_search.
- Use the available tools whenever they materially improve knowledge, understanding, accuracy, freshness, authority, case-specific relevance, or explanation.
- If you are unsure whether retrieval would help, prefer web_search to verify the uncertain U.S. point from current public sources.
- Treat Reddit, forums, social posts, and community discussions as anecdotal only. They may help reveal common practical experiences, user sentiment, or pitfalls, but never use them as authority for law, procedure, deadlines, forms, rights, legal standards, or case outcomes. If you mention them, identify them transparently as Reddit/forum/community discussion, phrase them as user reports or forum discussion rather than fact, and make clear they are anecdotal. Verify legal/procedural points against official guidance, statutes, rules, or court pages.
- After tool results are returned, answer the user directly in plain text.
- If you discuss a specific U.S. statute, rule, official guidance page, or public authority from the provided web context, name it clearly before explaining it.
- Do not mention tools, tool calls, internal routing, or function names to the user.
- Treat tool outputs as context already provided to you.
- If a source contains complex legal language, translate it into plain English for a non-lawyer before presenting it to the user.`
  }

  return `TOOL EXECUTION
- You have access to web_search and case_law_search.
- You may answer directly when the question is simple enough to answer.
- If current real-time official guidance, procedure, forms, deadlines, or practical process details are needed, call web_search.
- If authorities, precedents, judicial reasoning, or illustrative examples from decided cases would materially help, call case_law_search.
- You may call both tools when both materially help.
- Treat Reddit, forums, social posts, and community discussions as anecdotal only. They may help reveal common practical experiences, user sentiment, or pitfalls, but never use them as authority for law, procedure, deadlines, forms, rights, legal standards, or case outcomes. If you mention them, identify them transparently as Reddit/forum/community discussion, phrase them as user reports or forum discussion rather than fact, and make clear they are anecdotal. Verify legal/procedural points against official guidance, statutes, rules, court pages, or case-law retrieval.
- Use the available tools whenever they materially improve knowledge, understanding, accuracy, freshness, authority, case-specific relevance, or explanation.
- If you are unsure whether retrieval would help, prefer the tool that best verifies the uncertain point.
- After tool results are returned, answer the user directly in plain text.
- If you discuss a specific authority from the provided case-law or web context, introduce it with a short standalone line containing the case name and citation before explaining it.
- Do not use anonymous phrasing like "This case" or "This authority" for a retrieved authority unless the immediately preceding line already names that authority.
- Do not mention tools, tool calls, internal routing, or function names to the user.
- Treat tool outputs as context already provided to you.
- If a tool returns a complex legal ruling, translate it into plain English for a non-lawyer before presenting it to the user.`
}

const buildPremiumPlusToolSystemPrompt = (legalContext?: UserLegalContext | null) =>
  `${PREMIUM_CONTEXT_SYSTEM_PROMPT}

${buildPremiumPlusToolExecutionInstructions(legalContext)}`

const PREMIUM_PLUS_ANTHROPIC_TOOLS = [
  {
    name: 'web_search',
    description: 'Search current web sources for external knowledge, legal guidance, procedure, forms, deadlines, practical or useful context.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['education', 'procedure', 'case_specific', 'document_review', 'general'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'case_law_search',
    description: 'Retrieve case-law authorities, summaries, and extracts relevant to the user conversation or query.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        scope: {
          type: 'string',
          enum: ['suggestions', 'analysis', 'both'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['query'],
    },
  },
] as const

type PremiumPlusAnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | Array<Record<string, any>>
}

type VerifiedAuthority = {
  title: string
  citation: string
}

const premiumPlusCompact = (value: string) => value.replace(/\s+/g, ' ').trim()
const premiumPlusTruncate = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1))}…`
const premiumPlusFirstDefinedString = (...values: any[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const premiumPlusAuthorityKey = (title: string, citation: string) =>
  `${premiumPlusCompact(title.toLowerCase())}|${premiumPlusCompact(citation.toLowerCase())}`

const premiumPlusCaseNamePattern =
  /([A-Z][A-Za-z'&.\-]{1,}(?:\s+[A-Za-z][A-Za-z'&.\-]{1,})*\s+v\.?\s+[A-Z][A-Za-z'&.\-]{1,}(?:\s+[A-Za-z][A-Za-z'&.\-]{1,})*)/

const premiumPlusCitationPattern = /\[\d{4}\]\s*[A-Z]{2,8}[A-Za-z0-9\s().-]{0,32}\d+/i

const extractVerifiedAuthoritiesFromText = (text: string): VerifiedAuthority[] => {
  const results: VerifiedAuthority[] = []
  const seen = new Set<string>()
  const pushAuthority = (titleRaw: string, citationRaw: string) => {
    const title = premiumPlusFirstDefinedString(titleRaw)
    const citation = premiumPlusFirstDefinedString(citationRaw)
    if (!title || !citation) return
    const key = premiumPlusAuthorityKey(title, citation)
    if (seen.has(key)) return
    seen.add(key)
    results.push({ title, citation })
  }

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const numberedLine = line.replace(/^\[\d+\]\s+/, '').trim()
    const citationFirstMatch = numberedLine.match(/^(\[[^\]]+\][A-Za-z0-9\s().-]{0,32}\d*)\s+-\s+(.+)$/)
    if (citationFirstMatch && premiumPlusCitationPattern.test(citationFirstMatch[1])) {
      pushAuthority(citationFirstMatch[2], citationFirstMatch[1])
      continue
    }

    const inlineMatch = numberedLine.match(
      /([A-Z][A-Za-z'&.\-]{1,}(?:\s+[A-Za-z][A-Za-z'&.\-]{1,})*\s+v\.?\s+[A-Z][A-Za-z'&.\-]{1,}(?:\s+[A-Za-z][A-Za-z'&.\-]{1,})*)\s+(\[\d{4}\]\s*[A-Z]{2,8}[A-Za-z0-9\s().-]{0,32}\d+)/i
    )
    if (inlineMatch) {
      pushAuthority(inlineMatch[1], inlineMatch[2])
    }
  }

  return results
}

const extractVerifiedAuthoritiesFromToolMessages = (
  messages: PremiumPlusAnthropicMessage[]
): VerifiedAuthority[] => {
  const collected: VerifiedAuthority[] = []
  const seen = new Set<string>()

  const mergeAuthorities = (items: VerifiedAuthority[]) => {
    items.forEach((item) => {
      const key = premiumPlusAuthorityKey(item.title, item.citation)
      if (seen.has(key)) return
      seen.add(key)
      collected.push(item)
    })
  }

  messages.forEach((message) => {
    if (!Array.isArray(message.content)) return
    message.content.forEach((block: any) => {
      if (block?.type !== 'tool_result' || typeof block?.content !== 'string') return
      mergeAuthorities(extractVerifiedAuthoritiesFromText(block.content))
    })
  })

  return collected
}

const createPremiumPlusAnthropic = () => {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set for Premium+ tool calling')
  }
  return new Anthropic({ apiKey })
}

const premiumPlusPromptCachingEnabled = () =>
  (process.env.PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING || 'true').trim().toLowerCase() !== 'false'

const buildPremiumPlusAnthropicSystemBlocks = (systemPrompt: string, promptCachingEnabled: boolean) =>
  promptCachingEnabled
    ? [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: {
            type: 'ephemeral',
            ttl: PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHE_TTL,
          },
        },
      ]
    : systemPrompt

const buildPremiumPlusAnthropicTools = (
  promptCachingEnabled: boolean,
  legalContext?: UserLegalContext | null
) => {
  const tools = legalContext?.countryCode === 'US'
    ? (hasUsCaseLawVectorConfig()
      ? PREMIUM_PLUS_ANTHROPIC_TOOLS
      : PREMIUM_PLUS_ANTHROPIC_TOOLS.filter((tool) => tool.name !== 'case_law_search'))
    : PREMIUM_PLUS_ANTHROPIC_TOOLS

  return tools.map((tool, index) =>
    promptCachingEnabled && index === tools.length - 1
      ? {
          ...tool,
          cache_control: {
            type: 'ephemeral',
            ttl: PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHE_TTL,
          },
        }
      : { ...tool }
  )
}

const isPremiumPlusPromptCachingUnsupportedError = (error: any) => {
  const details = [
    typeof error?.message === 'string' ? error.message : '',
    typeof error?.error?.message === 'string' ? error.error.message : '',
    typeof error?.response?.data?.error?.message === 'string' ? error.response.data.error.message : '',
  ]
    .join(' ')
    .toLowerCase()

  return (
    details.includes('prompt-caching') ||
    details.includes('cache_control') ||
    details.includes('anthropic-beta') ||
    details.includes('unsupported beta') ||
    details.includes('invalid beta')
  )
}

const buildPremiumPlusAnthropicSystemPrompt = (
  contextLines: string[] = [],
  accountType?: AccountType,
  legalContext?: UserLegalContext | null,
  systemPrompt?: string
) => {
  const customPrompt = typeof systemPrompt === 'string' && systemPrompt.trim()
    ? systemPrompt.trim()
    : ''
  const basePrompt = customPrompt
    ? `${customPrompt}\n\n${buildPremiumPlusToolExecutionInstructions(legalContext)}`
    : buildPromptForAudience(buildPremiumPlusToolSystemPrompt(legalContext), accountType)

  return contextLines.length > 0
    ? `${basePrompt}\n\nContext\n${contextLines.join('\n\n')}`
    : basePrompt
}

const buildPremiumPlusContextLines = (options: {
  conversationHistory?: Array<{ role: string; content: string }>
  caseKeywords?: string
  memoryContext?: string
  historyLimit?: number
  latestQuestion?: string
  legalContext?: UserLegalContext
}) => {
  const trimmedHistory = sanitizeConversationHistory(
    options.conversationHistory,
    resolveConversationHistoryLimit(options.historyLimit)
  )
  const historyContext = buildHistoryContext(trimmedHistory, options.latestQuestion)
  const contextLines: string[] = []

  if (options.caseKeywords?.trim()) {
    contextLines.push(`Case context: ${options.caseKeywords.trim()}`)
  }
  if (options.memoryContext?.trim()) {
    contextLines.push(options.memoryContext.trim())
  }
  if (historyContext) {
    contextLines.push(historyContext.trim())
  }

  return contextLines
}

const buildPremiumPlusDirectSystemPrompt = (options: {
  conversationHistory?: Array<{ role: string; content: string }>
  caseKeywords?: string
  memoryContext?: string
  historyLimit?: number
  latestQuestion?: string
  legalContext?: UserLegalContext
  accountType?: AccountType
  systemPrompt?: string
}) => {
  const contextLines = buildPremiumPlusContextLines(options)
  const rootPrompt = typeof options.systemPrompt === 'string' && options.systemPrompt.trim()
    ? options.systemPrompt.trim()
    : getPremiumContextPromptForAccount(options.accountType)
  const basePrompt = contextLines.length > 0
    ? `${rootPrompt}\n\nContext\n${contextLines.join('\n\n')}`
    : rootPrompt
  return applyLegalContextToSystemPrompt(basePrompt, options.legalContext)
}

const shouldPreferPremiumPlusDirectAnswer = (rawQuestion: string) => {
  const latestQuestion = premiumPlusCompact(rawQuestion.toLowerCase())
  if (!latestQuestion || !isDefinitionQuery(rawQuestion)) return false

  const retrievalSignals = [
    /\bcase law\b/,
    /\bprecedent\b/,
    /\bauthorit(?:y|ies)\b/,
    /\bcurrent\b/,
    /\blatest\b/,
    /\btoday\b/,
    /\bdeadline\b/,
    /\bprocedure\b/,
    /\bform\b/,
    /\bcitation\b/,
    /\bsource\b/,
    /\bverify\b/,
    /\bcheck\b/,
    /\bappeal\b/,
    /\btribunal\b/,
    /\bcourt fee\b/,
    /\bgov\.uk\b/,
  ]

  return !retrievalSignals.some((pattern) => pattern.test(latestQuestion))
}

const callPremiumPlusDirectText = async (
  message: string,
  options: {
    anthropicModel: string
    anthropicFallbackModel: string
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    legalContext?: UserLegalContext
    accountType?: AccountType
    systemPrompt?: string
    maxTokens?: number
  }
) => {
  const client = createPremiumPlusAnthropic()
  const systemPrompt = buildPremiumPlusDirectSystemPrompt({
    ...options,
    latestQuestion: message,
  })
  return callPremiumPlusAnthropicText(
    client,
    options.anthropicModel,
    options.anthropicFallbackModel,
    systemPrompt,
    message,
    options.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
    'premium_plus_direct'
  )
}

const streamPremiumPlusDirectText = async (
  message: string,
  options: {
    anthropicModel: string
    anthropicFallbackModel: string
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    legalContext?: UserLegalContext
    accountType?: AccountType
    systemPrompt?: string
    maxTokens?: number
    onToken?: (chunk: string) => void
  }
) => {
  const client = createPremiumPlusAnthropic()
  const systemPrompt = buildPremiumPlusDirectSystemPrompt({
    ...options,
    latestQuestion: message,
  })
  return streamPremiumPlusAnthropicTextWithAutoContinue(
    client,
    options.anthropicModel,
    options.anthropicFallbackModel,
    systemPrompt,
    [{ role: 'user', content: message }],
    options.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
    'premium_plus_direct_stream',
    options.onToken
  )
}

const extractAnthropicTextContent = (content: any): string => {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => String(block?.text || ''))
    .join('')
    .trim()
}

const extractAnthropicToolUseBlocks = (content: any): Array<{ id: string; name: string; input: Record<string, any> }> => {
  if (!Array.isArray(content)) return []
  return content
    .filter((block: any) => block?.type === 'tool_use' && typeof block?.id === 'string' && typeof block?.name === 'string')
    .map((block: any) => ({
      id: block.id,
      name: block.name,
      input: block?.input && typeof block.input === 'object' ? block.input as Record<string, any> : {},
    }))
}

const mapPremiumPlusCaseLawItem = (row: any, index: number) => {
  const title = premiumPlusFirstDefinedString(row?.title, row?.case_name, row?.name) || `Authority ${index + 1}`
  const citation = premiumPlusFirstDefinedString(row?.citation, row?.neutralCitation, row?.neutral_citation) || `Authority ${index + 1}`
  const summary = premiumPlusTruncate(premiumPlusCompact(String(row?.summary || row?.snippet || row?.excerpt || '')), 320)
  const extracts = premiumPlusTruncate(premiumPlusCompact(String(row?.extracts || '')), 420)
  const url = premiumPlusFirstDefinedString(row?.url, row?.link) || ''
  return {
    citation,
    title,
    summary,
    extracts,
    url,
  }
}

const executePremiumPlusWebSearch = async (
  query: string,
  mode: LegalSearchMode,
  engine: SearchEngine,
  legalContext?: UserLegalContext
): Promise<PremiumPlusToolExecutionResult> => {
  const searchTool = new SearchTool({
    engine,
    countryCode: getSearchCountryCode(legalContext),
  })
  const searchPayload = JSON.stringify({
    query: buildJurisdictionAwareSearchQuery(query, legalContext),
    mode,
    engine,
    countryCode: getSearchCountryCode(legalContext),
  })
  const raw = await searchTool._call(searchPayload)
  const parsed = JSON.parse(raw) as SearchToolOutput
  const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((item): item is string => typeof item === 'string') : []
  const packet = typeof parsed.packet === 'string' ? parsed.packet : raw
  const sourceBlock = sources.length > 0
    ? `Sources:\n${sources.map((url, index) => `[${index + 1}] ${url}`).join('\n')}\n\n`
    : ''

  return {
    content: `${sourceBlock}${premiumPlusTruncate(packet, 7000)}`.trim(),
    sources,
  }
}

const executePremiumPlusCaseLawSearch = async (
  query: string,
  scope: 'suggestions' | 'analysis' | 'both',
  limit: number,
  legalContext?: UserLegalContext
): Promise<PremiumPlusToolExecutionResult> => {
  if (!isUnitedKingdomContext(legalContext) && !isUnitedStatesContext(legalContext)) {
    return {
      content: 'Case-law retrieval is not available for this legal jurisdiction.',
    }
  }

  const runtimeSearch = await searchCaseLawWithFallback(query, Math.max(6, limit * 3), {
    legalContext,
  })
  const rawResults = runtimeSearch.results

  const mapped = Array.isArray(rawResults)
    ? rawResults.slice(0, limit).map((row, index) => mapPremiumPlusCaseLawItem(row, index))
    : []

  if (mapped.length === 0) {
    return {
      content: runtimeSearch.warning
        ? 'Case-law retrieval fallback did not return any closely relevant authorities.'
        : 'No closely relevant case-law results were found.',
    }
  }

  const lines: string[] = runtimeSearch.warning
    ? ['Case-law fallback results:', `Note: ${runtimeSearch.warning}`]
    : ['Case-law results:']
  mapped.forEach((item, index) => {
    lines.push(`[${index + 1}] ${item.citation} - ${item.title}`)
    if (scope !== 'suggestions' && item.summary) lines.push(`Summary: ${item.summary}`)
    if (scope !== 'suggestions' && item.extracts) lines.push(`Extract: ${item.extracts}`)
    if (item.url) lines.push(`URL: ${item.url}`)
  })

  return {
    content: premiumPlusTruncate(lines.join('\n'), 5000),
  }
}

const executePremiumPlusToolCall = async (
  toolName: string,
  args: Record<string, any>,
  searchEngineOverride: SearchEngine,
  legalContext?: UserLegalContext,
  accountType?: AccountType,
  consumeSearchQuota?: () => Promise<SearchQuotaResult>,
  consumeCaseLawRetrievalQuota?: () => Promise<CaseLawRetrievalQuotaResult>,
  caseLawRetrievalLimitNotice?: (resetsAt: string | null | undefined) => string
): Promise<PremiumPlusToolExecutionResult> => {
  if (toolName === 'web_search') {
    const query = String(args.query || '').trim()
    const mode = normalizeLegalSearchMode(args.mode) || 'general'
    if (!query) return { content: 'Web search was skipped because no query was provided.' }
    if (consumeSearchQuota) {
      try {
        const quota = await consumeSearchQuota()
        if (!quota?.allowed) {
          return {
            content: 'Web search is unavailable because the search limit has been reached. Continue from general context and any available uploaded documents.',
          }
        }
      } catch (error) {
        console.warn('Premium+ web search quota check failed; skipping web search.', error)
        return {
          content: 'Web search is temporarily unavailable. Continue from general context and any available uploaded documents.',
        }
      }
    }
    return executePremiumPlusWebSearch(query, mode, searchEngineOverride, legalContext)
  }

  if (toolName === 'case_law_search') {
    if (consumeCaseLawRetrievalQuota) {
      try {
        const quota = await consumeCaseLawRetrievalQuota()
        if (!quota?.allowed) {
          return {
            content: caseLawRetrievalLimitNotice
              ? caseLawRetrievalLimitNotice(quota?.resetsAt)
              : 'Case-law retrieval is unavailable because the daily retrieval limit has been reached.',
          }
        }
      } catch (error) {
        console.warn('Case-law retrieval quota check failed; skipping case-law retrieval.', error)
        return {
          content: 'Case-law retrieval is temporarily unavailable. Continue from general context and web sources where available.',
        }
      }
    }

    const query = String(args.query || '').trim()
    const scopeRaw = String(args.scope || 'both').trim().toLowerCase()
    let scope: 'suggestions' | 'analysis' | 'both' =
      scopeRaw === 'suggestions' || scopeRaw === 'analysis' || scopeRaw === 'both'
        ? scopeRaw
        : 'both'
    const maxLimit = accountType === 'business' ? 5 : PREMIUM_PLUS_LITIGANT_CASE_LAW_MAX_LIMIT
    if (accountType !== 'business' && scope === 'analysis') {
      scope = 'both'
    }
    const limit = Number.isFinite(Number(args.limit))
      ? Math.max(1, Math.min(maxLimit, Math.floor(Number(args.limit))))
      : (accountType === 'business' ? 5 : PREMIUM_PLUS_LITIGANT_CASE_LAW_DEFAULT_LIMIT)
    if (!query) return { content: 'Case-law search was skipped because no query was provided.' }
    return executePremiumPlusCaseLawSearch(query, scope, limit, legalContext)
  }

  return {
    content: `Tool ${toolName} is not available.`,
  }
}

const buildPremiumPlusAnthropicRequest = (
  modelName: string,
  systemPrompt: string,
  messages: PremiumPlusAnthropicMessage[],
  options?: {
    toolsEnabled?: boolean
    maxTokens?: number
    promptCachingEnabled?: boolean
    legalContext?: UserLegalContext | null
  }
) => {
  const promptCachingEnabled = options?.promptCachingEnabled !== false && premiumPlusPromptCachingEnabled()
  const payload: Record<string, any> = {
    model: modelName,
    system: buildPremiumPlusAnthropicSystemBlocks(systemPrompt, promptCachingEnabled),
    messages,
    max_tokens: Math.max(256, Math.floor(options?.maxTokens || PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS)),
    temperature: 0.2,
  }

  if (options?.toolsEnabled) {
    payload.tools = buildPremiumPlusAnthropicTools(promptCachingEnabled, options.legalContext)
    payload.tool_choice = { type: 'auto' }
  }

  return {
    payload,
    requestOptions: promptCachingEnabled
      ? {
          headers: {
            'anthropic-beta': PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING_BETA,
          },
        }
      : undefined,
  }
}

const callPremiumPlusAnthropic = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  messages: PremiumPlusAnthropicMessage[],
  options?: {
    toolsEnabled?: boolean
    maxTokens?: number
    requestType?: string
    legalContext?: UserLegalContext | null
  }
) => {
  const runModel = async (modelName: string) => {
    const startedAt = Date.now()
    try {
      const executeRequest = async (promptCachingEnabled: boolean) => {
        const { payload, requestOptions } = buildPremiumPlusAnthropicRequest(modelName, systemPrompt, messages, {
          ...options,
          promptCachingEnabled,
        })
        return client.messages.create(payload as any, requestOptions as any)
      }

      let response: any
      try {
        response = await executeRequest(true)
      } catch (error: any) {
        if (!premiumPlusPromptCachingEnabled() || !isPremiumPlusPromptCachingUnsupportedError(error)) {
          throw error
        }
        console.warn('Premium+ Anthropic prompt caching unavailable, retrying without cache hints', {
          model: modelName,
          requestType: options?.requestType,
        })
        response = await executeRequest(false)
      }

      logClaudeUsage({
        model: modelName,
        usage: response?.usage,
        success: true,
        latencyMs: Date.now() - startedAt,
        requestType: options?.requestType,
        endpoint: 'messages.create',
      })
      return response
    } catch (error: any) {
      logClaudeUsage({
        model: modelName,
        success: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        requestType: options?.requestType,
        endpoint: 'messages.create',
      })
      throw error
    }
  }

  try {
    return await runModel(model)
  } catch (primaryError) {
    if (fallbackModel && fallbackModel !== model) {
      console.error('Premium+ Anthropic primary model failed, trying fallback model', {
        primaryModel: model,
        fallbackModel,
      })
      return await runModel(fallbackModel)
    }
    throw primaryError
  }
}

const streamPremiumPlusAnthropic = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  messages: PremiumPlusAnthropicMessage[],
  options?: {
    maxTokens?: number
    requestType?: string
    onToken?: (chunk: string) => void
  }
): Promise<PremiumPlusAnthropicTextResult> => {
  const runModel = async (modelName: string) => {
    const startedAt = Date.now()
    let streamedText = ''
    try {
      const startStream = (promptCachingEnabled: boolean) => {
        const { payload, requestOptions } = buildPremiumPlusAnthropicRequest(modelName, systemPrompt, messages, {
          toolsEnabled: false,
          maxTokens: options?.maxTokens,
          promptCachingEnabled,
        })
        return client.messages.stream(payload as any, requestOptions as any)
      }

      let stream: any
      try {
        stream = startStream(true)
      } catch (error: any) {
        if (!premiumPlusPromptCachingEnabled() || !isPremiumPlusPromptCachingUnsupportedError(error)) {
          throw error
        }
        console.warn('Premium+ Anthropic prompt caching unavailable for stream, retrying without cache hints', {
          model: modelName,
          requestType: options?.requestType,
        })
        stream = startStream(false)
      }

      stream.on('text', (text: string) => {
        if (!text) return
        streamedText += text
        options?.onToken?.(text)
      })
      const finalMessage = await stream.finalMessage()
      logClaudeUsage({
        model: modelName,
        usage: (finalMessage as any)?.usage,
        success: true,
        latencyMs: Date.now() - startedAt,
        requestType: options?.requestType,
        endpoint: 'messages.stream',
      })
      return {
        text: extractAnthropicTextContent((finalMessage as any)?.content) || streamedText,
        stopReason: String((finalMessage as any)?.stop_reason || '').trim() || null,
      }
    } catch (error: any) {
      logClaudeUsage({
        model: modelName,
        success: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        requestType: options?.requestType,
        endpoint: 'messages.stream',
      })
      throw { error, streamedText }
    }
  }

  try {
    return await runModel(model)
  } catch (primaryFailure: any) {
    const emittedText = typeof primaryFailure?.streamedText === 'string' && primaryFailure.streamedText.length > 0
    if (!emittedText && fallbackModel && fallbackModel !== model) {
      console.error('Premium+ Anthropic primary stream failed, trying fallback model', {
        primaryModel: model,
        fallbackModel,
      })
      return await runModel(fallbackModel)
    }
    throw primaryFailure?.error || primaryFailure
  }
}

const callPremiumPlusAnthropicText = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  prompt: string,
  maxTokens: number,
  requestType: string,
  maxAutoContinues: number = PREMIUM_PLUS_MAX_AUTO_CONTINUES
) => {
  let completion = await callPremiumPlusAnthropic(
    client,
    model,
    fallbackModel,
    systemPrompt,
    [{ role: 'user', content: prompt }],
    {
      toolsEnabled: false,
      maxTokens,
      requestType,
    }
  )

  let combinedText = extractAnthropicTextContent((completion as any)?.content)
  let stopReason = String((completion as any)?.stop_reason || '').trim().toLowerCase()
  let continueCount = 0
  const continuationLimit = Math.max(0, Math.floor(maxAutoContinues))

  while (
    continueCount < continuationLimit &&
    combinedText.trim() &&
    (stopReason === 'max_tokens' || stopReason === 'end_turn' || !stopReason) &&
    (stopReason === 'max_tokens' || endsMidSentenceOrSection(combinedText))
  ) {
    completion = await callPremiumPlusAnthropic(
      client,
      model,
      fallbackModel,
      systemPrompt,
      [
        { role: 'user', content: prompt },
        { role: 'assistant', content: combinedText },
        { role: 'user', content: PREMIUM_PLUS_CONTINUATION_PROMPT },
      ],
      {
        toolsEnabled: false,
        maxTokens,
        requestType: `${requestType}_continue`,
      }
    )
    const continuation = extractAnthropicTextContent((completion as any)?.content)
    if (!continuation.trim()) break
    combinedText = `${combinedText}\n${continuation}`.trim()
    stopReason = String((completion as any)?.stop_reason || '').trim().toLowerCase()
    continueCount += 1
  }

  return combinedText
}

const streamPremiumPlusAnthropicTextWithAutoContinue = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  initialMessages: PremiumPlusAnthropicMessage[],
  maxTokens: number,
  requestType: string,
  onToken?: (chunk: string) => void,
  maxAutoContinues: number = PREMIUM_PLUS_MAX_AUTO_CONTINUES
): Promise<string> => {
  let result = await streamPremiumPlusAnthropic(
    client,
    model,
    fallbackModel,
    systemPrompt,
    initialMessages,
    {
      maxTokens,
      requestType,
      onToken,
    }
  )

  let combinedText = result.text || ''
  let stopReason = String(result.stopReason || '').trim().toLowerCase()
  let continueCount = 0
  const continuationLimit = Math.max(0, Math.floor(maxAutoContinues))

  while (
    continueCount < continuationLimit &&
    combinedText.trim() &&
    (stopReason === 'max_tokens' || stopReason === 'end_turn' || !stopReason) &&
    (stopReason === 'max_tokens' || endsMidSentenceOrSection(combinedText))
  ) {
    result = await streamPremiumPlusAnthropic(
      client,
      model,
      fallbackModel,
      systemPrompt,
      [
        ...initialMessages,
        { role: 'assistant', content: combinedText },
        { role: 'user', content: PREMIUM_PLUS_CONTINUATION_PROMPT },
      ],
      {
        maxTokens,
        requestType: `${requestType}_continue`,
        onToken,
      }
    )
    if (!result.text.trim()) break
    combinedText = `${combinedText}\n${result.text}`.trim()
    stopReason = String(result.stopReason || '').trim().toLowerCase()
    continueCount += 1
  }

  return combinedText
}

const emitSyntheticStream = (text: string, onToken?: (chunk: string) => void) => {
  if (!text) return
  for (const chunk of text.match(/.{1,24}/g) || []) {
    onToken?.(chunk)
  }
}

const describePremiumPlusToolStatus = (toolNames: string[]) => {
  const hasWebSearch = toolNames.includes('web_search')
  const hasCaseLaw = toolNames.includes('case_law_search')

  if (hasWebSearch && hasCaseLaw) {
    return 'Checking web sources and retrieving case law...'
  }
  if (hasWebSearch) {
    return 'Checking web sources...'
  }
  if (hasCaseLaw) {
    return 'Retrieving case law...'
  }
  return 'Thinking...'
}

const runPremiumPlusToolLoop = async (
  prompt: string,
  options: {
    anthropicModel: string
    anthropicFallbackModel: string
    searchEngineOverride: SearchEngine
    legalContext?: UserLegalContext
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    onStatus?: (status: string) => void
    accountType?: AccountType
    systemPrompt?: string
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    consumeCaseLawRetrievalQuota?: () => Promise<CaseLawRetrievalQuotaResult>
    caseLawRetrievalLimitNotice?: (resetsAt: string | null | undefined) => string
  }
): Promise<PremiumPlusToolLoopState> => {
  const client = createPremiumPlusAnthropic()
  const contextLines = buildPremiumPlusContextLines({
    ...options,
    latestQuestion: prompt,
  })
  const systemPrompt = applyLegalContextToSystemPrompt(
    buildPremiumPlusAnthropicSystemPrompt(contextLines, options.accountType, options.legalContext, options.systemPrompt),
    options.legalContext
  )
  const messages: PremiumPlusAnthropicMessage[] = [{ role: 'user', content: prompt }]
  const aggregatedSources: string[] = []
  const usedTools: string[] = []

  for (let round = 0; round < PREMIUM_PLUS_TOOL_LOOP_LIMIT; round += 1) {
    const completion = await callPremiumPlusAnthropic(
      client,
      options.anthropicModel,
      options.anthropicFallbackModel,
      systemPrompt,
      messages,
      {
        toolsEnabled: true,
        maxTokens: PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS,
        requestType: 'premium_plus_tool_loop',
        legalContext: options.legalContext,
      }
    ) as any

    const assistantContent = Array.isArray(completion?.content)
      ? completion.content as Array<Record<string, any>>
      : []

    if (assistantContent.length === 0) break

    messages.push({
      role: 'assistant',
      content: assistantContent,
    })

    const toolUses = extractAnthropicToolUseBlocks(assistantContent)
    if (toolUses.length === 0) {
      return {
        messages,
        sources: aggregatedSources,
        directResponse: extractAnthropicTextContent(assistantContent),
        toolsUsed: usedTools,
        systemPrompt,
      }
    }

    options.onStatus?.(describePremiumPlusToolStatus(toolUses.map((toolUse) => toolUse.name)))

    const executedToolResults = await Promise.all(
      toolUses.map(async (toolUse) => ({
        toolUse,
        result: await executePremiumPlusToolCall(
          toolUse.name,
          toolUse.input,
          options.searchEngineOverride,
          options.legalContext,
          options.accountType,
          options.consumeSearchQuota,
          options.consumeCaseLawRetrievalQuota,
          options.caseLawRetrievalLimitNotice
        ),
      }))
    )

    const toolResults: Array<Record<string, any>> = []
    for (const { toolUse, result } of executedToolResults) {
      if (Array.isArray(result.sources)) {
        for (const source of result.sources) {
          if (!aggregatedSources.includes(source)) aggregatedSources.push(source)
        }
      }
      usedTools.push(toolUse.name)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
      })
    }

    if (toolResults.length > 0) {
      messages.push({
        role: 'user',
        content: toolResults,
      })
    }
  }

  return {
    messages,
    sources: aggregatedSources,
    directResponse: '',
    toolsUsed: usedTools,
    systemPrompt,
  }
}

const runPremiumPlusToolLoopOpenAiFallback = async (
  prompt: string,
  options: {
    openaiModel: string
    openaiFallbackModel: string
    searchEngineOverride: SearchEngine
    legalContext?: UserLegalContext
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    onStatus?: (status: string) => void
    accountType?: AccountType
    systemPrompt?: string
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    consumeCaseLawRetrievalQuota?: () => Promise<CaseLawRetrievalQuotaResult>
    caseLawRetrievalLimitNotice?: (resetsAt: string | null | undefined) => string
  }
): Promise<PremiumPlusToolLoopState> => {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    return {
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'openai_fallback_unavailable', content: 'OpenAI fallback is unavailable because OPENAI_API_KEY is not set.' }] }],
      sources: [],
      directResponse: '',
      toolsUsed: [],
      systemPrompt: applyLegalContextToSystemPrompt(
        buildPremiumPlusAnthropicSystemPrompt(buildPremiumPlusContextLines({
          ...options,
          latestQuestion: prompt,
        }), options.accountType, options.legalContext, options.systemPrompt),
        options.legalContext
      ),
    }
  }

  const openai = new OpenAI({ apiKey })
  const contextLines = buildPremiumPlusContextLines({
    ...options,
    latestQuestion: prompt,
  })
  const systemPrompt = applyLegalContextToSystemPrompt(
    buildPremiumPlusAnthropicSystemPrompt(contextLines, options.accountType, options.legalContext, options.systemPrompt),
    options.legalContext
  )
  const messages: PremiumPlusAnthropicMessage[] = [{ role: 'user', content: prompt }]
  const aggregatedSources: string[] = []
  const usedTools: string[] = []
  let forcedFallbackToolRoundUsed = false
  const openAiMessages: Array<Record<string, any>> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ]
  const openAiTools = [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search current web sources for legal guidance, procedure, deadlines, forms, and practical context.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string' },
            mode: {
              type: 'string',
              enum: ['education', 'procedure', 'case_specific', 'document_review', 'general'],
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'case_law_search',
        description: 'Retrieve case-law authorities, summaries, and extracts relevant to the user conversation or query.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string' },
            scope: {
              type: 'string',
              enum: ['suggestions', 'analysis', 'both'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['query'],
        },
      },
    },
  ] as const
  const tools = options.legalContext?.countryCode === 'US'
    ? (hasUsCaseLawVectorConfig()
      ? [...openAiTools]
      : openAiTools.filter((tool) => tool.function.name !== 'case_law_search'))
    : [...openAiTools]

  const runOpenAiOnce = async (modelName: string) => {
    const normalized = modelName.trim().toLowerCase()
    const payload: Record<string, any> = {
      model: modelName,
      messages: openAiMessages,
      tools,
      tool_choice: 'auto',
    }
    if (normalized.startsWith('o') || normalized.startsWith('gpt-5')) {
      payload.max_completion_tokens = PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
    } else {
      payload.max_tokens = PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
      payload.temperature = 0.2
    }
    try {
      return await openai.chat.completions.create(payload as any)
    } catch (error: any) {
      const unsupportedTokenParam =
        error?.code === 'unsupported_parameter' &&
        (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
      if (!unsupportedTokenParam) throw error
      if ('max_tokens' in payload) {
        delete payload.max_tokens
        payload.max_completion_tokens = PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
      } else {
        delete payload.max_completion_tokens
        payload.max_tokens = PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
      }
      return await openai.chat.completions.create(payload as any)
    }
  }

  const runOpenAiWithFallback = async () => {
    try {
      return await runOpenAiOnce(options.openaiModel)
    } catch (primaryError) {
      if (options.openaiFallbackModel && options.openaiFallbackModel !== options.openaiModel) {
        console.error('Premium+ OpenAI fallback primary model failed, trying fallback model', {
          primaryModel: options.openaiModel,
          fallbackModel: options.openaiFallbackModel,
        })
        return await runOpenAiOnce(options.openaiFallbackModel)
      }
      throw primaryError
    }
  }

  for (let round = 0; round < PREMIUM_PLUS_TOOL_LOOP_LIMIT; round += 1) {
    const completion: any = await runOpenAiWithFallback()
    const assistantMessage = completion?.choices?.[0]?.message || {}
    const assistantText = String(assistantMessage?.content || '').trim()
    const toolCalls: any[] = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : []
    const shouldForceFallbackTools =
      toolCalls.length === 0 &&
      isPremiumPlusPlaceholderResponse(assistantText) &&
      usedTools.length === 0 &&
      !forcedFallbackToolRoundUsed
    const effectiveToolCalls = toolCalls.length > 0
      ? toolCalls
      : shouldForceFallbackTools
        ? buildPremiumPlusForcedFallbackToolCalls(prompt).map((toolCall) => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.input),
            },
          }))
        : []
    if (shouldForceFallbackTools) forcedFallbackToolRoundUsed = true

    openAiMessages.push({
      role: 'assistant',
      content: toolCalls.length === 0 && effectiveToolCalls.length > 0 ? '' : assistantMessage?.content || '',
      tool_calls: effectiveToolCalls.length > 0 ? effectiveToolCalls : undefined,
    })

    if (effectiveToolCalls.length === 0 && !isPremiumPlusPlaceholderResponse(assistantText)) {
      return {
        messages,
        sources: aggregatedSources,
        directResponse: assistantText,
        toolsUsed: usedTools,
        systemPrompt,
      }
    }
    if (effectiveToolCalls.length === 0) {
      return {
        messages,
        sources: aggregatedSources,
        directResponse: '',
        toolsUsed: usedTools,
        systemPrompt,
      }
    }

    const normalizedToolCalls: Array<{ id: string; name: string; input: Record<string, any> }> = effectiveToolCalls
      .map((toolCall: any) => {
        const id = String(toolCall?.id || '').trim()
        const toolName = String(toolCall?.function?.name || toolCall?.name || '').trim()
        const argsRaw = typeof toolCall?.function?.arguments === 'string'
          ? toolCall.function.arguments
          : JSON.stringify(toolCall?.input || {})
        if (!id || !toolName) return null
        let input: Record<string, any> = {}
        try {
          const parsed = JSON.parse(argsRaw)
          input = parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
          input = {}
        }
        return { id, name: toolName, input }
      })
      .filter((item: { id: string; name: string; input: Record<string, any> } | null): item is { id: string; name: string; input: Record<string, any> } => Boolean(item))

    messages.push({
      role: 'assistant',
      content: normalizedToolCalls.map((item: { id: string; name: string; input: Record<string, any> }) => ({
        type: 'tool_use',
        id: item.id,
        name: item.name,
        input: item.input,
      })),
    })
    options.onStatus?.(describePremiumPlusToolStatus(normalizedToolCalls.map((item: { id: string; name: string; input: Record<string, any> }) => item.name)))

    const executedToolResults: Array<{ toolUse: { id: string; name: string; input: Record<string, any> }; result: PremiumPlusToolExecutionResult }> = await Promise.all(
      normalizedToolCalls.map(async (toolUse: { id: string; name: string; input: Record<string, any> }) => {
        try {
          const result = await executePremiumPlusToolCall(
            toolUse.name,
            toolUse.input,
            options.searchEngineOverride,
            options.legalContext,
            options.accountType,
            options.consumeSearchQuota,
            options.consumeCaseLawRetrievalQuota,
            options.caseLawRetrievalLimitNotice
          )
          return { toolUse, result }
        } catch (error: any) {
          return {
            toolUse,
            result: {
              content: `Tool ${toolUse.name} failed: ${error instanceof Error ? error.message : String(error)}`,
            } as PremiumPlusToolExecutionResult,
          }
        }
      })
    )

    messages.push({
      role: 'user',
      content: executedToolResults.map(({ toolUse, result }) => {
        if (Array.isArray(result.sources)) {
          for (const source of result.sources) {
            if (!aggregatedSources.includes(source)) aggregatedSources.push(source)
          }
        }
        usedTools.push(toolUse.name)
        openAiMessages.push({
          role: 'tool',
          tool_call_id: toolUse.id,
          content: result.content,
        })
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
        }
      }),
    })
  }

  return {
    messages,
    sources: aggregatedSources,
    directResponse: '',
    toolsUsed: usedTools,
    systemPrompt,
  }
}

export async function invokePremiumPlusLegalAgent(
  message: string,
  _threadId: string,
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    legalContext?: UserLegalContext
    anthropicModel?: string
    anthropicFallbackModel?: string
    openaiFallbackModel?: string
    forceOpenAiFallback?: boolean
    maxTokens?: number
    maxCompressionRetries?: number
    accountType?: AccountType
    systemPrompt?: string
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    consumeCaseLawRetrievalQuota?: () => Promise<CaseLawRetrievalQuotaResult>
    caseLawRetrievalLimitNotice?: (resetsAt: string | null | undefined) => string
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }>; verifiedAuthorities?: VerifiedAuthority[] }> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  const useOpenAiFallback = options?.forceOpenAiFallback === true || !apiKey
  const openAiFallbackModel = (options?.openaiFallbackModel || OPENAI_PREMIUM_PLUS_FALLBACK_MODEL).trim() || OPENAI_PREMIUM_PLUS_FALLBACK_MODEL

  const trimmedHistory = sanitizeConversationHistory(
    conversationHistory,
    resolveConversationHistoryLimit(options?.historyLimit)
  )
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const latestQuestion = (message || '').trim()

  if (isBasicGreeting(latestQuestion)) {
    return {
      response: "Hello! I'm MyMcKenzie Assistant. How can I help with your legal question?",
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  if (wantsDocumentDraftRequest(latestQuestion)) {
    const contextForTools = `${memoryContext}${buildHistoryContext(trimmedHistory, latestQuestion)}${latestQuestion}`
    const docResult = await new DocGeneratorTool()._call(contextForTools)
    return {
      response: stripMarkdown(docResult).trim(),
      document_generated: true,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const anthropicModel = options?.anthropicModel || PREMIUM_PLUS_ANTHROPIC_MODEL
  const anthropicFallbackModel = options?.anthropicFallbackModel || PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = (options?.autoDecideSearch ?? true) && explicitUseSearch === undefined
  const shouldUseDirectOnly =
    explicitUseSearch === false ||
    (autoDecideSearch && shouldPreferPremiumPlusDirectAnswer(message))

  if (shouldUseDirectOnly) {
    const directText = useOpenAiFallback
      ? await callLLM(
          message,
          buildPremiumPlusDirectSystemPrompt({
            conversationHistory,
            caseKeywords,
            memoryContext: options?.memoryContext,
            historyLimit: options?.historyLimit,
            legalContext: options?.legalContext,
            accountType: options?.accountType,
            systemPrompt: options?.systemPrompt,
            latestQuestion: message,
          }),
          openAiFallbackModel,
          options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
          openAiFallbackModel,
          true,
          PREMIUM_PLUS_MAX_AUTO_CONTINUES
        )
      : await callPremiumPlusDirectText(message, {
          anthropicModel,
          anthropicFallbackModel,
          conversationHistory,
          caseKeywords,
          memoryContext: options?.memoryContext,
          historyLimit: options?.historyLimit,
          legalContext: options?.legalContext,
          accountType: options?.accountType,
          systemPrompt: options?.systemPrompt,
        })

    return {
      response: neutralizeLegalAdviceTone(
        stripMarkdown(stripUrlsFromText(directText || "I couldn't generate a response."))
      ),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  const toolLoop = useOpenAiFallback
    ? await runPremiumPlusToolLoopOpenAiFallback(message, {
        openaiModel: openAiFallbackModel,
        openaiFallbackModel: openAiFallbackModel,
        searchEngineOverride: options?.searchEngineOverride || 'perplexity',
        legalContext: options?.legalContext,
        conversationHistory,
        caseKeywords,
        memoryContext: options?.memoryContext,
        historyLimit: options?.historyLimit,
        accountType: options?.accountType,
        systemPrompt: options?.systemPrompt,
        consumeSearchQuota: options?.consumeSearchQuota,
        consumeCaseLawRetrievalQuota: options?.consumeCaseLawRetrievalQuota,
        caseLawRetrievalLimitNotice: options?.caseLawRetrievalLimitNotice,
      })
    : await runPremiumPlusToolLoop(message, {
        anthropicModel,
        anthropicFallbackModel,
        searchEngineOverride: options?.searchEngineOverride || 'perplexity',
        legalContext: options?.legalContext,
        conversationHistory,
        caseKeywords,
        memoryContext: options?.memoryContext,
        historyLimit: options?.historyLimit,
        accountType: options?.accountType,
        systemPrompt: options?.systemPrompt,
        consumeSearchQuota: options?.consumeSearchQuota,
        consumeCaseLawRetrievalQuota: options?.consumeCaseLawRetrievalQuota,
        caseLawRetrievalLimitNotice: options?.caseLawRetrievalLimitNotice,
      })
  const verifiedAuthorities = extractVerifiedAuthoritiesFromToolMessages(toolLoop.messages)
  const toolContext = extractPremiumPlusToolResultText(toolLoop.messages)

  if (toolLoop.directResponse) {
    const finalDirect = ensureCitationsForPremium(
      neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(toolLoop.directResponse))),
      toolLoop.sources,
      toolLoop.sources.length > 0
    )
    return {
      response: finalDirect.responseText,
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: finalDirect.sources,
      verifiedAuthorities,
    }
  }

  let finalText = ''
  if (useOpenAiFallback) {
    finalText = await generatePremiumPlusOpenAiFallbackFinalText({
      message,
      toolContext,
      systemPrompt: buildPremiumPlusDirectSystemPrompt({
        conversationHistory,
        caseKeywords,
        memoryContext: options?.memoryContext,
        historyLimit: options?.historyLimit,
        legalContext: options?.legalContext,
        accountType: options?.accountType,
        systemPrompt: options?.systemPrompt,
        latestQuestion: message,
      }),
      model: openAiFallbackModel,
      maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
    })
  } else {
    const client = createPremiumPlusAnthropic()
    const finalPromptMessages: PremiumPlusAnthropicMessage[] = [
      ...toolLoop.messages,
      {
        role: 'user',
        content: `${ANECDOTAL_SOURCE_INSTRUCTION} Now answer the user directly in plain text using any tool results already provided. Do not call any more tools. If you discuss a retrieved authority, put a short standalone line with its case name and citation immediately before the explanation.`,
      },
    ]
    let finalCompletion = await callPremiumPlusAnthropic(
      client,
      anthropicModel,
      anthropicFallbackModel,
      toolLoop.systemPrompt,
      finalPromptMessages,
      {
        toolsEnabled: false,
        maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
        requestType: 'premium_plus_final',
      }
    ) as any
    finalText = extractAnthropicTextContent(finalCompletion?.content)
    let continueCount = 0
    while (
      continueCount < PREMIUM_PLUS_MAX_AUTO_CONTINUES &&
      finalText.trim() &&
      (
        String(finalCompletion?.stop_reason || '').trim().toLowerCase() === 'max_tokens' ||
        String(finalCompletion?.stop_reason || '').trim().toLowerCase() === 'end_turn' ||
        !String(finalCompletion?.stop_reason || '').trim()
      ) &&
      (
        String(finalCompletion?.stop_reason || '').trim().toLowerCase() === 'max_tokens' ||
        endsMidSentenceOrSection(finalText)
      )
    ) {
      finalCompletion = await callPremiumPlusAnthropic(
        client,
        anthropicModel,
        anthropicFallbackModel,
        toolLoop.systemPrompt,
        [
          ...finalPromptMessages,
          { role: 'assistant', content: finalText },
          { role: 'user', content: PREMIUM_PLUS_CONTINUATION_PROMPT },
        ],
        {
          toolsEnabled: false,
          maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
          requestType: 'premium_plus_final_continue',
        }
      ) as any
      const continuation = extractAnthropicTextContent(finalCompletion?.content)
      if (!continuation.trim()) break
      finalText = `${finalText}\n${continuation}`.trim()
      continueCount += 1
    }
  }

  if (isPremiumPlusPlaceholderResponse(finalText)) {
    finalText = toolContext.trim()
      ? `I had trouble drafting the final answer. Here is the key information retrieved:\n\n${premiumPlusTruncate(toolContext, 2400)}`
      : "I'm having trouble generating a complete response right now. Please try again in a moment."
  }
  const final = ensureCitationsForPremium(
    neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(finalText || "I couldn't generate a response."))),
    toolLoop.sources,
    toolLoop.sources.length > 0
  )

  return {
    response: final.responseText,
    document_generated: false,
    guidance_provided: true,
    next_steps: [],
    sources: final.sources,
    verifiedAuthorities,
  }
}

export async function invokePremiumPlusLitigantLegalAgent(
  ...args: Parameters<typeof invokePremiumPlusLegalAgent>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumPlusLegalAgent(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'litigant' }
  )
}

export async function invokePremiumPlusProfessionalLegalAgent(
  ...args: Parameters<typeof invokePremiumPlusLegalAgent>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumPlusLegalAgent(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'business' }
  )
}

export async function invokePremiumPlusLegalAgentStream(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    legalContext?: UserLegalContext
    anthropicModel?: string
    anthropicFallbackModel?: string
    openaiFallbackModel?: string
    forceOpenAiFallback?: boolean
    maxTokens?: number
    maxCompressionRetries?: number
    onToken?: (chunk: string) => void
    onStatus?: (status: string) => void
    accountType?: AccountType
    systemPrompt?: string
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    consumeCaseLawRetrievalQuota?: () => Promise<CaseLawRetrievalQuotaResult>
    caseLawRetrievalLimitNotice?: (resetsAt: string | null | undefined) => string
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }>; verifiedAuthorities?: VerifiedAuthority[] }> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  const useOpenAiFallback = options?.forceOpenAiFallback === true || !apiKey
  const openAiFallbackModel = (options?.openaiFallbackModel || OPENAI_PREMIUM_PLUS_FALLBACK_MODEL).trim() || OPENAI_PREMIUM_PLUS_FALLBACK_MODEL

  const trimmedHistory = sanitizeConversationHistory(
    conversationHistory,
    resolveConversationHistoryLimit(options?.historyLimit)
  )
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const latestQuestion = (message || '').trim()

  if (isBasicGreeting(latestQuestion)) {
    return {
      response: "Hello! I'm MyMcKenzie Assistant. How can I help with your legal question?",
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  if (wantsDocumentDraftRequest(latestQuestion)) {
    const contextForTools = `${memoryContext}${buildHistoryContext(trimmedHistory, latestQuestion)}${latestQuestion}`
    const docResult = await new DocGeneratorTool()._call(contextForTools)
    emitSyntheticStream(stripMarkdown(docResult).trim(), options?.onToken)
    return {
      response: stripMarkdown(docResult).trim(),
      document_generated: true,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const anthropicModel = options?.anthropicModel || PREMIUM_PLUS_ANTHROPIC_MODEL
  const anthropicFallbackModel = options?.anthropicFallbackModel || PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = (options?.autoDecideSearch ?? true) && explicitUseSearch === undefined
  const shouldUseDirectOnly =
    explicitUseSearch === false ||
    (autoDecideSearch && shouldPreferPremiumPlusDirectAnswer(message))
  let lastStatus = ''
  const emitStatus = (status: string) => {
    const normalizedStatus = String(status || '').trim()
    if (!normalizedStatus || normalizedStatus === lastStatus) return
    lastStatus = normalizedStatus
    options?.onStatus?.(normalizedStatus)
  }

  if (shouldUseDirectOnly) {
    emitStatus('Drafting answer...')
    const directText = useOpenAiFallback
      ? await callLLM(
          message,
          buildPremiumPlusDirectSystemPrompt({
            conversationHistory,
            caseKeywords,
            memoryContext: options?.memoryContext,
            historyLimit: options?.historyLimit,
            legalContext: options?.legalContext,
            accountType: options?.accountType,
            systemPrompt: options?.systemPrompt,
            latestQuestion: message,
          }),
          openAiFallbackModel,
          options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
          openAiFallbackModel,
          true,
          PREMIUM_PLUS_MAX_AUTO_CONTINUES
        )
      : await streamPremiumPlusDirectText(message, {
          anthropicModel,
          anthropicFallbackModel,
          conversationHistory,
          caseKeywords,
          memoryContext: options?.memoryContext,
          historyLimit: options?.historyLimit,
          legalContext: options?.legalContext,
          accountType: options?.accountType,
          systemPrompt: options?.systemPrompt,
          maxTokens: options?.maxTokens,
          onToken: options?.onToken,
        })
    if (useOpenAiFallback) {
      emitSyntheticStream(directText, options?.onToken)
    }

    return {
      response: neutralizeLegalAdviceTone(
        stripMarkdown(stripUrlsFromText(directText || "I couldn't generate a response."))
      ),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  emitStatus('Thinking...')
  const toolLoop = useOpenAiFallback
    ? await runPremiumPlusToolLoopOpenAiFallback(message, {
        openaiModel: openAiFallbackModel,
        openaiFallbackModel: openAiFallbackModel,
        searchEngineOverride: options?.searchEngineOverride || 'perplexity',
        legalContext: options?.legalContext,
        conversationHistory,
        caseKeywords,
        memoryContext: options?.memoryContext,
        historyLimit: options?.historyLimit,
        accountType: options?.accountType,
        systemPrompt: options?.systemPrompt,
        onStatus: emitStatus,
        consumeSearchQuota: options?.consumeSearchQuota,
        consumeCaseLawRetrievalQuota: options?.consumeCaseLawRetrievalQuota,
        caseLawRetrievalLimitNotice: options?.caseLawRetrievalLimitNotice,
      })
    : await runPremiumPlusToolLoop(message, {
        anthropicModel,
        anthropicFallbackModel,
        searchEngineOverride: options?.searchEngineOverride || 'perplexity',
        legalContext: options?.legalContext,
        conversationHistory,
        caseKeywords,
        memoryContext: options?.memoryContext,
        historyLimit: options?.historyLimit,
        accountType: options?.accountType,
        systemPrompt: options?.systemPrompt,
        onStatus: emitStatus,
        consumeSearchQuota: options?.consumeSearchQuota,
        consumeCaseLawRetrievalQuota: options?.consumeCaseLawRetrievalQuota,
        caseLawRetrievalLimitNotice: options?.caseLawRetrievalLimitNotice,
      })
  const verifiedAuthorities = extractVerifiedAuthoritiesFromToolMessages(toolLoop.messages)
  const toolContext = extractPremiumPlusToolResultText(toolLoop.messages)

  if (toolLoop.directResponse) {
    const finalDirect = ensureCitationsForPremium(
      neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(toolLoop.directResponse))),
      toolLoop.sources,
      toolLoop.sources.length > 0
    )
    emitStatus('Writing answer...')
    emitSyntheticStream(finalDirect.responseText, options?.onToken)
    return {
      response: finalDirect.responseText,
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: finalDirect.sources,
      verifiedAuthorities,
    }
  }

  emitStatus('Drafting answer...')
  let finalText = useOpenAiFallback
    ? await (async () => {
        const text = await generatePremiumPlusOpenAiFallbackFinalText({
          message,
          toolContext,
          systemPrompt: buildPremiumPlusDirectSystemPrompt({
            conversationHistory,
            caseKeywords,
            memoryContext: options?.memoryContext,
            historyLimit: options?.historyLimit,
            legalContext: options?.legalContext,
            accountType: options?.accountType,
            systemPrompt: options?.systemPrompt,
            latestQuestion: message,
          }),
          model: openAiFallbackModel,
          maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
        })
        emitSyntheticStream(text, options?.onToken)
        return text
      })()
    : await (async () => {
        const client = createPremiumPlusAnthropic()
        return streamPremiumPlusAnthropicTextWithAutoContinue(
          client,
          anthropicModel,
          anthropicFallbackModel,
          toolLoop.systemPrompt,
          [
            ...toolLoop.messages,
            {
              role: 'user',
              content: `${ANECDOTAL_SOURCE_INSTRUCTION} Now answer the user directly in plain text using any tool results already provided. Do not call any more tools. If you discuss a retrieved authority, put a short standalone line with its case name and citation immediately before the explanation.`,
            },
          ],
          options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
          'premium_plus_final_stream',
          options?.onToken
        )
      })()
  if (isPremiumPlusPlaceholderResponse(finalText)) {
    finalText = toolContext.trim()
      ? `I had trouble drafting the final answer. Here is the key information retrieved:\n\n${premiumPlusTruncate(toolContext, 2400)}`
      : "I'm having trouble generating a complete response right now. Please try again in a moment."
    emitSyntheticStream(finalText, options?.onToken)
  }

  const final = ensureCitationsForPremium(
    neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(finalText || "I couldn't generate a response."))),
    toolLoop.sources,
    toolLoop.sources.length > 0
  )

  return {
    response: final.responseText,
    document_generated: false,
    guidance_provided: true,
    next_steps: [],
    sources: final.sources,
    verifiedAuthorities,
  }
}

export async function invokePremiumPlusLitigantLegalAgentStream(
  ...args: Parameters<typeof invokePremiumPlusLegalAgentStream>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumPlusLegalAgentStream(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'litigant' }
  )
}

export async function invokePremiumPlusProfessionalLegalAgentStream(
  ...args: Parameters<typeof invokePremiumPlusLegalAgentStream>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokePremiumPlusLegalAgentStream(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'business' }
  )
}

export async function invokeBasicLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    legalContext?: UserLegalContext
    consumeSearchQuota?: () => Promise<SearchQuotaResult>
    accountType?: AccountType
    systemPrompt?: string
  }
): Promise<{
  response: string
  document_generated: boolean
  guidance_provided: boolean
  next_steps: string[]
  sources?: Array<{ number: number; title: string; url: string }>
  basicDailySearchNotice?: string
}> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    useSearch: options?.useSearch,
    autoDecideSearch: options?.autoDecideSearch ?? options?.useSearch === undefined,
    includeCitations: true,
    caseAccessUserId: userId,
    systemPrompt: applyLegalContextToSystemPrompt(
      options?.systemPrompt || getFreePromptForAccount(options?.accountType),
      options?.legalContext
    ),
    legalContext: options?.legalContext,
    accountType: options?.accountType,
    memoryContext: options?.memoryContext,
    historyLimit: options?.historyLimit,
    searchQueryOverride: options?.searchQueryOverride,
    searchModeOverride: options?.searchModeOverride,
    searchEngineOverride: options?.searchEngineOverride || 'brave',
    consumeSearchQuota: options?.consumeSearchQuota,
    openaiModel: OPENAI_BASIC_MODEL,
    openaiFallbackModel: OPENAI_BASIC_FALLBACK_MODEL,
    maxTokens: BASIC_MAX_TOKENS,
    autoContinueOnLength: true,
    maxAutoContinues: BASIC_MAX_AUTO_CONTINUES,
  })
  const response = await agent.invoke({ input: message })
  return {
    response: response.response,
    document_generated: response.document_generated,
    guidance_provided: response.guidance_provided,
    next_steps: [],
    sources: response.sources,
    basicDailySearchNotice: response.basicDailySearchNotice,
  }
}

export async function invokeBasicLitigantLegalAgent(
  ...args: Parameters<typeof invokeBasicLegalAgent>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokeBasicLegalAgent(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'litigant' }
  )
}

export async function invokeBasicProfessionalLegalAgent(
  ...args: Parameters<typeof invokeBasicLegalAgent>
) {
  const [message, threadId, userId, conversationHistory, caseKeywords, options] = args
  return invokeBasicLegalAgent(
    message,
    threadId,
    userId,
    conversationHistory,
    caseKeywords,
    { ...(options || {}), accountType: 'business' }
  )
}
