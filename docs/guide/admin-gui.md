# Admin GUI

The standalone `@portaidentity/cli` package retains the `porta gui` command for compatibility. The command attempts to launch an optional local web interface connected to a remote Porta server.

::: warning Current availability
The former Admin GUI source workspace is not part of the current Porta monorepo. If the optional GUI is unavailable in your installation, `porta gui` exits with guidance instead of starting a web interface.

Use the [Porta CLI](/cli/overview) for supported administration workflows.
:::

## Launch the Optional GUI

Authenticate the CLI, then run the retained command:

```bash
porta login --server https://porta.example.com:3443
porta gui
```

The command forwards your configured server URL and the relevant global CLI options to the optional GUI when it is installed.

### Options

| Option | Default | Description |
|---|---|---|
| `--server <url>` | Saved CLI server | Porta server URL |
| `--port <number>` | `4002` | Local web-interface port |
| `--no-open` | `false` | Do not open a browser automatically |
| `--insecure` | `false` | Allow a self-signed server certificate |

## Troubleshooting

### The GUI package is unavailable

This means the retained command could not find its optional GUI dependency. Continue with the supported CLI commands documented in the [CLI reference](/cli/overview).

### Authentication fails

1. Confirm that `porta login` succeeds against the same server.
2. Verify that the server URL is reachable from your workstation.
3. For a local server with a self-signed certificate, retry with `--insecure`.
