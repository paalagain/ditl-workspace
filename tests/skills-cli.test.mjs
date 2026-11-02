import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedSkillCount, interactiveEnvironment } from '../tools/skills-cli.mjs';

test('native completion count survives terminal styling and optional follow-up suggestions', () => {
  assert.equal(completedSkillCount('\u001b[32mo  Installed 2 skills\u001b[0m\nDone!'), 2);
  assert.equal(completedSkillCount('Installed 5 skills\nFailed to install find-skills. You can try again later.'), 5);
});

test('native cancellation, partial failures and missing completion cannot become installation success', () => {
  for (const output of ['Installation cancelled', 'Installed 1 skill\nFailed to install 1', 'Installation failed', 'Done!']) {
    assert.throws(() => completedSkillCount(output), /cancelled|did not complete/);
  }
});

test('a project path mentioning cancellation or installation failure is not a native status message', () => {
  assert.equal(completedSkillCount('o Source: C:/fixtures/Installation cancelled/project\n| C:/fixtures/Installation failed/project\no Installed 2 skills -------+'), 2);
});

test('interactive child does not inherit implicit auto-confirmation markers or change the parent environment', () => {
  const parent = {
    CODEX_THREAD_ID: 'fixture', CLAUDECODE: '1', AI_AGENT: 'codex', COPILOT_GITHUB_TOKEN: 'fixture-only',
    GH_TOKEN: 'fixture-auth', CLAUDE_CONFIG_DIR: 'fixture-profile', XDG_STATE_HOME: 'fixture-state',
  };
  const child = interactiveEnvironment(parent);
  for (const name of ['CODEX_THREAD_ID', 'CLAUDECODE', 'AI_AGENT', 'COPILOT_GITHUB_TOKEN']) assert.equal(child[name], undefined);
  assert.equal(child.GH_TOKEN, parent.GH_TOKEN);
  assert.equal(child.CLAUDE_CONFIG_DIR, parent.CLAUDE_CONFIG_DIR);
  assert.equal(child.XDG_STATE_HOME, parent.XDG_STATE_HOME);
  assert.equal(child.DISABLE_TELEMETRY, '1');
  assert.equal(parent.CODEX_THREAD_ID, 'fixture');
  assert.equal(parent.COPILOT_GITHUB_TOKEN, 'fixture-only');
});
