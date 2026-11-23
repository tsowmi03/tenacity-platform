"use strict";

// RES-102. The resource assistant: the pre-generation chat (RES-24) turned
// into a helper that recommends what to make and how to structure it, and
// knows what the generator can do.
//
// Each turn runs a short Anthropic tool loop. The model may call the lookup
// tools in resourceCapabilities.js, then answers through the `respond` tool,
// whose input is the reply, an optional proposal for the whole job (type,
// answer section, marks, sections and brief) and suggested next messages. The
// portal shows the proposal as a card the tutor applies to the form.
//
// Like RES-24, nothing is stored: the portal holds the transcript and sends it
// back each turn. This module is pure apart from the injected client.

const { CHAT_LIMITS } = require("./chatPrompt");
const { RESOURCE_TYPE_DESCRIPTORS, descriptorFor } = require("./builder/descriptors");
const { LOOKUP_TOOLS, capabilitiesOverview, runLookupTool } = require("./resourceCapabilities");
const { assertNotRefused } = require("./apiClient");

const ASSISTANT_LIMITS = Object.freeze({
  maxRounds: 5,
  maxTokens: 4000,
  maxSections: 8,
  maxSectionChars: 80,
  maxProposalSummaryChars: 200,
  maxActivities: 6,
});

const ANSWER_MODES = ["none", "answers", "worked"];
const SUBJECTS = ["maths", "english"];

// Strict, so the reply always matches this schema.
const RESPOND_TOOL = Object.freeze({
  name: "respond",
  description: "Send your reply to the tutor. Call this exactly once, last, every turn.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    // The proposal comes first so the model settles it before writing the
    // reply: written after, a reply describing a resource often went out with
    // proposal null, leaving the tutor nothing to apply.
    properties: {
      proposal: {
        description: "The whole resource you recommend. Send it whenever your reply will recommend a resource or say what you've assumed for one, even if you also ask a question. Null only when the reply proposes nothing (a question before you know the topic, a plain answer about what's possible, or no change since your last proposal).",
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              subject: { type: "string", enum: SUBJECTS },
              resourceType: { type: "string", enum: Object.keys(RESOURCE_TYPE_DESCRIPTORS) },
              answerMode: { type: "string", enum: ANSWER_MODES },
              showMarks: { type: "boolean" },
              sections: {
                type: "array",
                items: { type: "string" },
                description: "Short names of the parts the resource will have, in order, using the type's real sections.",
              },
              brief: {
                type: "string",
                description: "The custom prompt for the generator: direct instructions in plain prose, under 1500 characters. Don't restate the student, year, subject, type, answer section or marks.",
              },
            },
            required: ["subject", "resourceType", "answerMode", "showMarks", "sections", "brief"],
          },
        ],
      },
      reply: {
        type: "string",
        description: "What you say to the tutor: conversational, under about 150 words, plain text. Simple numbered or \"•\" lists are fine; no headings or bold. If you sent a proposal, describe it here; the tutor sees it as a card below your reply.",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: `Up to ${CHAT_LIMITS.maxSuggestions} short replies the tutor might send next, each under 8 words.`,
      },
    },
    required: ["proposal", "reply", "suggestions"],
  },
});

const ANSWER_MODE_TEXT = {
  none: "no answer section",
  answers: "final answers only",
  worked: "fully worked solutions",
};

function subjectLabel(subject) {
  return subject === "english" ? "English" : "Maths";
}

function typeLabel(resourceType) {
  return descriptorFor(resourceType)?.label || null;
}

function clip(text, max) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function isoDate(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : value;
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "unknown date";
}

function historyLine(job) {
  const topics = Array.isArray(job.extractedTopics) && job.extractedTopics.length
    ? ` · topics: ${job.extractedTopics.slice(0, 6).join(", ")}`
    : "";
  const prompt = job.customPrompt ? ` · tutor asked for: "${clip(job.customPrompt, 160)}"` : "";
  return `- ${isoDate(job.createdAt)} · ${typeLabel(job.resourceType) || job.resourceType} (Year ${job.year} ${subjectLabel(job.subject)})${topics}${prompt}`;
}

function formLine(form) {
  const type = typeLabel(form.resourceType);
  const parts = [
    `subject ${subjectLabel(form.subject)}`,
    form.year ? `Year ${form.year}` : "year not set",
    type ? `type ${type}` : "no resource type chosen yet",
  ];
  if (type && descriptorFor(form.resourceType)?.hasQuestions) {
    parts.push(ANSWER_MODE_TEXT[form.answerMode] || ANSWER_MODE_TEXT.none);
    parts.push(`marks ${form.showMarks ? "shown" : "hidden"}`);
  }
  return parts.join(", ");
}

