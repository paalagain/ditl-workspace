# Designer in the loop: onboarding and workflow

Start with the installation steps for your role. Choose either the prompt or terminal option.

<!-- designeritl:role:designer:start -->
## Install as the designer

### With a prompt

1. Open the folder where you want to create prototypes in your agent.
2. If your developer sent you a join prompt, paste that prompt. Otherwise, copy and paste the full [designer setup prompt](https://github.com/paalagain/ditl-workspace/blob/main/prompts/start-designer.md).
3. Follow the agent's instructions to choose platforms and complete GitHub sign-in in your browser.

The prompt works before the skills are installed. The agent helps install missing prerequisites and the designer skills.

### From a terminal

1. Install Node 22.20+ and Git if needed.
2. Run this command in an interactive terminal:

   ```text
   npx --yes github:paalagain/ditl-workspace --role designer
   ```

3. Choose your prototype folder, agent platforms, and installation scope. The installer installs the designer skills and creates or updates this guide.
4. Open that folder in your agent. Paste your developer's join prompt, or the full [designer setup prompt](https://github.com/paalagain/ditl-workspace/blob/main/prompts/start-designer.md), to connect the project. The agent retains your installation choices.

When setup completes, the agent reports your connected project, installed skills, and whether GitHub confirms you are watching the private transport. On first-time setup, the agent turns on watching if GitHub finds no existing subscription. Say “skip watching” during setup if you prefer.

When your developer sends the first work order, check your regular email inbox. GitHub uses your account preferences for email about watched activity. Open the matching local project and run `inbox` for the issue number in the email. If no email arrives, run `inbox` to find the work order.
<!-- designeritl:role:designer:end -->

<!-- designeritl:role:developer:start -->
## Install as the developer

### With a prompt

1. Open your project folder in your agent.
2. If your designer sent you a join prompt, paste that prompt. Otherwise, copy and paste the full [developer setup prompt](https://github.com/paalagain/ditl-workspace/blob/main/prompts/start-developer.md).
3. Follow the agent's instructions to choose platforms, complete GitHub sign-in in your browser, and choose where deliveries are saved.

The prompt works before the skills are installed. The agent helps install missing prerequisites and the developer skills.

### From a terminal

1. Install Node 22.20+ and Git if needed.
2. Run this command in an interactive terminal:

   ```text
   npx --yes github:paalagain/ditl-workspace --role developer
   ```

3. Choose your project folder, agent platforms, and installation scope. The installer installs the developer skills and creates or updates this guide.
4. Open that folder in your agent. Paste your designer's join prompt, or the full [developer setup prompt](https://github.com/paalagain/ditl-workspace/blob/main/prompts/start-developer.md), to connect the project. The agent retains your installation choices.

When setup completes, the agent reports your connected project and installed skills. You can send your first work order with `order`.
<!-- designeritl:role:developer:end -->

## The full picture

The developer sends work orders. The designer shares files, folders or portable prototypes in response. You each work in your own local folder and exchange work through a separate private GitHub repository.

Either role can start the shared project. If you start it, the agent asks for a GitHub account or organisation, a private repository name, and your collaborator's GitHub username. It creates the repository, invites your collaborator, and gives you a join prompt to send them. If you join, use the prompt your collaborator sent you.

Project settings and progress are saved in `.designeritl/` in your selected folder. GitHub CLI manages authentication. The shared repository carries work orders and deliveries without a local clone or access to the developer's product code.

The complete setup instructions are bundled in the inbox skill's `references/setup.md`, under the skill directory reported by the installer.

## Everyday workflow

Use your agent's skill invocation, for example `$name` in Codex or `/name` in Claude Code. Each action runs when you explicitly request it.

Collaboration skills exchange work with your collaborator. Toolbox skills help manage your local prototype design.

| Category | Action | Who uses it | What it does |
| --- | --- | --- | --- |
| Collaboration | `inbox` | Both | Finds work and starts/resumes an order, or receives verified deliveries. |
| Collaboration | `order` | Developer | Sends a work order, linked feedback, or a cancellation request. |
| Collaboration | `send` | Designer | Sends chosen files, folders or a numbered prototype as work in progress. |
| Collaboration | `send-final` | Designer | Reassesses the agreed tasks, delivers a chosen version, and closes the order. |
| Toolbox | `new-version` | Designer | Creates a new working prototype version. |

For an early design pass, run `/send screenshots/ notes.md` in Claude Code or `$send screenshots/ notes.md` in Codex. The agent packages the selected files for the open work order. The developer uses the updated Inbox skill to receive them and see the installed folder.

For designers, `inbox` continues the active order or starts the only available order. With several choices it asks which one. Use `inbox check only` to review without starting work. A named order switches assignments while keeping saved progress. Starting from scratch creates the first empty prototype; no existing design is required. If the project folder is missing, open it and continue with the understood order. Use a setup or join prompt above for onboarding.

A final delivery records the designer's completion decision. The developer reviews and accepts the result separately. Each delivered prototype opens directly from its own files.
