# AI conversation and tool views

The React AI workspace uses an analyst with tools followed by a conversational writer. Both use the configured ModelProvider. Ordinary conversation and follow-ups in the same chart context can use the writer directly. The chart interpretation action uses the same pipeline as chat.

## Tool contract

Built-in tools return `toolResult(content, kind, data, extra)`. `ToolProvider.listTools()` decorates DynamicStructuredTools with LangChain's `content_and_artifact` response format. The model receives `content`; the app receives and persists the artifact separately.

An artifact has `version`, `providerId`, `tool`, `kind`, `data`, optional `facts`, and optional `sources`. Legacy tools and histories with string results continue through generic views. MCP tools cannot register executable frontend components through their output.

Register local React components in `toolViews/registerToolViews.tsx`:

```tsx
toolUserViews.register('module', 'tool_name', 1, {
  InputUserView: MyInputView,
  OutputUserView: MyOutputView,
});
```

Input and output registrations are independent. Components receive `{ call, data, context }`. Unknown registrations/versions or render errors fall back to nested tables and readable text. Heavy chart code loads only when a tool card is expanded. Chart previews use isolated interaction state; enlarged views reuse the SVG renderer and data explorer.

## Evidence contract

Knowledge and web tools provide SourceSnapshots containing a stable content-derived ID, document identity, version hash, exact text, and available location metadata. Missing bibliographic information is never synthesized. Snapshot copies are saved with tool calls and reports so later knowledge-base edits cannot change historical quotations.

The analyst emits JSON findings with `factRefs` and `sourceIds`. `AnalysisProtocol.parseReport` resolves them against actual tool artifacts and rejects nonexistent references or unsupported professional claims. Invalid reports get one repair attempt; continued invalid output fails visibly.

The writer receives verified findings and source excerpts rather than the analyst's raw tool message history. It emits inline links such as `[判据 1](evidence:E1)`. Rendering resolves each link against that message's persisted AnalysisReport, showing exact facts, full source snapshots, limitations and questions. Unknown IDs are visibly unverified. Evidence IDs are scoped to a message; SourceSnapshot IDs are stable across retrievals.

## Context and compression

Complete messages, artifacts and reports remain in AiSessionStore. `contextSummary` stores an independent summary, the number of covered messages, and a hash of that exact prefix. Editing an earlier message invalidates its summary; forks before the summary boundary cannot inherit it. Summary commits reject changed prefixes.

ContextUsageBar includes draft text/attachments in the next-request estimate. Above 70% it exposes manual compression. Before input consumes the reserved reply budget and safety margin, the main process attempts persistent history compression. ContextManager also checks every analyst iteration and writer request, including new tool results. Oversized completed tool messages can be summarized while retaining call IDs and original artifacts. Recent turns and tool-call pairing survive. Failures leave raw history intact and show an error.

Compression is a bounded model request using the same credentials/model. Long histories are summarized in chunks, retaining user-confirmed facts, corrections, interpretations, evidence references and open questions. `recall_conversation` and `read_tool_result` restore relevant original records from the current session only. Stop cancels generation or summarization. Per-session locks prevent concurrent compression/sending; request IDs exclude late events from previous replies.

Token counts are conservative UTF-8-based estimates, not a model-specific tokenizer. Unknown model windows display “unknown” and can be set in AI settings. `MaxTokens = 0` removes the application's extra output cap; provider/model limits still apply. Automatic budgeting recalculates the remaining output allowance per request.

## Verification

- `node --test tests/AiConversationPipeline.test.js tests/AiContextIpc.test.js tests/AiSessionStore.test.js tests/TokenBudget.test.js`
- `npm run test:renderer` and `npm run typecheck`
- `npm run smoke:workbench` validates Electron tool previews, evidence, manual compression, long-message scrolling and live window resizing with isolated test data.

Pipeline tests use real LangGraph/LangChain against a local simulated HTTP API. They do not call the user's remote model service.

## Public activity and reading preferences

`AiService.chat` emits `activity` events alongside pipeline stages. The status header stays visible before the first answer token and while the message log scrolls. It combines the actual phase, the current question or knowledge query, in-flight tool names, completed tool counts and elapsed time. It does not stream private reasoning or invent a completion percentage. Request IDs and session filtering apply to activity events as well as text.

AI reading preferences live in the existing local preferences store (`chillast.aiReading`), independently of API/model configuration. Font family (including installed custom fonts), font size, line height, paragraph spacing, letter spacing and maximum text width update CSS variables immediately and survive restart. Imported values are validated and clamped; font names cannot inject CSS declarations. Settings provides presets and a preview using the actual Markdown/evidence components.

Markdown uses the MIT-licensed [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) in a lower-priority CSS layer, with application theme tokens overriding its OS-driven palette. Selected light/dark themes control all message, tool and evidence surfaces. Evidence buttons explicitly reset the global control height so they align within a line of text.

## Calculation and angular display consistency

The main chart IPC and built-in Western AI tools share the same `AstrologyService` instance. The shipped `config.json` selects `swisseph`; the factory fails when that backend is unavailable, without silently switching to `HoroscopeAdapter`. That legacy adapter remains an explicitly selected alternative and a UI smoke-test fixture. Planet positions and house cusps use Swiss Ephemeris; aspects and derived charts use the application's geometric/strategy calculations on those positions. Chinese astrology has its own service.

AI computation tools receive a request-local snapshot of the accepted chart settings. They inherit house system, zodiac and aspect settings from the successful workspace result, rather than an uncalculated draft. An explicit interpretation chart supplies its own settings. All Western computation tools accept optional `settings.houseSystem` and `settings.zodiac` overrides; without a workspace result, the defaults are Placidus/tropical. Changing the UI during generation cannot alter a running request's defaults.

`src/shared/DegreeFormat.js` formats raw decimal angles as degrees/minutes for the data grid, model chart serialization and newly generated evidence facts. Decimal degrees remain unchanged in chart DTOs and exports. The serializer includes the DTO's top-level houses/angles, calculation settings and UTC instant. Historical evidence snapshots remain as originally recorded.

The screenshot regression is pinned at local 2004-07-07 11:15, coordinates 26.6/104.8333: UTC 03:15, Moon longitude 348.9872°, Pisces 18°59′14″, house 6 under Placidus/tropical. `18.99°` was the same within-sign value rounded to two decimal places. `AstroCalculationConsistency.test.js` compares all five Western AI tools with direct Swiss service requests under both Placidus/tropical and whole-sign/Lahiri settings.
