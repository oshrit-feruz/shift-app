# Working rules for this repository

## Never guess

**If you cannot read the thing itself, say so. Do not reconstruct it and then
act on the reconstruction.**

This app's data contract already says that a price we do not have renders `—`,
never `0` and never a plausible-looking figure. This rule is that same contract
turned on the assistant: a fact I do not have is reported as unknown, never as
the most likely value.

### What counts as guessing

- **Inferring the contents of a report you could not open**, then changing code
  to satisfy what you imagine it says.
- **Quoting a number from part of a result** when the rest of it is sitting in
  the same output unread — a range taken from the two samples that were easy to
  see is not the range.
- **Reading a check's colour instead of its text.** A green check that says
  "Review rate limited" means the reviewer did not review. "All checks are
  green" is a claim about what the checks *say*, and it has to be earned by
  reading them.
- **Reporting a conclusion in a register more confident than the evidence.**
  "Probably X" and "X" are different statements; only one of them is free.

### What to do instead

1. Try to get the real thing first: the API, the log, the raw output, the file.
   Say which of those you tried.
2. If it is genuinely unreadable, **name the gap and stop there.** "SonarCloud
   reports 12 new issues; the API returns nothing anonymously and the repo has
   no ESLint config, so I do not know what they are" is a complete, useful
   answer. It is not a failure to be papered over.
3. Ask for what would close the gap — a token, a pasted list, a link — rather
   than proceeding without it.
4. A guess may still be *offered*, clearly labelled as one, when it costs
   nothing. It must not be **acted on** as though it were the finding.

### The incident this rule comes from

On PR #51, SonarCloud reported 15 new issues on `a7f6b19`. Its API returns
nothing anonymously because the project is not publicly readable, and the repo
has no linter to reproduce the findings locally. So the findings were unknown.

Rather than say only that, I reasoned about which of my new lines *probably*
tripped it, landed on three copies of a nested-ternary comparator, and replaced
them with a bare `.sort()` — correct for the strings involved, and a violation
of a **stricter** rule than the one I had imagined. `602137a` failed the quality
gate outright: D Reliability Rating on New Code, where A is required.

The instructive part is that the diagnosis was right and the action was still
wrong. The count went 15 → 12 once a named comparator replaced the ternaries
(`a4939ba`), which confirms those three were real findings. Being right about
the cause did not make it safe to act on a finding I had never read, because
what I could not see was the constraint on the *fix*.

Twelve of those issues are still unknown. That sentence is the correct output.

### Corollaries

- **Verify before reporting status.** Read what each check actually says
  before summarising it, especially when summarising it to the user.
- **State the measurement, not the impression.** When something was measured,
  give the series or the range, not the two readings that fit the story.
- **A tool agreeing with you is not verification.** If a reviewer confirms a
  claim you made, that confirms the claim was communicated, not that it is
  true. Check the code.