function buildAssistantSystemPrompt({ form, studentName, customPrompt, files, history }) {
  const fileLines = files.length
    ? files.map((file, i) => `${i + 1}. ${file.name}: ${file.summary}`).join("\n")
    : "None attached.";
  const historyLines = history.length ? history.map(historyLine).join("\n") : "No completed resources yet.";
  const student = `${studentName}${form.year ? `, a Year ${form.year} ${subjectLabel(form.subject)} student` : ""}`;

  return `You are the resource assistant for tutors at Tenacity Tutoring. You help a tutor decide what resource to make for ${student}, how to structure it, and write the brief the generator follows. You don't generate the resource yourself; the tutor submits it from the form.

What you do:
- Recommend the resource type that best fits what the tutor describes, even if it differs from the one on the form, and say why in a sentence.
- Suggest a structure using the type's real sections, and a length.
- Ask short clarifying questions only when you can't reasonably assume. As soon as you know the topic focus, make a proposal: say what you assumed and ask at most one question. Never ask about something the tutor has already told you.
- When the tutor asks for something the generator can't do, say so plainly and propose the closest thing it can do.
- Discuss freely if the tutor wants to think something through, or asks what's possible.

Proposals:
- A proposal is the whole job: subject, resource type, answer section, marks, sections and brief. The tutor applies it to the form in one click, so make every field right, not just the brief.
- Whenever your reply recommends a resource or says what you've assumed for one, send it as the proposal in the same turn. The tutor can only apply what's in the proposal, so never describe a resource without sending it, even if you also ask a question.
- A type without questions takes answerMode "none" and showMarks false.
- The brief is the generator's custom instructions: direct instructions in plain prose, under 1500 characters (hard limit ${CHAT_LIMITS.maxPromptChars}). Don't restate settings the form already carries.
- When revising, send the whole updated proposal. Send proposal null on turns where nothing changed.
- Keep the subject of the form unless the tutor asks to switch.

Ground rules:
- Check a type's sections with get_resource_types, and bank coverage or diagram types with their tools, before relying on them. Don't call a tool you've already called this conversation with the same input unless something changed.
- Base claims about the reference documents and past resources only on the context below. If something isn't there, say you can't see it.
- Use Australian English. Always finish by calling respond.

${capabilitiesOverview(form.subject)}

The form right now (the tutor may change it between messages; this is current): ${formLine(form)}.

Current custom prompt: ${customPrompt ? `"${customPrompt}"` : "(empty)"}

Reference documents (summaries):
${fileLines}

${studentName}'s recent completed resources, newest first:
${historyLines}`;
}

// The model needs a user turn to answer first. An older portal opens the chat
// with an empty transcript, so this stands in for the tutor's first message.
function openingMessage({ customPrompt }) {
  return customPrompt
    ? "I'd like to refine the current custom prompt. Briefly confirm what you're working from, then ask what I'd like to change."
    : "Let's plan this resource. Briefly summarise what you're working from, then ask your most important question.";
}

function proposalSummary(proposal) {
  if (!proposal) return "";
  const type = typeLabel(proposal.resourceType) || proposal.resourceType;
  const sections = proposal.sections?.length ? `; sections: ${proposal.sections.join(", ")}` : "";
  return `[My proposal: ${type}, ${subjectLabel(proposal.subject)}, ${ANSWER_MODE_TEXT[proposal.answerMode] || ANSWER_MODE_TEXT.none}, marks ${proposal.showMarks ? "shown" : "hidden"}${sections}. Brief: "${proposal.brief}"]`;
}

/**
 * The transcript as Anthropic messages. Earlier assistant turns are replayed as
 * text with their proposal written out, so the model sees what it proposed.
 * Consecutive same-role messages are merged: the API requires alternation.
 */
