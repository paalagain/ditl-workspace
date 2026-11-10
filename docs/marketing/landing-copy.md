## Hero Section

**Eyebrow:** DESIGNER IN THE LOOP

**Headline:** Give design its own space. Hand off working HTML.

**Subheadline:** Explore ideas in self-contained HTML prototypes, with skills for Claude Code and Codex that help you keep versions and exchange work with your developer.

**Primary CTA:** `[ Set Up Your Design Workspace ]`
**Secondary CTA:** `[ Read the Workflow → ]`

```text
Developer                  Private GitHub Repo               Designer Workspace
/order ──────────────────► Work order ─── /inbox          ──► Local checklist
/inbox ◄────────────────── Delivery ◄──── /send or /send-final ── Version folder
```

---

## Give Your Ideas Room to Take Shape

Design decisions are easier to discuss when people can open the prototype and try it. A dedicated workspace lets you explore layouts and interactions while your developer continues working in the product repository.

**Designer in the Loop** connects that design space to development:

- **Prototypes you can open directly.** Each version is a folder with `index.html` and local assets. Double-click to open it, with no build step or network dependencies.
- **A shared place for handoffs.** Work orders and deliveries travel through a separate private GitHub repository. Designers work without running Git or accessing the product code.

---

## How the Loop Works

### 1. Send a clear work order

The developer runs `/order` to send a goal and a numbered checklist. Feedback requesting more work becomes a new order linked to the earlier one.

### 2. Bring the work into your workspace

The designer runs `/inbox` to see new and changed work orders and begin work. It resumes the active order or starts the only available order, asking when several choices remain. Use `/inbox check only` to review without starting. The designer's agent ticks off tasks locally as it works.

### 3. Explore another version

Run `/new-version` to copy the most recently edited version folder into the next version number, or use `from vN` to start from an earlier one. Make a new version before changes you may want to undo.

### 4. Share progress or send the final version

Run `/send` to share selected files, folders or a numbered prototype version. For a first pass, send your screenshots and notes directly.

When the work is finished, `/send-final` reassesses the agreed tasks against the version you choose. Review unfinished work and explicitly acknowledge any tasks you want to deliver unchecked. The final delivery closes the order after publication.

### 5. Pick up the delivery in your project

The developer runs `/inbox` to download new deliveries into the folder configured for the project. Each delivery preserves the captured folder structure and identifies its work order. A manifest records the contents, whether the delivery is final, a timestamp and file checksums.

---

## Command Reference

You decide when to pull work, make a version, or send a delivery. Each action starts with an explicit command.

| Command | Role | What It Does |
| ------- | ---- | ------------ |
| `/inbox` | Both | Designer: finds work and starts or resumes an order; `check only` reviews without starting. Developer: downloads new deliveries into the configured project folder and shows their work orders. |
| `/order` | Developer | Sends a goal and numbered task checklist, or feedback as a new linked order. |
| `/new-version` | Designer | Copies the most recently edited version folder into the next number, or starts from an earlier version with `from vN`. |
| `/send` | Designer | Delivers chosen files, folders or a numbered prototype version. |
| `/send-final` | Designer | Asks which version to send, reassesses agreed tasks, records completion, sends the final delivery, and closes the active order. |

---

## Start with a Prompt

Either the designer or developer can start a project in Claude Code or Codex. Paste the start prompt into your agent. It installs the prerequisites and skills for your role, guides you through GitHub sign-in, creates the private handoff repository, and prepares an invitation for your collaborator.

Your collaborator pastes the join prompt into their own agent, reviews the repository invitation, and confirms before accepting. They then run `/inbox` to check the connection.

Developers install just the developer skills, `/order` and `/inbox`, alongside Node and the GitHub CLI. The design workspace stays with the designer.

---

## Bottom CTA Section

**Headline:** Make your next handoff a working prototype.
**Subheadline:** Set up a design workspace, invite your collaborator, and exchange work orders and HTML versions from the agents you already use.

**Primary CTA:** `[ Set Up Your Design Workspace ]`
**Secondary CTA:** `[ Read the Workflow → ]`
