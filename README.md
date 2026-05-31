# dprof-claude-plugins

A small collection of [Claude Code](https://claude.com/claude-code) plugins by
Johan Hedlund, published as a single marketplace.

## Install

```
/plugin marketplace add dprof-johan/dprof-claude-plugins
/plugin install <plugin>@dprof-claude-plugins
```

## Plugins

| Plugin | What it does |
|---|---|
| [`dev-chronicler`](plugins/dev-chronicler/) | Keeps an automatic decision/action/handover chronicle that doubles as agent handover memory. |

## Repo layout

```
.claude-plugin/marketplace.json   # the marketplace: lists each plugin by path
plugins/<name>/                   # one self-contained plugin per directory
  └── .claude-plugin/plugin.json
```

Each plugin's `source` in the marketplace manifest is a relative path
(`./plugins/<name>`), so the same manifest works whether the marketplace is
added from a local clone or from GitHub. To list a single plugin from this repo
in an external marketplace, reference it with a `git-subdir` source:

```json
{ "source": "git-subdir", "url": "dprof-johan/dprof-claude-plugins", "path": "plugins/dev-chronicler" }
```

## Development

```bash
# validate the marketplace + all plugin manifests, from repo root:
claude plugin validate .

# per-plugin tests:
cd plugins/dev-chronicler && node --test
```
