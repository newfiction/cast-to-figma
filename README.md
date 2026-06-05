# Cast to Figma Skill

Agent skill for using [Cast to Figma](https://github.com/newfiction/cast-to-figma) from coding-agent harnesses.

This repo contains the skill instructions only. Install the CLI separately.

## Requirements

```bash
npm install -g @newfiction/cast-to-figma
```

You can also try the CLI without global install:

```bash
npx -y @newfiction/cast-to-figma status
```

For regular agent work, global install is recommended because agents call the CLI repeatedly.

## Install the skill

Clone this repo into your agent skills directory:

```bash
git clone https://github.com/newfiction/cast-to-figma-skill ~/.agents/skills/cast-to-figma
```

If your harness uses another skill directory, clone it there instead.

## Update

```bash
cd ~/.agents/skills/cast-to-figma
git pull
```

## Version

The skill metadata is declared in `SKILL.md` frontmatter:

```yaml
version: 0.1.0
requiresCli: ">=0.1.0"
cliPackage: "@newfiction/cast-to-figma"
cliBinary: "cast-to-figma"
```

## Links

- CLI repo: https://github.com/newfiction/cast-to-figma
- npm package: https://www.npmjs.com/package/@newfiction/cast-to-figma

## License

MIT
