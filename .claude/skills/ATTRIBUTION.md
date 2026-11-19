# Skill Attribution

The following skills were installed from third-party sources.

## superpowers
- Source: https://github.com/obra/superpowers
- Author: Jesse Vincent (obra)
- License: MIT (see `LICENSE.superpowers`)
- Version: 6.0.1 (commit a21956e)
- Installed: 2026-06-17
- Skills: brainstorming, dispatching-parallel-agents, executing-plans,
  finishing-a-development-branch, receiving-code-review, requesting-code-review,
  subagent-driven-development, systematic-debugging, test-driven-development,
  using-git-worktrees, using-superpowers, verification-before-completion,
  writing-plans, writing-skills

## taste-skill
- Source: https://github.com/Leonxlnx/taste-skill
- Author: leonxlnx
- License: MIT (see `LICENSE.taste-skill`)
- Version: 1.0.0 (commit 01d8504)
- Installed: 2026-06-17
- Skills: brandkit, output-skill (full-output-enforcement),
  redesign-skill (redesign-existing-projects), taste-skill (design-taste-frontend)
- Removed 2026-10-01 (overlapping, mostly React/Tailwind-oriented, gave conflicting style
  rules): brutalist-skill, gpt-tasteskill, image-to-code-skill, imagegen-frontend-mobile,
  imagegen-frontend-web, minimalist-skill, soft-skill, stitch-skill, taste-skill-v1.
  Two design skills are kept, for the marketing pages only (not the editor), expressed
  as vanilla HTML/CSS: `taste-skill` for building new pages (it built /merge/,
  /studio-intelligence/ and the changelog), `redesign-skill` for polishing existing ones.

## stitch-skills
- Source: https://github.com/google-labs-code/stitch-skills
- Author: Google Labs
- License: Apache-2.0 (see `LICENSE.stitch-skills`)
- Version: commit 4cf4db8
- Installed: 2026-11-19
- Skills: extract-design-md (copied unmodified from
  `plugins/stitch-design/skills/extract-design-md/`)
- Only this one skill is kept. It reads the codebase and writes a DESIGN.md, and
  needs no Stitch account. The other 15 skills in the source (Stitch MCP tools,
  React / React Native / shadcn / Remotion builders, `taste-design`) were left out:
  they need the Stitch MCP server or target other stacks.

These were vendored directly into `.claude/skills/` (rather than installed via the
Claude Code plugin marketplace) so they are version-controlled and available to all
sessions on this repo, including Claude Code on the web.