function buildAssistantMessages({ customPrompt, transcript }) {
  const messages = [];
  const push = (role, content) => {
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`;
    else messages.push({ role, content });
  };
  if (!transcript.length || transcript[0].role === "assistant") push("user", openingMessage({ customPrompt }));
  for (const message of transcript) {
    if (message.role === "assistant") {
      const proposal = message.proposal
        || (message.proposedPrompt ? { legacyBrief: message.proposedPrompt } : null);
      const extra = proposal?.legacyBrief
        ? `[My draft brief: "${proposal.legacyBrief}"]`
        : proposalSummary(proposal);
      push("assistant", [message.content, extra].filter(Boolean).join("\n\n"));
    } else {
      push("user", message.content);
    }
  }
  return messages;
}

/**
 * Checks a proposal against what the generator accepts. Anything it can't
 * repair is dropped (null) rather than handed to the form.
 */
function normaliseProposal(raw, { fallbackSubject = "maths" } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const resourceType = String(raw.resourceType || "");
  const descriptor = descriptorFor(resourceType);
  if (!descriptor) return null;
  let subject = SUBJECTS.includes(raw.subject) ? raw.subject : fallbackSubject;
  if (!descriptor.subjects.includes(subject)) {
    if (descriptor.subjects.length !== 1) return null;
    subject = descriptor.subjects[0];
  }
  const answerMode = descriptor.hasQuestions && ANSWER_MODES.includes(raw.answerMode) ? raw.answerMode : "none";
  const showMarks = descriptor.hasQuestions ? Boolean(raw.showMarks) : false;
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map((section) => clip(section, ASSISTANT_LIMITS.maxSectionChars))
        .filter(Boolean)
        .slice(0, ASSISTANT_LIMITS.maxSections)
    : [];
  const brief = String(raw.brief || "").trim().slice(0, CHAT_LIMITS.maxPromptChars);
  return { subject, resourceType, answerMode, showMarks, sections, brief };
}

function normaliseSuggestions(raw) {
  return Array.isArray(raw)
    ? raw
        .map((s) => String(s || "").trim())
        .filter((s) => s && s.length <= CHAT_LIMITS.maxSuggestionChars)
        .slice(0, CHAT_LIMITS.maxSuggestions)
    : [];
}

function normaliseAssistantReply(input, { fallbackSubject } = {}) {
  // The portal sends each reply back as part of the transcript, which is
  // validated at maxMessageChars; an over-long reply would block the next turn.
  const reply = String(input?.reply || "").trim().slice(0, CHAT_LIMITS.maxMessageChars);
  if (!reply) {
    const err = new Error("Resource assistant reply was empty");
    err.modelFailure = true;
    throw err;
  }
  const proposal = normaliseProposal(input?.proposal, { fallbackSubject });
  return {
    reply,
    proposal,
    // RES-24 portals read proposedPrompt; keep it until they've all updated.
    proposedPrompt: proposal?.brief || "",
    suggestions: normaliseSuggestions(input?.suggestions),
  };
}

function textOf(content) {
  return (Array.isArray(content) ? content : [])
    .filter((block) => block?.type === "text" && block.text)
    .map((block) => block.text)
    .join("")
    .trim();
}

// Sent on the last round: Sonnet 5.5 doesn't allow forcing a tool, so the
// model is told instead, and a plain-text answer is still accepted.
const FINAL_ROUND_INSTRUCTION = "You've used all your lookups for this turn. Reply now by calling respond, using what you already know; don't call any other tool.";

/**
 * One assistant turn: call the model, run any lookup tools it asks for, and
 * stop when it calls `respond`. On the last round the model is told to reply,
 * and if it answers in plain text that's kept as the reply, so a turn always
 * ends with an answer.
 *
 * Thinking is `between_tools` (Sonnet 5.5's way of turning it off: a 400 for
 * `disabled`) at low effort, which suits a short planning chat. Its progress
 * notes come back as thinking blocks and are passed back unchanged.
 */
async function runAssistantTurn({
  client,
  model,
  systemPrompt,
  messages,
  form,
  loadCoverage,
  requestFields = {},
  maxRounds = ASSISTANT_LIMITS.maxRounds,
  maxTokens = ASSISTANT_LIMITS.maxTokens,
}) {
  const conversation = messages.map(({ role, content }) => ({ role, content }));
  const tools = [...LOOKUP_TOOLS, RESPOND_TOOL];
  const activity = [];
  const system = [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];

  for (let round = 0; round < maxRounds; round += 1) {
    const last = round === maxRounds - 1;
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: last && round > 0
        ? [...conversation, { role: "system", content: FINAL_ROUND_INSTRUCTION }]
        : conversation,
      tools,
      tool_choice: { type: "auto" },
      thinking: { type: "between_tools" },
      output_config: { effort: "low" },
      ...requestFields,
    });
    assertNotRefused(response);
    const content = Array.isArray(response?.content) ? response.content : [];
    const toolUses = content.filter((block) => block?.type === "tool_use");
    const respond = toolUses.find((block) => block.name === "respond");
    if (respond) {
      return {
        ...normaliseAssistantReply(respond.input, { fallbackSubject: form.subject }),
        activity: activity.slice(0, ASSISTANT_LIMITS.maxActivities),
      };
    }
    if (!toolUses.length) {
      // The model answered in plain text without the tool: keep the words,
      // with no proposal.
      return {
        ...normaliseAssistantReply({ reply: textOf(content), proposal: null, suggestions: [] }, { fallbackSubject: form.subject }),
        activity: activity.slice(0, ASSISTANT_LIMITS.maxActivities),
      };
    }
    conversation.push({ role: "assistant", content });
    const results = [];
    for (const use of toolUses) {
      let result;
      try {
        result = await runLookupTool(use.name, use.input || {}, { loadCoverage });
      } catch (err) {
        result = { content: `The lookup failed: ${err?.message || "unknown error"}. Carry on without it.`, activity: null, isError: true };
      }
      if (result.activity && !activity.includes(result.activity)) activity.push(result.activity);
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      });
    }
    conversation.push({ role: "user", content: results });
  }
  // The last round still asked for more lookups instead of replying.
  const err = new Error("Resource assistant did not reply");
  err.modelFailure = true;
  throw err;
}

module.exports = {
  ASSISTANT_LIMITS,
  RESPOND_TOOL,
  buildAssistantMessages,
  buildAssistantSystemPrompt,
  normaliseAssistantReply,
  normaliseProposal,
  openingMessage,
  runAssistantTurn,
};
